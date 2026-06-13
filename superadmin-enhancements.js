/* =========================================================
   ConectaMartínez - Superadmin limpio
   ---------------------------------------------------------
   Búsqueda, filtros, exportación, historial y notificaciones
   sin repetir el CRUD de administradores en todas las vistas.
   ========================================================= */

import { auth, db } from './firebase-service.js';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  getCountFromServer,
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const MAX_REPORTS_VIEW = 150;

let incidentCache = [];
let auditCache = [];
let notificationsCache = [];
let usersCache = [];
let unsubscribeAudit = null;
let unsubscribeNotifications = null;
let unsubscribeUsers = null;
let lastSync = null;
let refreshTimer = null;
let cleanTimer = null;
let cleanObserver = null;

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function currentEmail() {
  const profile = getStoredProfile();
  return normalize(auth.currentUser?.email || profile.correo || profile.email || '');
}

function currentRole() {
  const profile = getStoredProfile();
  return normalize(profile.rol || '');
}

function isSuperadmin() {
  return currentEmail() === SUPERADMIN_EMAIL || currentRole().includes('superadmin');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

function formatDate(value) {
  const ms = millis(value);
  return ms ? new Date(ms).toLocaleString('es-MX') : 'Sin registro';
}

function statusKey(status = 'pendiente') {
  const value = normalize(status);
  if (value.includes('cancel')) return 'cancelado';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'resuelto';
  if (value.includes('proceso') || value.includes('revision') || value.includes('revisión')) return 'en_proceso';
  return 'pendiente';
}

function statusLabel(status = 'pendiente') {
  return {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
    cancelado: 'Cancelado'
  }[statusKey(status)] || 'Pendiente';
}

function statusIcon(status = 'pendiente') {
  return {
    pendiente: '🟡',
    en_proceso: '🔵',
    resuelto: '✅',
    cancelado: '⚫'
  }[statusKey(status)] || '🟡';
}

function incidentDate(report) {
  return report.fechaRegistro || report.fecha || report.createdAt || report.fechaCreacion || report.fechaActualizacion;
}

function incidentZone(report) {
  return report.colonia || report.zona || report.localidad || report.barrio || report.ubicacion?.colonia || report.direccion || '';
}

function incidentTitle(report) {
  return report.titulo || report.tipo || report.categoria || report.folio || 'Incidencia';
}

function syncText() {
  if (!lastSync) return 'Sincronizando datos...';
  const seconds = Math.round((Date.now() - lastSync.getTime()) / 1000);
  if (seconds < 10) return 'Última actualización: ahora';
  if (seconds < 60) return `Última actualización: hace ${seconds} segundos`;
  const minutes = Math.round(seconds / 60);
  return `Última actualización: hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function injectStyle() {
  if (document.getElementById('superadminCleanStyle')) return;

  const style = document.createElement('style');
  style.id = 'superadminCleanStyle';
  style.textContent = `
    body.superadmin-enhanced #adminScreen,
    body.superadmin-enhanced #trackingScreen,
    body.superadmin-enhanced #mapScreen {
      background: radial-gradient(circle at top, #16215b 0%, #081023 46%, #050912 100%) !important;
      color: #ffffff;
    }

    body.superadmin-enhanced .admin-data-card,
    body.superadmin-enhanced .admin-metric-card,
    body.superadmin-enhanced .admin-live-item,
    body.superadmin-enhanced .superadmin-tools-card {
      background: rgba(16, 27, 58, .94) !important;
      border: 1px solid rgba(168, 196, 255, .22) !important;
      box-shadow: 0 18px 42px rgba(0, 0, 0, .26) !important;
      color: #ffffff !important;
    }

    body.superadmin-enhanced .admin-live-item small,
    body.superadmin-enhanced .section-title small,
    body.superadmin-enhanced .admin-metric-card small {
      color: #d8e3ff !important;
    }

    body.superadmin-enhanced #adminScreen .quick-grid {
      display: none !important;
    }

    body.superadmin-enhanced #adminCleanRoot > .admin-clean-tab {
      display: none !important;
    }

    body.superadmin-enhanced #adminCleanRoot > .admin-clean-tab.superadmin-section-active {
      display: block !important;
    }

    body.superadmin-enhanced #adminManagersTab .admin-crud-section {
      display: none !important;
    }

    body.superadmin-enhanced #adminManagersTab .admin-crud-section.superadmin-crud-active {
      display: block !important;
    }

    .superadmin-tools-card {
      border-radius: 24px;
      padding: 16px;
      margin: 14px 0 18px;
    }

    .superadmin-filter-grid,
    .superadmin-notification-grid,
    .superadmin-user-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .superadmin-filter-grid input,
    .superadmin-filter-grid select,
    .superadmin-notification-grid input,
    .superadmin-notification-grid textarea,
    .superadmin-notification-grid select {
      width: 100%;
      border: 1px solid rgba(220, 232, 255, .28);
      border-radius: 16px;
      padding: 12px 13px;
      background: rgba(255, 255, 255, .10);
      color: #ffffff;
      outline: none;
    }

    .superadmin-filter-grid option,
    .superadmin-notification-grid option {
      color: #111827;
    }

    .superadmin-filter-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }

    .superadmin-filter-actions button,
    .superadmin-notification-grid button,
    .superadmin-action-btn {
      border: 0;
      border-radius: 15px;
      padding: 11px 14px;
      background: #5b7cfa;
      color: #ffffff;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 12px 28px rgba(91, 124, 250, .25);
    }

    .superadmin-filter-actions button.secondary {
      background: rgba(255, 255, 255, .16);
      box-shadow: none;
    }

    .superadmin-empty,
    .superadmin-clean-note {
      padding: 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, .08);
      color: #eaf0ff;
    }

    .superadmin-clean-note {
      display: block;
      margin: 10px 0 12px;
      font-size: 13px;
      line-height: 1.4;
    }

    @media (max-width: 780px) {
      .superadmin-filter-grid,
      .superadmin-notification-grid,
      .superadmin-user-metrics {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function sectionId(tabName) {
  return {
    summary: 'adminSummaryTab',
    incidents: 'adminIncidentsTab',
    admins: 'adminManagersTab',
    users: 'adminUsersTab'
  }[tabName] || 'adminSummaryTab';
}

function crudId(tabName) {
  return {
    list: 'adminCrudList',
    form: 'adminCrudForm',
    history: 'adminCrudHistory'
  }[tabName] || 'adminCrudList';
}

function activePanelTab() {
  return document.querySelector('#adminCleanRoot [data-admin-tab].active')?.dataset.adminTab
    || localStorage.getItem('superadminActivePanelTab')
    || 'summary';
}

function activeCrudTab() {
  return document.querySelector('#adminManagersTab [data-admin-crud-tab].active')?.dataset.adminCrudTab
    || localStorage.getItem('superadminActiveCrudTab')
    || 'list';
}

function applyPanelTab(tabName = activePanelTab()) {
  const finalTab = ['summary', 'incidents', 'admins', 'users'].includes(tabName) ? tabName : 'summary';
  localStorage.setItem('superadminActivePanelTab', finalTab);

  ['summary', 'incidents', 'admins', 'users'].forEach(name => {
    const section = document.getElementById(sectionId(name));
    if (!section) return;
    const active = name === finalTab;
    section.classList.toggle('superadmin-section-active', active);
    section.hidden = !active;
    section.style.display = active ? '' : 'none';
  });

  document.querySelectorAll('#adminCleanRoot [data-admin-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminTab === finalTab);
  });

  if (finalTab === 'admins') applyCrudTab(activeCrudTab());
}

function applyCrudTab(tabName = activeCrudTab()) {
  const finalTab = ['list', 'form', 'history'].includes(tabName) ? tabName : 'list';
  localStorage.setItem('superadminActiveCrudTab', finalTab);

  ['list', 'form', 'history'].forEach(name => {
    const section = document.getElementById(crudId(name));
    if (!section) return;
    const active = name === finalTab;
    section.classList.toggle('superadmin-crud-active', active);
    section.hidden = !active;
    section.style.display = active ? '' : 'none';
  });

  document.querySelectorAll('#adminManagersTab [data-admin-crud-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminCrudTab === finalTab);
  });
}

function removeAdminCrudOutsideManagers() {
  const managersTab = document.getElementById('adminManagersTab');
  if (!managersTab) return;

  ['adminCleanManagers', 'adminCleanForm', 'adminAccessHistory'].forEach(id => {
    document.querySelectorAll(`#${id}`).forEach(element => {
      if (managersTab.contains(element)) return;
      const wrapper = element.closest('.admin-crud-section, .admin-data-card, section, div');
      (wrapper || element).remove();
    });
  });
}

function cleanSummary() {
  const summary = document.getElementById('adminSummaryTab');
  if (!summary) return;

  const title = summary.querySelector('.section-title h3');
  if (title) title.textContent = 'Resumen principal';

  document.getElementById('superadminMovementPanel')?.remove();
  document.getElementById('superadminNotificationsPanel')?.remove();
}

function addAdminNote() {
  const managersTab = document.getElementById('adminManagersTab');
  if (!managersTab || document.getElementById('adminCleanOnlyHereNote')) return;

  const note = document.createElement('small');
  note.id = 'adminCleanOnlyHereNote';
  note.className = 'superadmin-clean-note';
  note.textContent = 'La gestión de administradores se muestra únicamente en esta pestaña para mantener limpio el panel principal.';

  const metrics = managersTab.querySelector('.admin-mini-metrics');
  managersTab.insertBefore(note, metrics?.nextSibling || managersTab.firstChild);
}

function keepPanelClean() {
  if (!isSuperadmin()) return;
  document.body.classList.add('superadmin-enhanced');
  injectStyle();
  removeAdminCrudOutsideManagers();
  cleanSummary();
  addAdminNote();
  applyPanelTab(activePanelTab());
}

function ensureIncidentTools() {
  const incidentsTab = document.getElementById('adminIncidentsTab');
  if (!incidentsTab || document.getElementById('superIncidentTools')) return;

  const tools = document.createElement('section');
  tools.id = 'superIncidentTools';
  tools.className = 'superadmin-tools-card';
  tools.innerHTML = `
    <div class="section-title">
      <h3>Buscar y filtrar incidencias</h3>
      <small id="superIncidentSync">Sincronizando datos...</small>
    </div>

    <div class="superadmin-filter-grid">
      <input id="superIncidentSearch" type="search" placeholder="Buscar por folio, título o descripción">
      <select id="superIncidentStatus">
        <option value="todos">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="en_proceso">En proceso</option>
        <option value="resuelto">Resuelto</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <input id="superIncidentFrom" type="date" title="Fecha inicial">
      <input id="superIncidentTo" type="date" title="Fecha final">
      <input id="superIncidentZone" type="search" placeholder="Filtrar por colonia o zona">
    </div>

    <div class="superadmin-filter-actions">
      <button id="superApplyFilters" type="button">Aplicar filtros</button>
      <button id="superClearFilters" class="secondary" type="button">Limpiar</button>
      <button id="superExportCsv" type="button">Exportar reporte CSV</button>
    </div>
  `;

  const list = document.getElementById('adminCleanIncidents');
  incidentsTab.insertBefore(tools, list || null);

  ['superIncidentSearch', 'superIncidentStatus', 'superIncidentFrom', 'superIncidentTo', 'superIncidentZone']
    .forEach(id => document.getElementById(id)?.addEventListener('input', renderFilteredIncidents));

  document.getElementById('superApplyFilters')?.addEventListener('click', renderFilteredIncidents);
  document.getElementById('superClearFilters')?.addEventListener('click', clearFilters);
  document.getElementById('superExportCsv')?.addEventListener('click', exportFilteredCsv);
}

function ensureUsersMetrics() {
  const usersTab = document.getElementById('adminUsersTab');
  if (!usersTab || document.getElementById('superadminUsersMetrics')) return;

  const metrics = document.createElement('div');
  metrics.id = 'superadminUsersMetrics';
  metrics.className = 'superadmin-user-metrics admin-mini-metrics';
  metrics.innerHTML = `
    <span id="superUsersRegistered">0 registrados</span>
    <span id="superUsersActive">0 activos hoy</span>
    <span id="superUsersInactive">0 sin actividad reciente</span>
  `;

  const list = document.getElementById('adminCleanUsers');
  usersTab.insertBefore(metrics, list || null);
}

function ensureNotificationsPanel() {
  const usersTab = document.getElementById('adminUsersTab');
  if (!usersTab || document.getElementById('superadminNotificationsPanel')) return;

  const panel = document.createElement('section');
  panel.id = 'superadminNotificationsPanel';
  panel.className = 'admin-data-card';
  panel.innerHTML = `
    <div class="section-title">
      <h3>Notificaciones internas</h3>
      <small>Avisos para el equipo administrativo y de apoyo.</small>
    </div>

    <form id="superNotificationForm" class="superadmin-notification-grid">
      <input id="superNotificationTitle" placeholder="Título de la notificación" required>
      <select id="superNotificationPriority">
        <option value="normal">Prioridad normal</option>
        <option value="alta">Prioridad alta</option>
        <option value="urgente">Urgente</option>
      </select>
      <textarea id="superNotificationMessage" placeholder="Mensaje interno" required></textarea>
      <button type="submit">Enviar notificación</button>
    </form>

    <div id="superNotificationsList" class="admin-live-list">
      <small>No hay notificaciones internas todavía.</small>
    </div>
  `;

  usersTab.appendChild(panel);
  document.getElementById('superNotificationForm')?.addEventListener('submit', saveNotification);
}

function getFilterValues() {
  return {
    search: normalize(document.getElementById('superIncidentSearch')?.value || ''),
    status: document.getElementById('superIncidentStatus')?.value || 'todos',
    from: document.getElementById('superIncidentFrom')?.value || '',
    to: document.getElementById('superIncidentTo')?.value || '',
    zone: normalize(document.getElementById('superIncidentZone')?.value || '')
  };
}

function filteredIncidents() {
  const filters = getFilterValues();
  const fromMs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : 0;
  const toMs = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : Infinity;

  return incidentCache.filter(report => {
    const searchSource = normalize([
      report.folio,
      incidentTitle(report),
      report.descripcion,
      report.correoCiudadano,
      report.nombreCiudadano
    ].join(' '));
    const zoneSource = normalize(incidentZone(report));
    const dateMs = millis(incidentDate(report));

    return (!filters.search || searchSource.includes(filters.search))
      && (filters.status === 'todos' || statusKey(report.estado) === filters.status)
      && (!filters.zone || zoneSource.includes(filters.zone))
      && ((!fromMs && filters.to === '') || (dateMs && dateMs >= fromMs && dateMs <= toMs));
  });
}

function renderFilteredIncidents() {
  if (!isSuperadmin()) return;
  const list = document.getElementById('adminCleanIncidents');
  if (!list || !document.getElementById('superIncidentTools')) return;

  const rows = filteredIncidents();
  setText('adminIncidentsSummary', `${rows.length} incidencia(s) visibles con filtros de Superadmin`);
  setText('superIncidentSync', syncText());

  list.innerHTML = rows.length
    ? rows.slice(0, 60).map(report => {
      const zone = incidentZone(report) || 'Sin colonia/zona';
      return `
        <div class="admin-live-item">
          <b>${statusIcon(report.estado)} ${escapeHtml(report.folio || report.id || 'INC-SIN-ID')} · ${escapeHtml(incidentTitle(report))}</b>
          <small>${statusLabel(report.estado)} · ${escapeHtml(zone)} · ${formatDate(incidentDate(report))}</small>
          <small>${escapeHtml(report.descripcion || 'Sin descripción')}</small>
        </div>
      `;
    }).join('')
    : '<div class="superadmin-empty">No hay incidencias registradas todavía o no coinciden con los filtros.</div>';
}

function clearFilters() {
  ['superIncidentSearch', 'superIncidentZone', 'superIncidentFrom', 'superIncidentTo'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });

  const status = document.getElementById('superIncidentStatus');
  if (status) status.value = 'todos';
  renderFilteredIncidents();
}

function csvSafe(value = '') {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportFilteredCsv() {
  const rows = filteredIncidents();
  const headers = ['Folio', 'Título', 'Descripción', 'Estado', 'Fecha', 'Colonia/Zona', 'Usuario'];
  const csv = [headers.map(csvSafe).join(',')]
    .concat(rows.map(report => [
      report.folio || report.id || '',
      incidentTitle(report),
      report.descripcion || '',
      statusLabel(report.estado),
      formatDate(incidentDate(report)),
      incidentZone(report),
      report.correoCiudadano || report.usuarioEmail || report.usuarioId || report.idCiudadano || ''
    ].map(csvSafe).join(',')))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `reporte-incidencias-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

async function loadIncidentPreview() {
  if (!isSuperadmin()) return;

  try {
    const snapshot = await getDocs(query(collection(db, 'incidencias'), limit(MAX_REPORTS_VIEW)));
    incidentCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => millis(incidentDate(b)) - millis(incidentDate(a)));
    lastSync = new Date();
    renderFilteredIncidents();
  } catch (error) {
    console.error('No se pudo cargar vista filtrada de incidencias:', error);
    const list = document.getElementById('adminCleanIncidents');
    if (list) list.innerHTML = '<div class="superadmin-empty">No se pudieron sincronizar incidencias. Revisa Firestore Rules.</div>';
  }
}

async function refreshFastCounts() {
  if (!isSuperadmin()) return;

  try {
    const refs = collection(db, 'incidencias');
    const [total, pending, process, solved, cancelled, users, activeAdmins] = await Promise.all([
      getCountFromServer(refs),
      getCountFromServer(query(refs, where('estado', '==', 'pendiente'))),
      getCountFromServer(query(refs, where('estado', '==', 'en_proceso'))),
      getCountFromServer(query(refs, where('estado', '==', 'resuelto'))),
      getCountFromServer(query(refs, where('estado', '==', 'cancelado'))),
      getCountFromServer(collection(db, 'usuarios')),
      getCountFromServer(query(collection(db, 'administradores'), where('estado', '==', 'Activo')))
    ]);

    setText('metricTotalIncidents', total.data().count);
    setText('metricPendingIncidents', pending.data().count);
    setText('metricProcessIncidents', process.data().count);
    setText('metricResolvedIncidents', solved.data().count);
    setText('metricUsersCount', users.data().count);
    setText('metricActiveAdmins', activeAdmins.data().count);

    if (!document.getElementById('metricCancelledIncidents') && document.getElementById('adminMetricsGrid')) {
      document.getElementById('adminMetricsGrid').insertAdjacentHTML('beforeend', `
        <article class="admin-metric-card">
          <span class="admin-metric-icon">⚫</span>
          <div><b id="metricCancelledIncidents">${cancelled.data().count}</b><small>Canceladas</small></div>
        </article>
      `);
    } else {
      setText('metricCancelledIncidents', cancelled.data().count);
    }
  } catch (error) {
    console.warn('No se pudieron actualizar conteos rápidos de Superadmin:', error);
  }
}

function subscribeAudit() {
  if (unsubscribeAudit || !isSuperadmin()) return;

  unsubscribeAudit = onSnapshot(query(collection(db, 'auditoria_admin'), limit(40)), snapshot => {
    auditCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => millis(b.fecha) - millis(a.fecha));
    renderAudit();
  }, error => {
    console.error('No se pudo sincronizar auditoría:', error);
    const history = document.getElementById('adminAccessHistory');
    if (history) history.innerHTML = '<div class="superadmin-empty">No se pudo cargar el historial de cambios.</div>';
  });
}

function renderAudit() {
  const history = document.getElementById('adminAccessHistory');
  if (!history) return;

  history.innerHTML = auditCache.length
    ? auditCache.slice(0, 30).map(item => `
      <div class="admin-live-item">
        <b>🕘 ${escapeHtml(item.accion || 'Cambio registrado')}</b>
        <small>${escapeHtml(item.correo || item.usuario || 'Sin correo')} · Ejecutado por: ${escapeHtml(item.ejecutadoPor || 'Sistema')}</small>
        <small>${formatDate(item.fecha)}</small>
      </div>
    `).join('')
    : '<div class="superadmin-empty">No hay historial de cambios registrado todavía.</div>';
}

function showAdminHistory(email) {
  const rows = auditCache.filter(item => normalize(item.correo) === normalize(email));
  const history = document.getElementById('adminAccessHistory');
  if (!history) return;

  history.innerHTML = rows.length
    ? rows.map(item => `
      <div class="admin-live-item">
        <b>${escapeHtml(item.accion || 'Cambio registrado')}</b>
        <small>${escapeHtml(email)} · ${formatDate(item.fecha)}</small>
      </div>
    `).join('')
    : `<div class="superadmin-empty">No hay historial registrado para ${escapeHtml(email)}.</div>`;

  localStorage.setItem('superadminActivePanelTab', 'admins');
  localStorage.setItem('superadminActiveCrudTab', 'history');
  applyPanelTab('admins');
  applyCrudTab('history');
}

function addHistoryButtonsToAdminRows() {
  document.querySelectorAll('[data-admin-edit]').forEach(button => {
    const row = button.closest('.admin-live-item');
    const email = button.dataset.adminEdit;
    if (!row || row.querySelector(`[data-super-admin-history="${CSS.escape(email)}"]`)) return;

    const actions = row.querySelector('.dual-actions') || row;
    actions.insertAdjacentHTML('beforeend', `<button type="button" data-super-admin-history="${escapeHtml(email)}">Ver historial</button>`);
  });
}

function subscribeNotifications() {
  if (unsubscribeNotifications || !isSuperadmin()) return;

  unsubscribeNotifications = onSnapshot(query(collection(db, 'notificaciones_internas'), limit(30)), snapshot => {
    notificationsCache = snapshot.docs
      .map(docu => ({ id: docu.id, ...docu.data() }))
      .sort((a, b) => millis(b.fecha) - millis(a.fecha));
    renderNotifications();
  }, error => {
    console.warn('No se pudieron sincronizar notificaciones internas:', error);
  });
}

function renderNotifications() {
  const list = document.getElementById('superNotificationsList');
  if (!list) return;

  list.innerHTML = notificationsCache.length
    ? notificationsCache.slice(0, 8).map(item => `
      <div class="admin-live-item">
        <b>🔔 ${escapeHtml(item.titulo || 'Notificación interna')}</b>
        <small>${escapeHtml(item.mensaje || '')}</small>
        <small>Prioridad: ${escapeHtml(item.prioridad || 'normal')} · ${formatDate(item.fecha)}</small>
      </div>
    `).join('')
    : '<div class="superadmin-empty">No hay notificaciones internas todavía.</div>';
}

async function saveNotification(event) {
  event.preventDefault();
  if (!isSuperadmin()) return;

  const title = document.getElementById('superNotificationTitle')?.value?.trim();
  const message = document.getElementById('superNotificationMessage')?.value?.trim();
  const priority = document.getElementById('superNotificationPriority')?.value || 'normal';

  if (!title || !message) return;

  await addDoc(collection(db, 'notificaciones_internas'), {
    titulo: title,
    mensaje: message,
    prioridad: priority,
    estado: 'activa',
    creadoPor: currentEmail(),
    fecha: serverTimestamp()
  });

  event.target.reset();
}

function subscribeUsers() {
  if (unsubscribeUsers || !isSuperadmin()) return;

  unsubscribeUsers = onSnapshot(query(collection(db, 'usuarios'), limit(250)), snapshot => {
    usersCache = snapshot.docs.map(docu => ({ id: docu.id, ...docu.data() }));
    renderUserMetrics();
  }, error => {
    console.warn('No se pudo sincronizar resumen de usuarios:', error);
  });
}

function renderUserMetrics() {
  const dayMs = 24 * 60 * 60 * 1000;
  const active = usersCache.filter(user => {
    const access = millis(user.fechaUltimoAcceso || user.ultimoAcceso || user.fechaActualizacion);
    return access && (Date.now() - access) <= dayMs;
  }).length;

  setText('superUsersRegistered', `${usersCache.length} registrados`);
  setText('superUsersActive', `${active} activos hoy`);
  setText('superUsersInactive', `${Math.max(usersCache.length - active, 0)} sin actividad reciente`);
}

function bindGlobalEvents() {
  if (window.__superadminEnhancementEvents) return;
  window.__superadminEnhancementEvents = true;

  document.addEventListener('click', event => {
    const panelTab = event.target.closest('[data-admin-tab]');
    if (panelTab) {
      localStorage.setItem('superadminActivePanelTab', panelTab.dataset.adminTab || 'summary');
      setTimeout(() => {
        keepPanelClean();
        if (panelTab.dataset.adminTab === 'incidents') renderFilteredIncidents();
      }, 120);
      return;
    }

    const crudTab = event.target.closest('[data-admin-crud-tab]');
    if (crudTab) {
      localStorage.setItem('superadminActiveCrudTab', crudTab.dataset.adminCrudTab || 'list');
      setTimeout(() => applyCrudTab(crudTab.dataset.adminCrudTab), 120);
      return;
    }

    const history = event.target.closest('[data-super-admin-history]');
    if (history) showAdminHistory(history.dataset.superAdminHistory);

    if (event.target.closest('[data-go], .bottom-nav button')) {
      setTimeout(startSuperadminEnhancements, 350);
    }
  });
}

export function startSuperadminEnhancements() {
  if (!isSuperadmin()) return;

  document.body.classList.add('superadmin-enhanced');
  injectStyle();
  ensureIncidentTools();
  ensureUsersMetrics();
  ensureNotificationsPanel();
  keepPanelClean();
  bindGlobalEvents();
  subscribeAudit();
  subscribeNotifications();
  subscribeUsers();
  loadIncidentPreview();
  refreshFastCounts();
  renderAudit();
  renderNotifications();
  renderUserMetrics();
  addHistoryButtonsToAdminRows();

  if (!cleanObserver) {
    cleanObserver = new MutationObserver(() => keepPanelClean());
    cleanObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      setText('superIncidentSync', syncText());
      refreshFastCounts();
      addHistoryButtonsToAdminRows();
      keepPanelClean();
    }, 60000);
  }

  if (!cleanTimer) {
    cleanTimer = setInterval(() => {
      keepPanelClean();
      addHistoryButtonsToAdminRows();
    }, 1800);
  }
}

export function stopSuperadminEnhancements() {
  if (unsubscribeAudit) unsubscribeAudit();
  if (unsubscribeNotifications) unsubscribeNotifications();
  if (unsubscribeUsers) unsubscribeUsers();
  if (refreshTimer) clearInterval(refreshTimer);
  if (cleanTimer) clearInterval(cleanTimer);
  cleanObserver?.disconnect();

  unsubscribeAudit = null;
  unsubscribeNotifications = null;
  unsubscribeUsers = null;
  refreshTimer = null;
  cleanTimer = null;
  cleanObserver = null;
  document.body.classList.remove('superadmin-enhanced');
}

window.startSuperadminEnhancements = startSuperadminEnhancements;
window.stopSuperadminEnhancements = stopSuperadminEnhancements;
window.addEventListener('load', () => setTimeout(startSuperadminEnhancements, 1600));
