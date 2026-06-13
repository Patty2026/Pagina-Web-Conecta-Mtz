import { auth, db, crearPerfilUsuario } from './firebase-service.js';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const BASIC_ADMIN_EMAIL = 'adminb@gmail.com';
const DEFAULT_CENTER = [20.0700, -97.0600];

let unsubscribeIncidents = null;
let unsubscribeAdmins = null;
let unsubscribeStats = null;
let unsubscribeUsers = null;
let adminMap = null;
let markersLayer = null;
let incidentCache = [];
let adminCache = [];
let userCache = [];
let currentStatus = 'todos';
let editingAdminEmail = null;
let latestStats = null;
let lastSyncDate = null;
let refreshCountTimer = null;

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function email() {
  const stored = getStoredProfile();
  return String(auth.currentUser?.email || stored.correo || stored.email || '').toLowerCase();
}

function role() {
  if (email() === SUPERADMIN_EMAIL) return 'Superadmin';
  if (email() === BASIC_ADMIN_EMAIL) return 'Administrador';
  return window.getCurrentAdminRole?.() || null;
}

function isAdmin() {
  return ['Superadmin', 'Administrador'].includes(role());
}

function isSuperadmin() {
  return role() === 'Superadmin';
}

function safeEmailId(value = '') {
  return String(value).trim().toLowerCase().replaceAll('.', '_');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusKey(status = 'pendiente') {
  const value = String(status).trim().toLowerCase();

  if (value.includes('cancel')) return 'cancelado';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'resuelto';
  if (value.includes('proceso')) return 'en_proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'en_proceso';

  return 'pendiente';
}

function statusLabel(status = 'pendiente') {
  const key = statusKey(status);
  const labels = {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
    cancelado: 'Cancelado'
  };

  return labels[key] || 'Pendiente';
}

function statusIcon(status = 'pendiente') {
  const key = statusKey(status);
  const icons = {
    pendiente: '🟡',
    en_proceso: '🔵',
    resuelto: '✅',
    cancelado: '⚫'
  };

  return icons[key] || '🟡';
}

function coords(report) {
  const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
  const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function fechaMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

function isToday(value) {
  const ms = fechaMillis(value);
  if (!ms) return false;

  const date = new Date(ms);
  const today = new Date();

  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setField(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || '';
}

function formatDate(value) {
  if (!value) return 'Sin registro';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString('es-MX');
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleString('es-MX');
  return 'Sin registro';
}

function timeAgo(date = lastSyncDate) {
  if (!date) return 'Sincronizando datos...';

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (seconds < 10) return 'Última actualización: ahora';
  if (seconds < 60) return `Última actualización: hace ${seconds} segundos`;

  const minutes = Math.round(seconds / 60);
  return `Última actualización: hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

function updateSyncText() {
  setText('adminCleanSyncStatus', timeAgo());
  setText('adminReportsSyncStatus', timeAgo());
}

function getFallbackMetrics() {
  const total = incidentCache.length;
  const today = incidentCache.filter(item => isToday(item.fechaRegistro || item.fecha || item.createdAt)).length;
  const pending = incidentCache.filter(item => statusKey(item.estado) === 'pendiente').length;
  const inProcess = incidentCache.filter(item => statusKey(item.estado) === 'en_proceso').length;
  const resolved = incidentCache.filter(item => statusKey(item.estado) === 'resuelto').length;
  const cancelled = incidentCache.filter(item => statusKey(item.estado) === 'cancelado').length;
  const adminsActive = adminCache.filter(item => String(item.estado || 'Activo').toLowerCase() === 'activo').length;

  return {
    totalIncidencias: total,
    incidenciasHoy: today,
    pendientes: pending,
    enProceso: inProcess,
    resueltos: resolved,
    cancelados: cancelled,
    usuarios: latestStats?.usuarios ?? userCache.length,
    administradores: latestStats?.administradores ?? adminCache.length,
    administradoresActivos: latestStats?.administradoresActivos ?? adminsActive
  };
}

function getMetrics() {
  if (!latestStats) return getFallbackMetrics();

  const fallback = getFallbackMetrics();

  return {
    totalIncidencias: latestStats.totalIncidencias ?? latestStats.total ?? fallback.totalIncidencias,
    incidenciasHoy: latestStats.incidenciasHoy ?? fallback.incidenciasHoy,
    pendientes: latestStats.pendientes ?? fallback.pendientes,
    enProceso: latestStats.enProceso ?? latestStats.en_proceso ?? fallback.enProceso,
    resueltos: latestStats.resueltos ?? fallback.resueltos,
    cancelados: latestStats.cancelados ?? fallback.cancelados,
    usuarios: latestStats.usuarios ?? fallback.usuarios,
    administradores: latestStats.administradores ?? fallback.administradores,
    administradoresActivos: latestStats.administradoresActivos ?? latestStats.adminActivos ?? fallback.administradoresActivos
  };
}

function metricCard(icon, label, value, id) {
  return `
    <article class="admin-metric-card">
      <span class="admin-metric-icon">${icon}</span>
      <div>
        <b id="${id}">${value}</b>
        <small>${label}</small>
      </div>
    </article>
  `;
}

function ensureAdminBottomNavigation() {
  if (!isAdmin()) return;

  const navHtml = current => `
    <button ${current === 'adminScreen' ? 'class="active"' : ''} data-go="adminScreen">Panel</button>
    <button ${current === 'mapScreen' ? 'class="active"' : ''} data-go="mapScreen">Mapa</button>
    <button ${current === 'trackingScreen' ? 'class="active"' : ''} data-go="trackingScreen">Reportes</button>
    <button ${current === 'profileScreen' ? 'class="active"' : ''} data-go="profileScreen">Perfil</button>
  `;

  ['adminScreen', 'mapScreen', 'trackingScreen', 'profileScreen'].forEach(screenId => {
    const screen = document.getElementById(screenId);
    if (!screen) return;

    let nav = screen.querySelector('.bottom-nav');

    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      screen.appendChild(nav);
    }

    nav.innerHTML = navHtml(screenId);
  });
}

function cleanAdminActionCards() {
  const title = document.querySelector('#adminScreen h3');
  if (title && title.textContent.toLowerCase().includes('acciones')) {
    title.textContent = 'Panel administrativo';
  }

  document.querySelectorAll('#adminScreen .quick-grid button').forEach(button => {
    const text = button.textContent.toLowerCase();

    if (text.includes('notificacion') || text.includes('notificación')) {
      button.remove();
      return;
    }

    if (text.includes('reporte')) {
      button.dataset.go = 'trackingScreen';
      button.innerHTML = '📋<span>Reportes</span>';
    }

    if (text.includes('mapa')) {
      button.dataset.go = 'mapScreen';
      button.innerHTML = '🗺️<span>Mapa</span>';
    }

    if (text.includes('administrador')) {
      button.dataset.adminTab = 'admins';
      button.setAttribute('data-superadmin-only', '');
      button.innerHTML = '👥<span>Administradores</span>';
    }
  });
}

function ensurePanel() {
  const adminScreen = document.getElementById('adminScreen');
  if (!adminScreen) return;

  ensureAdminBottomNavigation();
  cleanAdminActionCards();

  if (document.getElementById('adminCleanRoot')) {
    applyVisibility();
    renderAll();
    return;
  }

  const root = document.createElement('section');
  root.id = 'adminCleanRoot';
  root.innerHTML = `
    <div class="tabs admin-window-tabs">
      <button class="active" type="button" data-admin-tab="summary">Resumen</button>
      <button type="button" data-admin-tab="incidents">Incidencias</button>
      <button type="button" data-admin-tab="admins" data-superadmin-only>Administradores</button>
      <button type="button" data-admin-tab="users" data-superadmin-only>Usuarios</button>
    </div>

    <section id="adminSummaryTab" class="admin-clean-tab">
      <div class="section-title">
        <h3>Resumen general</h3>
        <small id="adminCleanSyncStatus">Sincronizando datos...</small>
      </div>

      <div class="admin-metrics-grid" id="adminMetricsGrid">
        ${metricCard('📊', 'Total de incidencias', 0, 'metricTotalIncidents')}
        ${metricCard('📅', 'Incidencias de hoy', 0, 'metricTodayIncidents')}
        ${metricCard('🟡', 'Pendientes', 0, 'metricPendingIncidents')}
        ${metricCard('🔵', 'En proceso', 0, 'metricProcessIncidents')}
        ${metricCard('✅', 'Resueltas', 0, 'metricResolvedIncidents')}
        ${metricCard('👤', 'Usuarios registrados', 0, 'metricUsersCount')}
        ${metricCard('🛡️', 'Administradores activos', 0, 'metricActiveAdmins')}
      </div>

      <div class="admin-data-card">
        <h3>Actividad reciente</h3>
        <div id="adminRecentActivity" class="admin-live-list">
          <small>Sincronizando datos...</small>
        </div>
      </div>
    </section>

    <section id="adminIncidentsTab" class="admin-clean-tab" style="display:none">
      <div class="section-title">
        <h3>Incidencias</h3>
        <small id="adminIncidentsSummary">Sincronizando incidencias...</small>
      </div>

      <div class="tabs admin-status-tabs">
        <button class="active" type="button" data-panel-status="todos">Todos</button>
        <button type="button" data-panel-status="pendiente">Pendientes</button>
        <button type="button" data-panel-status="en_proceso">En proceso</button>
        <button type="button" data-panel-status="resuelto">Resueltos</button>
        <button type="button" data-panel-status="cancelado">Cancelados</button>
      </div>

      <div id="adminCleanIncidents" class="admin-live-list">
        <small>Sincronizando incidencias...</small>
      </div>
    </section>

    <section id="adminManagersTab" class="admin-clean-tab" style="display:none" data-superadmin-only>
      <div class="section-title">
        <h3>Administradores</h3>
        <small>Gestiona administradores, roles, accesos y estados.</small>
      </div>

      <div class="admin-mini-metrics">
        <span id="adminManagersRegistered">0 registrados</span>
        <span id="adminManagersActive">0 activos</span>
        <span id="adminManagersInactive">0 inactivos</span>
      </div>

      <div class="tabs admin-crud-tabs">
        <button class="active" type="button" data-admin-crud-tab="list">Lista</button>
        <button type="button" data-admin-crud-tab="form">Crear / editar</button>
        <button type="button" data-admin-crud-tab="history">Historial</button>
      </div>

      <section id="adminCrudList" class="admin-crud-section">
        <div class="section-title">
          <h3>Lista de administradores</h3>
          <small id="adminManagersCount">Sincronizando administradores...</small>
        </div>
        <div id="adminCleanManagers" class="admin-live-list">
          <small>Sincronizando administradores...</small>
        </div>
      </section>

      <section id="adminCrudForm" class="admin-crud-section" style="display:none">
        <form id="adminCleanForm" class="app-form admin-crud-form">
          <input id="adminEditMode" type="hidden" value="create">

          <label>Correo</label>
          <input id="adminCleanEmail" type="email" placeholder="admin@correo.com" required>

          <label>Nombre</label>
          <input id="adminCleanName" type="text" placeholder="Nombre del administrador" required>

          <label>Teléfono</label>
          <input id="adminCleanPhone" type="tel" placeholder="Ej. 2321234567">

          <label>Rol</label>
          <select id="adminCleanRole">
            <option value="Administrador">Administrador básico</option>
            <option value="Superadmin">Superadmin</option>
          </select>

          <label>Estado</label>
          <select id="adminCleanStatus">
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>

          <label>Área o responsabilidad</label>
          <input id="adminCleanArea" type="text" placeholder="Ej. Seguimiento de incidencias">

          <label>Observaciones</label>
          <textarea id="adminCleanNotes" placeholder="Notas internas del administrador"></textarea>

          <div class="dual-actions">
            <button class="main-btn" type="submit" id="adminCleanSubmit">Guardar administrador</button>
            <button type="button" id="adminCleanCancelEdit">Limpiar</button>
          </div>

          <small id="adminCleanMessage"></small>
        </form>
      </section>

      <section id="adminCrudHistory" class="admin-crud-section" style="display:none">
        <div class="section-title">
          <h3>Historial de accesos y acciones</h3>
          <small>Último acceso y cambios realizados.</small>
        </div>
        <div id="adminAccessHistory" class="admin-live-list">
          <small>No hay historial registrado todavía.</small>
        </div>
      </section>
    </section>

    <section id="adminUsersTab" class="admin-clean-tab" style="display:none" data-superadmin-only>
      <div class="section-title">
        <h3>Usuarios</h3>
        <small id="adminUsersSummary">Usuarios registrados en tiempo real.</small>
      </div>
      <div id="adminCleanUsers" class="admin-live-list">
        <small>Presiona la pestaña Usuarios para sincronizar la lista.</small>
      </div>
    </section>
  `;

  const nav = adminScreen.querySelector('.bottom-nav');
  adminScreen.insertBefore(root, nav || null);

  root.addEventListener('click', handlePanelClick);
  document.getElementById('adminCleanForm')?.addEventListener('submit', saveAdmin);
  document.getElementById('adminCleanCancelEdit')?.addEventListener('click', clearAdminForm);

  applyVisibility();
  renderAll();
}

function showPanelTab(tabName) {
  const map = {
    summary: 'adminSummaryTab',
    incidents: 'adminIncidentsTab',
    admins: 'adminManagersTab',
    users: 'adminUsersTab'
  };

  if ((tabName === 'admins' || tabName === 'users') && !isSuperadmin()) return;

  Object.entries(map).forEach(([key, id]) => {
    const section = document.getElementById(id);
    if (section) section.style.display = key === tabName ? '' : 'none';
  });

  document.querySelectorAll('[data-admin-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminTab === tabName);
  });

  if (tabName === 'admins') {
    showCrudSection('list');
    subscribeAdmins();
  }

  if (tabName === 'users') {
    subscribeUsers();
  }
}

function showCrudSection(sectionName) {
  const map = {
    list: 'adminCrudList',
    form: 'adminCrudForm',
    history: 'adminCrudHistory'
  };

  Object.entries(map).forEach(([key, id]) => {
    const section = document.getElementById(id);
    if (section) section.style.display = key === sectionName ? '' : 'none';
  });

  document.querySelectorAll('[data-admin-crud-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminCrudTab === sectionName);
  });
}

function handlePanelClick(event) {
  const tab = event.target.closest('[data-admin-tab]');
  if (tab) {
    showPanelTab(tab.dataset.adminTab);
    return;
  }

  const crudTab = event.target.closest('[data-admin-crud-tab]');
  if (crudTab) {
    showCrudSection(crudTab.dataset.adminCrudTab);
    return;
  }

  const statusButton = event.target.closest('[data-panel-status]');
  if (statusButton) {
    currentStatus = statusButton.dataset.panelStatus;
    document.querySelectorAll('[data-panel-status]').forEach(button => {
      button.classList.toggle('active', button === statusButton);
    });
    renderIncidents(incidentCache);
    return;
  }

  const edit = event.target.closest('[data-admin-edit]');
  if (edit) {
    loadAdminToForm(edit.dataset.adminEdit);
    showCrudSection('form');
  }
}

function applyVisibility() {
  document.querySelectorAll('[data-superadmin-only]').forEach(element => {
    element.style.display = isSuperadmin() ? '' : 'none';
  });

  if (!isSuperadmin()) {
    ['adminManagersTab', 'adminUsersTab'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    });
  }
}

function renderMetrics() {
  const metrics = getMetrics();

  setText('metricTotalIncidents', metrics.totalIncidencias);
  setText('metricTodayIncidents', metrics.incidenciasHoy);
  setText('metricPendingIncidents', metrics.pendientes);
  setText('metricProcessIncidents', metrics.enProceso);
  setText('metricResolvedIncidents', metrics.resueltos);
  setText('metricUsersCount', metrics.usuarios);
  setText('metricActiveAdmins', metrics.administradoresActivos);

  setText('adminPendingCount', metrics.pendientes);
  setText('adminProcessCount', metrics.enProceso);
  setText('adminResolvedCount', metrics.resueltos);

  const active = adminCache.filter(item => String(item.estado || 'Activo').toLowerCase() === 'activo').length;
  const inactive = adminCache.filter(item => String(item.estado || 'Activo').toLowerCase() === 'inactivo').length;

  setText('adminManagersRegistered', `${adminCache.length} registrados`);
  setText('adminManagersActive', `${active} activos`);
  setText('adminManagersInactive', `${inactive} inactivos`);

  updateSyncText();
}

function renderRecentActivity() {
  const list = document.getElementById('adminRecentActivity');
  if (!list) return;

  const latest = incidentCache.slice(0, 5);

  list.innerHTML = latest.length
    ? latest.map(item => `
      <div class="admin-live-item">
        <b>${statusIcon(item.estado)} ${escapeHtml(item.folio || 'INC-SIN-ID')} · ${escapeHtml(item.tipo || item.categoria || 'Incidente')}</b>
        <small>${statusLabel(item.estado)} · ${escapeHtml(item.descripcion || 'Sin descripción')}</small>
      </div>
    `).join('')
    : '<small>No hay incidencias registradas todavía.</small>';
}

function renderIncidents(reports) {
  const filtered = reports.filter(item => currentStatus === 'todos' || statusKey(item.estado) === currentStatus);

  setText('adminIncidentsSummary', `${filtered.length} incidencia(s) visibles · ${coordsCount(filtered)} con ubicación`);

  const list = document.getElementById('adminCleanIncidents');
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.slice(0, 25).map(item => `
        <div class="admin-live-item">
          <b>${statusIcon(item.estado)} ${escapeHtml(item.folio || 'INC-SIN-ID')} · ${escapeHtml(item.tipo || item.categoria || 'Incidente')}</b>
          <small>${statusLabel(item.estado)} · ${escapeHtml(item.descripcion || 'Sin descripción')}</small>
        </div>
      `).join('')
      : '<small>No hay incidencias registradas todavía.</small>';
  }

  renderReportsScreen(filtered);
}

function coordsCount(items) {
  return items.filter(coords).length;
}

function ensureReportsScreen() {
  const screen = document.getElementById('trackingScreen');
  if (!screen || document.getElementById('adminReportsPanel')) return;

  const panel = document.createElement('section');
  panel.id = 'adminReportsPanel';
  panel.className = 'admin-data-card';
  panel.innerHTML = `
    <div class="section-title">
      <h3>Reportes administrativos</h3>
      <small id="adminReportsSyncStatus">Sincronizando datos...</small>
    </div>
    <div id="adminReportsList" class="admin-live-list">
      <small>Sincronizando incidencias...</small>
    </div>
  `;

  const nav = screen.querySelector('.bottom-nav');
  screen.insertBefore(panel, nav || null);
}

function renderReportsScreen(items = incidentCache) {
  ensureReportsScreen();

  const list = document.getElementById('adminReportsList');
  if (!list) return;

  list.innerHTML = items.length
    ? items.slice(0, 30).map(item => `
      <div class="admin-live-item">
        <b>${statusIcon(item.estado)} ${escapeHtml(item.folio || 'INC-SIN-ID')} · ${escapeHtml(item.tipo || item.categoria || 'Incidente')}</b>
        <small>${statusLabel(item.estado)} · ${escapeHtml(item.descripcion || 'Sin descripción')}</small>
      </div>
    `).join('')
    : '<small>No hay incidencias registradas todavía.</small>';
}

function initMap() {
  const mapElement = document.getElementById('reportsMap');
  if (!mapElement || typeof L === 'undefined') return null;

  if (adminMap) {
    setTimeout(() => adminMap.invalidateSize(), 250);
    return adminMap;
  }

  adminMap = L.map(mapElement, { zoomControl: true, attributionControl: false }).setView(DEFAULT_CENTER, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMap);
  markersLayer = L.layerGroup().addTo(adminMap);
  return adminMap;
}

function ensureMapFilters() {
  const mapScreen = document.getElementById('mapScreen');
  if (!mapScreen || document.getElementById('adminCleanMapFilters')) return;

  const filters = document.createElement('section');
  filters.id = 'adminCleanMapFilters';
  filters.innerHTML = `
    <div class="section-title">
      <h3>Mapa de incidencias</h3>
      <small id="adminMapSummary">Sincronizando ubicaciones...</small>
    </div>
    <div class="tabs admin-map-filters">
      <button class="active" data-map-status="todos">Todos</button>
      <button data-map-status="pendiente">Pendientes</button>
      <button data-map-status="en_proceso">En proceso</button>
      <button data-map-status="resuelto">Resueltos</button>
      <button data-map-status="cancelado">Cancelados</button>
    </div>
  `;

  mapScreen.insertBefore(filters, document.getElementById('reportsMap'));

  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-map-status]');
    if (!button) return;

    currentStatus = button.dataset.mapStatus;
    filters.querySelectorAll('[data-map-status]').forEach(item => item.classList.toggle('active', item === button));
    renderMap(incidentCache);
  });
}

function renderMap(reports) {
  const map = initMap();
  if (!map || !markersLayer) return;

  markersLayer.clearLayers();

  const visible = reports
    .filter(item => currentStatus === 'todos' || statusKey(item.estado) === currentStatus)
    .map(item => ({ item, coords: coords(item) }))
    .filter(item => item.coords);

  visible.forEach(({ item, coords }) => {
    L.marker([coords.lat, coords.lng])
      .bindPopup(`
        <b>${escapeHtml(item.folio || 'INC-SIN-ID')}</b><br>
        ${escapeHtml(item.tipo || item.categoria || 'Incidente')}<br>
        Estado: ${statusLabel(item.estado)}<br>
        <a href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank">Abrir ubicación</a>
      `)
      .addTo(markersLayer);
  });

  setText('adminMapSummary', `${visible.length} ubicaciones visibles · Filtro: ${currentStatus === 'todos' ? 'Todos' : statusLabel(currentStatus)}`);

  const info = document.getElementById('mapInfoCard');
  if (info) {
    info.innerHTML = `
      <span class="icon orange">🗺️</span>
      <div>
        <b>Mapa administrativo</b>
        <small>${visible.length} ubicaciones visibles. Toca un marcador para ver detalles.</small>
      </div>
    `;
  }

  if (visible.length) {
    map.fitBounds(L.latLngBounds(visible.map(({ coords }) => [coords.lat, coords.lng])), { padding: [28, 28], maxZoom: 15 });
  } else {
    map.setView(DEFAULT_CENTER, 13);
  }

  setTimeout(() => map.invalidateSize(), 150);
}

function subscribeStats() {
  if (unsubscribeStats || !isAdmin()) return;

  unsubscribeStats = onSnapshot(doc(db, 'estadisticas', 'resumen'), snapshot => {
    latestStats = snapshot.exists() ? snapshot.data() : null;
    lastSyncDate = new Date();
    renderAll();
  }, error => {
    console.warn('No se pudo leer estadisticas/resumen. Se usarán conteos locales:', error);
    latestStats = null;
    renderAll();
  });
}

function subscribeIncidents() {
  if (unsubscribeIncidents || !isAdmin()) return;

  unsubscribeIncidents = onSnapshot(collection(db, 'incidencias'), snapshot => {
    incidentCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => Number(b.idIncremental || 0) - Number(a.idIncremental || 0));

    lastSyncDate = new Date();
    renderAll();

    if (document.getElementById('mapScreen')?.classList.contains('active')) {
      renderMap(incidentCache);
    }
  }, error => {
    console.error('No se pudieron sincronizar incidencias:', error);
    setText('adminIncidentsSummary', 'No se pudieron sincronizar incidencias. Revisa Firestore Rules.');
  });
}

function subscribeAdmins() {
  if (unsubscribeAdmins || !isSuperadmin()) return;

  unsubscribeAdmins = onSnapshot(collection(db, 'administradores'), snapshot => {
    adminCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => String(a.correo || '').localeCompare(String(b.correo || '')));

    lastSyncDate = new Date();
    renderManagers();
    renderAccessHistory();
    renderMetrics();
  }, error => {
    console.error('No se pudieron sincronizar administradores:', error);
    const list = document.getElementById('adminCleanManagers');
    if (list) list.innerHTML = '<small>No se pudieron sincronizar administradores. Revisa Firestore Rules.</small>';
  });
}

function subscribeUsers() {
  if (unsubscribeUsers || !isSuperadmin()) return;

  unsubscribeUsers = onSnapshot(collection(db, 'usuarios'), snapshot => {
    userCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => String(a.correo || '').localeCompare(String(b.correo || '')));

    lastSyncDate = new Date();
    renderUsers();
    renderMetrics();
  }, error => {
    console.error('No se pudieron sincronizar usuarios:', error);
    const list = document.getElementById('adminCleanUsers');
    if (list) list.innerHTML = '<small>No se pudieron sincronizar usuarios. Revisa Firestore Rules.</small>';
  });
}

async function refreshServerCounts() {
  if (!isAdmin()) return;

  try {
    const totalIncidents = await getCountFromServer(collection(db, 'incidencias'));
    const totalAdmins = isSuperadmin() ? await getCountFromServer(collection(db, 'administradores')) : null;
    const activeAdmins = isSuperadmin()
      ? await getCountFromServer(query(collection(db, 'administradores'), where('estado', '==', 'Activo')))
      : null;
    const users = isSuperadmin() ? await getCountFromServer(collection(db, 'usuarios')) : null;

    latestStats = {
      ...(latestStats || {}),
      totalIncidencias: totalIncidents.data().count,
      administradores: totalAdmins?.data().count ?? latestStats?.administradores,
      administradoresActivos: activeAdmins?.data().count ?? latestStats?.administradoresActivos,
      usuarios: users?.data().count ?? latestStats?.usuarios
    };

    renderMetrics();
  } catch (error) {
    console.warn('No se pudieron obtener conteos rápidos del servidor:', error);
  }
}

function renderManagers() {
  const list = document.getElementById('adminCleanManagers');
  if (!list) return;

  const active = adminCache.filter(item => String(item.estado || 'Activo').toLowerCase() === 'activo').length;
  const inactive = adminCache.filter(item => String(item.estado || 'Activo').toLowerCase() === 'inactivo').length;

  setText('adminManagersCount', `${adminCache.length} registrados · ${active} activos · ${inactive} inactivos`);
  setText('adminManagersRegistered', `${adminCache.length} registrados`);
  setText('adminManagersActive', `${active} activos`);
  setText('adminManagersInactive', `${inactive} inactivos`);

  list.innerHTML = adminCache.length
    ? adminCache.map(item => `
      <div class="admin-live-item admin-crud-item admin-table-row">
        <b>${escapeHtml(item.nombre || item.correo || 'Administrador')}</b>
        <small>Correo: ${escapeHtml(item.correo || 'Sin correo')}</small>
        <small>Rol: ${escapeHtml(item.rol || 'Administrador')} · Estado: ${escapeHtml(item.estado || 'Activo')}</small>
        <small>Último acceso: ${formatDate(item.fechaUltimoAcceso || item.ultimoAcceso)}</small>
        <div class="dual-actions">
          <button type="button" data-admin-edit="${escapeHtml(item.correo || '')}">Editar</button>
          <button type="button" data-admin-toggle="${escapeHtml(item.correo || '')}">${item.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}</button>
          <button type="button" data-admin-role="${escapeHtml(item.correo || '')}" data-role="${item.rol === 'Superadmin' ? 'Administrador' : 'Superadmin'}">Cambiar rol</button>
          <button type="button" data-admin-delete="${escapeHtml(item.correo || '')}">Eliminar</button>
        </div>
      </div>`).join('')
    : '<small>No hay administradores registrados. Agrega un nuevo administrador para comenzar.</small>';
}

function renderUsers() {
  const list = document.getElementById('adminCleanUsers');
  if (!list) return;

  setText('adminUsersSummary', `${userCache.length} usuario(s) registrados`);

  list.innerHTML = userCache.length
    ? userCache.slice(0, 40).map(item => `
      <div class="admin-live-item">
        <b>${escapeHtml(item.nombre || item.correo || 'Usuario')}</b>
        <small>${escapeHtml(item.correo || 'Sin correo')} · ${escapeHtml(item.rol || 'Sin rol')}</small>
        <small>Tel: ${escapeHtml(item.numeroTelefono || item.telefono || 'Sin teléfono')}</small>
      </div>
    `).join('')
    : '<small>No hay usuarios registrados todavía.</small>';
}

function renderAccessHistory() {
  const history = document.getElementById('adminAccessHistory');
  if (!history) return;

  history.innerHTML = adminCache.length
    ? adminCache.map(item => `
      <div class="admin-live-item">
        <b>${escapeHtml(item.correo || 'Sin correo')}</b>
        <small>Último acceso: ${formatDate(item.fechaUltimoAcceso || item.ultimoAcceso)}</small>
        <small>Última actualización: ${formatDate(item.fechaActualizacion)}</small>
      </div>`).join('')
    : '<small>No hay historial registrado todavía.</small>';
}

function loadAdminToForm(adminEmail) {
  const item = adminCache.find(admin => admin.correo === adminEmail);
  if (!item) return;

  editingAdminEmail = item.correo;
  setField('adminEditMode', 'edit');
  setField('adminCleanEmail', item.correo);

  const emailInput = document.getElementById('adminCleanEmail');
  if (emailInput) emailInput.readOnly = true;

  setField('adminCleanName', item.nombre);
  setField('adminCleanPhone', item.telefono);
  setField('adminCleanRole', item.rol || 'Administrador');
  setField('adminCleanStatus', item.estado || 'Activo');
  setField('adminCleanArea', item.area);
  setField('adminCleanNotes', item.observaciones);
  setText('adminCleanSubmit', 'Actualizar administrador');
  setText('adminCleanMessage', `Editando a ${item.correo}`);
}

function clearAdminForm() {
  editingAdminEmail = null;
  const form = document.getElementById('adminCleanForm');
  form?.reset();

  const emailInput = document.getElementById('adminCleanEmail');
  if (emailInput) emailInput.readOnly = false;

  setField('adminEditMode', 'create');
  setText('adminCleanSubmit', 'Guardar administrador');
  setText('adminCleanMessage', '');
}

async function saveAdmin(event) {
  event.preventDefault();
  if (!isSuperadmin()) return;

  const adminEmail = String(document.getElementById('adminCleanEmail')?.value || '').trim().toLowerCase();
  const adminName = document.getElementById('adminCleanName')?.value?.trim() || adminEmail.split('@')[0];
  const adminRole = document.getElementById('adminCleanRole')?.value || 'Administrador';
  const adminStatus = document.getElementById('adminCleanStatus')?.value || 'Activo';
  const phone = document.getElementById('adminCleanPhone')?.value?.trim() || '';
  const area = document.getElementById('adminCleanArea')?.value?.trim() || '';
  const notes = document.getElementById('adminCleanNotes')?.value?.trim() || '';
  const mode = editingAdminEmail ? 'editar_administrador' : 'crear_administrador';

  if (!adminEmail) {
    setText('adminCleanMessage', 'Agrega un correo válido.');
    return;
  }

  await setDoc(doc(db, 'administradores', safeEmailId(adminEmail)), {
    correo: adminEmail,
    nombre: adminName,
    telefono: phone,
    rol: adminRole,
    estado: adminStatus,
    area,
    observaciones: notes,
    creadoPor: email(),
    fechaActualizacion: serverTimestamp(),
    ultimoAcceso: adminCache.find(item => item.correo === adminEmail)?.ultimoAcceso || 'Sin registro'
  }, { merge: true });

  await addDoc(collection(db, 'auditoria_admin'), {
    accion: mode,
    correo: adminEmail,
    rol: adminRole,
    estado: adminStatus,
    ejecutadoPor: email(),
    fecha: serverTimestamp()
  });

  setText('adminCleanMessage', editingAdminEmail ? 'Administrador actualizado correctamente.' : 'Administrador creado correctamente.');
  clearAdminForm();
  showCrudSection('list');
}

document.addEventListener('click', async event => {
  const toggle = event.target.closest('[data-admin-toggle]');
  const roleButton = event.target.closest('[data-admin-role]');
  const deleteButton = event.target.closest('[data-admin-delete]');

  if (!isSuperadmin() || (!toggle && !roleButton && !deleteButton)) return;

  const adminEmail = toggle?.dataset.adminToggle || roleButton?.dataset.adminRole || deleteButton?.dataset.adminDelete;
  const current = adminCache.find(item => item.correo === adminEmail);

  if (!adminEmail) return;

  if (deleteButton) {
    const confirmed = confirm(`¿Eliminar al administrador ${adminEmail}? Esta acción quitará su registro administrativo.`);
    if (!confirmed) return;

    await deleteDoc(doc(db, 'administradores', safeEmailId(adminEmail)));
    await addDoc(collection(db, 'auditoria_admin'), {
      accion: 'eliminar_administrador',
      correo: adminEmail,
      ejecutadoPor: email(),
      fecha: serverTimestamp()
    });
    return;
  }

  const changes = toggle
    ? { estado: current?.estado === 'Inactivo' ? 'Activo' : 'Inactivo' }
    : { rol: roleButton.dataset.role };

  await updateDoc(doc(db, 'administradores', safeEmailId(adminEmail)), {
    ...changes,
    fechaActualizacion: serverTimestamp()
  });

  await addDoc(collection(db, 'auditoria_admin'), {
    accion: toggle ? 'cambiar_estado_administrador' : 'cambiar_rol_administrador',
    correo: adminEmail,
    cambios: changes,
    ejecutadoPor: email(),
    fecha: serverTimestamp()
  });
});

async function syncAdminProfile() {
  if (!isAdmin() || !auth.currentUser) return;

  const stored = getStoredProfile();
  const preferredName = stored.nombre || auth.currentUser.displayName || email().split('@')[0];

  await crearPerfilUsuario(auth.currentUser.uid, {
    correo: email(),
    nombre: preferredName,
    rol: role(),
    estado: 'Activo',
    accesoAdministrativo: true,
    fechaUltimoAcceso: new Date().toISOString()
  });

  await setDoc(doc(db, 'administradores', safeEmailId(email())), {
    correo: email(),
    nombre: preferredName,
    rol: role(),
    estado: 'Activo',
    ultimoAcceso: new Date().toLocaleString('es-MX'),
    fechaUltimoAcceso: serverTimestamp()
  }, { merge: true });
}

function renderAll() {
  renderMetrics();
  renderRecentActivity();
  renderIncidents(incidentCache);
  renderReportsScreen(incidentCache);
  if (document.getElementById('mapScreen')?.classList.contains('active')) renderMap(incidentCache);
}

export function startAdminClean() {
  if (!isAdmin()) return;

  ensurePanel();
  ensureAdminBottomNavigation();
  ensureReportsScreen();
  ensureMapFilters();
  applyVisibility();
  subscribeStats();
  subscribeIncidents();
  subscribeAdmins();
  syncAdminProfile().catch(console.warn);
  refreshServerCounts();

  if (!refreshCountTimer) {
    refreshCountTimer = setInterval(refreshServerCounts, 120000);
  }

  renderAll();
}

export function stopAdminClean() {
  if (unsubscribeIncidents) unsubscribeIncidents();
  if (unsubscribeAdmins) unsubscribeAdmins();
  if (unsubscribeStats) unsubscribeStats();
  if (unsubscribeUsers) unsubscribeUsers();
  if (refreshCountTimer) clearInterval(refreshCountTimer);

  unsubscribeIncidents = null;
  unsubscribeAdmins = null;
  unsubscribeStats = null;
  unsubscribeUsers = null;
  refreshCountTimer = null;
}

window.startAdminClean = startAdminClean;
window.stopAdminClean = stopAdminClean;
window.addEventListener('load', () => setTimeout(startAdminClean, 1200));

document.addEventListener('click', event => {
  if (event.target.closest('[data-go="adminScreen"], [data-go="mapScreen"], [data-go="trackingScreen"], [data-go="profileScreen"]')) {
    setTimeout(startAdminClean, 250);
  }
});

setInterval(updateSyncText, 30000);
