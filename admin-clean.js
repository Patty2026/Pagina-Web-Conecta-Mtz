import { auth, db, crearPerfilUsuario } from './firebase-service.js';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const BASIC_ADMIN_EMAIL = 'adminb@gmail.com';
const DEFAULT_CENTER = [20.0700, -97.0600];

let unsubscribeIncidents = null;
let unsubscribeAdmins = null;
let adminMap = null;
let markersLayer = null;
let incidentCache = [];
let adminCache = [];
let currentStatus = 'Todos';
let editingAdminEmail = null;

function email() {
  return String(auth.currentUser?.email || '').toLowerCase();
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

function normalizeStatus(status = 'Pendiente') {
  const value = String(status).toLowerCase();
  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';
  return 'Pendiente';
}

function coords(report) {
  const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
  const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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

function cleanAdminNavigation() {
  document.querySelectorAll('#adminScreen .bottom-nav button, #mapScreen .bottom-nav button').forEach(button => {
    const target = button.dataset.go;
    const allowed = ['adminScreen', 'mapScreen', 'profileScreen'];

    if (!allowed.includes(target)) {
      button.remove();
      return;
    }

    if (target === 'adminScreen') button.textContent = 'Panel';
    if (target === 'mapScreen') button.textContent = 'Mapa';
    if (target === 'profileScreen') button.textContent = 'Perfil';
  });
}

function cleanAdminActionCards() {
  const title = document.querySelector('#adminScreen h3');
  if (title && title.textContent.toLowerCase().includes('acciones')) {
    title.textContent = 'Panel administrativo';
  }

  document.querySelectorAll('#adminScreen .quick-grid button').forEach(button => {
    const text = button.textContent.toLowerCase();

    if (text.includes('reporte') || text.includes('notificacion') || text.includes('notificación')) {
      button.remove();
      return;
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

  cleanAdminNavigation();
  cleanAdminActionCards();

  if (document.getElementById('adminCleanRoot')) {
    applyVisibility();
    return;
  }

  const root = document.createElement('section');
  root.id = 'adminCleanRoot';
  root.innerHTML = `
    <div class="tabs admin-window-tabs">
      <button class="active" type="button" data-admin-tab="incidents">Resumen</button>
      <button type="button" data-admin-tab="admins" data-superadmin-only>Administradores</button>
    </div>

    <section id="adminIncidentsTab" class="admin-clean-tab">
      <div class="section-title">
        <h3>Resumen operativo</h3>
        <small id="adminCleanSummary">Actualizando...</small>
      </div>
      <div id="adminCleanIncidents" class="admin-live-list"><small>Cargando incidencias...</small></div>
    </section>

    <section id="adminManagersTab" class="admin-clean-tab" style="display:none" data-superadmin-only>
      <div class="section-title">
        <h3>Administradores</h3>
        <small>Gestiona administradores desde una sola ventana.</small>
      </div>

      <div class="tabs admin-crud-tabs">
        <button class="active" type="button" data-admin-crud-tab="list">Lista</button>
        <button type="button" data-admin-crud-tab="form">Crear / editar</button>
        <button type="button" data-admin-crud-tab="history">Historial</button>
      </div>

      <section id="adminCrudList" class="admin-crud-section">
        <div class="section-title">
          <h3>Lista de administradores</h3>
          <small id="adminManagersCount">0 registrados</small>
        </div>
        <div id="adminCleanManagers" class="admin-live-list"><small>Cargando administradores...</small></div>
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
        <div id="adminAccessHistory" class="admin-live-list"><small>Sin historial todavía.</small></div>
      </section>
    </section>
  `;

  const nav = adminScreen.querySelector('.bottom-nav');
  adminScreen.insertBefore(root, nav || null);

  root.addEventListener('click', handlePanelClick);
  document.getElementById('adminCleanForm')?.addEventListener('submit', saveAdmin);
  document.getElementById('adminCleanCancelEdit')?.addEventListener('click', clearAdminForm);
  applyVisibility();
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
    if (tab.dataset.adminTab === 'admins' && !isSuperadmin()) return;
    document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button === tab));
    document.getElementById('adminIncidentsTab').style.display = tab.dataset.adminTab === 'incidents' ? '' : 'none';
    document.getElementById('adminManagersTab').style.display = tab.dataset.adminTab === 'admins' ? '' : 'none';
    if (tab.dataset.adminTab === 'admins') showCrudSection('list');
    return;
  }

  const crudTab = event.target.closest('[data-admin-crud-tab]');
  if (crudTab) {
    showCrudSection(crudTab.dataset.adminCrudTab);
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
    const managers = document.getElementById('adminManagersTab');
    const incidents = document.getElementById('adminIncidentsTab');
    if (managers) managers.style.display = 'none';
    if (incidents) incidents.style.display = '';
  }
}

function renderIncidents(reports) {
  setText('adminPendingCount', reports.filter(item => normalizeStatus(item.estado) === 'Pendiente').length);
  setText('adminProcessCount', reports.filter(item => ['En revisión', 'En proceso'].includes(normalizeStatus(item.estado))).length);
  setText('adminResolvedCount', reports.filter(item => normalizeStatus(item.estado) === 'Resuelto').length);
  setText('adminCleanSummary', `${reports.length} incidencias registradas · ${reports.filter(coords).length} con ubicación`);

  const list = document.getElementById('adminCleanIncidents');
  if (!list) return;
  list.innerHTML = reports.length
    ? reports.slice(0, 15).map(item => `<div class="admin-live-item"><b>${item.folio || 'INC-SIN-ID'} · ${item.tipo || item.categoria || 'Incidente'}</b><small>${normalizeStatus(item.estado)} · ${item.descripcion || 'Sin descripción'}</small></div>`).join('')
    : '<small>No hay incidencias registradas.</small>';
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
  filters.innerHTML = `<div class="tabs admin-map-filters"><button class="active" data-map-status="Todos">Todos</button><button data-map-status="Pendiente">Pendientes</button><button data-map-status="En revisión">En revisión</button><button data-map-status="En proceso">En proceso</button><button data-map-status="Resuelto">Resueltos</button></div>`;
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
    .filter(item => currentStatus === 'Todos' || normalizeStatus(item.estado) === currentStatus)
    .map(item => ({ item, coords: coords(item) }))
    .filter(item => item.coords);

  visible.forEach(({ item, coords }) => {
    L.marker([coords.lat, coords.lng])
      .bindPopup(`<b>${item.folio || 'INC-SIN-ID'}</b><br>${item.tipo || item.categoria || 'Incidente'}<br>Estado: ${normalizeStatus(item.estado)}<br><a href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank">Abrir ubicación</a>`)
      .addTo(markersLayer);
  });

  const info = document.getElementById('mapInfoCard');
  if (info) info.innerHTML = `<span class="icon orange">🗺️</span><div><b>Mapa administrativo</b><small>${visible.length} ubicaciones visibles. Usa los filtros por estado.</small></div>`;
  if (visible.length) map.fitBounds(L.latLngBounds(visible.map(({ coords }) => [coords.lat, coords.lng])), { padding: [28, 28], maxZoom: 15 });
  setTimeout(() => map.invalidateSize(), 150);
}

function subscribeIncidents() {
  if (unsubscribeIncidents || !isAdmin()) return;
  unsubscribeIncidents = onSnapshot(collection(db, 'incidencias'), snapshot => {
    incidentCache = snapshot.docs.map(docu => ({ id: docu.id, ...docu.data() })).sort((a, b) => Number(b.idIncremental || 0) - Number(a.idIncremental || 0));
    renderIncidents(incidentCache);
    if (document.getElementById('mapScreen')?.classList.contains('active')) renderMap(incidentCache);
  });
}

function subscribeAdmins() {
  if (unsubscribeAdmins || !isSuperadmin()) return;
  unsubscribeAdmins = onSnapshot(collection(db, 'administradores'), snapshot => {
    adminCache = snapshot.docs.map(docu => ({ id: docu.id, ...docu.data() }));
    renderManagers();
    renderAccessHistory();
  });
}

function renderManagers() {
  const list = document.getElementById('adminCleanManagers');
  if (!list) return;

  setText('adminManagersCount', `${adminCache.length} registrado(s)`);

  list.innerHTML = adminCache.length
    ? adminCache.map(item => `
      <div class="admin-live-item admin-crud-item">
        <b>${item.nombre || item.correo}</b>
        <small>${item.correo} · ${item.rol || 'Administrador'} · ${item.estado || 'Activo'}</small>
        <small>Tel: ${item.telefono || 'Sin teléfono'} · Área: ${item.area || 'Sin área'}</small>
        <small>Último acceso: ${formatDate(item.fechaUltimoAcceso || item.ultimoAcceso)}</small>
        <div class="dual-actions">
          <button type="button" data-admin-edit="${item.correo}">Editar</button>
          <button type="button" data-admin-toggle="${item.correo}">${item.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}</button>
          <button type="button" data-admin-role="${item.correo}" data-role="${item.rol === 'Superadmin' ? 'Administrador' : 'Superadmin'}">Cambiar rol</button>
        </div>
      </div>`).join('')
    : '<small>No hay administradores registrados.</small>';
}

function renderAccessHistory() {
  const history = document.getElementById('adminAccessHistory');
  if (!history) return;

  history.innerHTML = adminCache.length
    ? adminCache.map(item => `
      <div class="admin-live-item">
        <b>${item.correo}</b>
        <small>Último acceso: ${formatDate(item.fechaUltimoAcceso || item.ultimoAcceso)}</small>
        <small>Última actualización: ${formatDate(item.fechaActualizacion)}</small>
      </div>`).join('')
    : '<small>Sin historial todavía.</small>';
}

function loadAdminToForm(adminEmail) {
  const item = adminCache.find(admin => admin.correo === adminEmail);
  if (!item) return;

  editingAdminEmail = item.correo;
  setField('adminEditMode', 'edit');
  setField('adminCleanEmail', item.correo);
  document.getElementById('adminCleanEmail').readOnly = true;
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
  if (!isSuperadmin() || (!toggle && !roleButton)) return;

  const adminEmail = toggle?.dataset.adminToggle || roleButton?.dataset.adminRole;
  const current = adminCache.find(item => item.correo === adminEmail);
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
  await crearPerfilUsuario(auth.currentUser.uid, {
    correo: email(),
    nombre: email().split('@')[0],
    rol: role(),
    estado: 'Activo',
    accesoAdministrativo: true,
    fechaUltimoAcceso: new Date().toISOString()
  });

  await setDoc(doc(db, 'administradores', safeEmailId(email())), {
    correo: email(),
    nombre: email().split('@')[0],
    rol: role(),
    estado: 'Activo',
    ultimoAcceso: new Date().toLocaleString('es-MX'),
    fechaUltimoAcceso: serverTimestamp()
  }, { merge: true });
}

export function startAdminClean() {
  if (!isAdmin()) return;
  ensurePanel();
  ensureMapFilters();
  applyVisibility();
  subscribeIncidents();
  subscribeAdmins();
  syncAdminProfile().catch(console.warn);
}

window.startAdminClean = startAdminClean;
window.addEventListener('load', () => setTimeout(startAdminClean, 1200));
document.addEventListener('click', event => {
  if (event.target.closest('[data-go="adminScreen"], [data-go="mapScreen"]')) setTimeout(startAdminClean, 250);
});
