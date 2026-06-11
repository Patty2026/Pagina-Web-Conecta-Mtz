import {
  auth,
  db,
  crearPerfilUsuario
} from './firebase-service.js';

import {
  collection,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let unsubscribeUsers = null;
let unsubscribeReports = null;
let adminDashboardReady = false;
let cachedUsers = [];
let cachedReports = [];

function normalizeStatus(status = 'Pendiente') {
  const value = String(status).toLowerCase();

  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';

  return 'Pendiente';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getCoords(report) {
  const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
  const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);

  return Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function createAdminDataPanel() {
  const adminScreen = document.getElementById('adminScreen');
  if (!adminScreen) return null;

  let panel = document.getElementById('adminRealtimePanel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'adminRealtimePanel';
  panel.className = 'admin-realtime-panel';
  panel.innerHTML = `
    <div class="section-title">
      <h3>Base de datos en tiempo real</h3>
    </div>

    <div class="support-stats admin-extra-stats">
      <div><b id="adminUsersCount">0</b><small>Usuarios</small></div>
      <div><b id="adminReportsCount">0</b><small>Incidentes</small></div>
      <div><b id="adminLocationsCount">0</b><small>Con ubicación</small></div>
    </div>

    <div class="admin-data-grid">
      <article class="admin-data-card">
        <h3>Usuarios registrados</h3>
        <div id="adminUsersList" class="admin-live-list">
          <small>Cargando usuarios...</small>
        </div>
      </article>

      <article class="admin-data-card">
        <h3>Incidentes registrados</h3>
        <div id="adminReportsList" class="admin-live-list">
          <small>Cargando incidentes...</small>
        </div>
      </article>
    </div>
  `;

  const nav = adminScreen.querySelector('.bottom-nav');
  adminScreen.insertBefore(panel, nav || null);

  return panel;
}

function renderUsers(users) {
  setText('adminUsersCount', users.length);

  const list = document.getElementById('adminUsersList');
  if (!list) return;

  if (!users.length) {
    list.innerHTML = '<small>No hay usuarios registrados.</small>';
    return;
  }

  list.innerHTML = users
    .slice(0, 8)
    .map(user => `
      <div class="admin-live-item">
        <b>${user.codigoUsuario || 'USR-SIN-ID'} · ${user.nombre || user.correo || 'Usuario'}</b>
        <small>${user.correo || 'Sin correo'} · ${user.rol || 'Sin rol'}</small>
      </div>
    `)
    .join('');
}

function renderReports(reports) {
  const pending = reports.filter(report => normalizeStatus(report.estado) === 'Pendiente').length;
  const process = reports.filter(report => ['En revisión', 'En proceso'].includes(normalizeStatus(report.estado))).length;
  const resolved = reports.filter(report => normalizeStatus(report.estado) === 'Resuelto').length;
  const withLocation = reports.filter(report => getCoords(report)).length;

  setText('adminPendingCount', pending);
  setText('adminProcessCount', process);
  setText('adminResolvedCount', resolved);
  setText('adminReportsCount', reports.length);
  setText('adminLocationsCount', withLocation);

  const list = document.getElementById('adminReportsList');
  if (!list) return;

  if (!reports.length) {
    list.innerHTML = '<small>No hay incidentes registrados.</small>';
    return;
  }

  list.innerHTML = reports
    .slice(0, 8)
    .map(report => {
      const coords = getCoords(report);
      const locationText = coords
        ? `Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}`
        : 'Sin ubicación';

      return `
        <div class="admin-live-item">
          <b>${report.folio || 'INC-SIN-ID'} · ${report.tipo || 'Incidente'}</b>
          <small>${normalizeStatus(report.estado)} · ${locationText}</small>
        </div>
      `;
    })
    .join('');
}

function sortByIncremental(items) {
  return [...items].sort((a, b) => {
    const aId = Number(a.idIncremental || 0);
    const bId = Number(b.idIncremental || 0);
    return bId - aId;
  });
}

async function syncCurrentAdminProfile() {
  const user = auth.currentUser;
  const role = window.getCurrentAdminRole?.();

  if (!user || !role) return;

  await crearPerfilUsuario(user.uid, {
    correo: user.email,
    nombre: user.email?.split('@')[0] || role,
    rol: role,
    estado: 'Activo',
    accesoAdministrativo: true,
    fechaUltimoAcceso: new Date().toISOString()
  });
}

function subscribeUsers() {
  if (unsubscribeUsers) unsubscribeUsers();

  unsubscribeUsers = onSnapshot(collection(db, 'usuarios'), snapshot => {
    cachedUsers = sortByIncremental(
      snapshot.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
      }))
    );

    renderUsers(cachedUsers);
  }, error => {
    console.error('No se pudieron cargar usuarios:', error);
    const list = document.getElementById('adminUsersList');
    if (list) list.innerHTML = '<small>No se pudieron cargar usuarios. Revisa reglas de Firestore.</small>';
  });
}

function subscribeReports() {
  if (unsubscribeReports) unsubscribeReports();

  unsubscribeReports = onSnapshot(collection(db, 'incidencias'), snapshot => {
    cachedReports = sortByIncremental(
      snapshot.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
      }))
    );

    renderReports(cachedReports);
  }, error => {
    console.error('No se pudieron cargar incidentes:', error);
    const list = document.getElementById('adminReportsList');
    if (list) list.innerHTML = '<small>No se pudieron cargar incidentes. Revisa reglas de Firestore.</small>';
  });
}

export async function startAdminRealtimePanel() {
  const isAdmin = window.isAdminUser?.();
  if (!isAdmin) return;

  createAdminDataPanel();

  await syncCurrentAdminProfile().catch(error => {
    console.warn('No se pudo actualizar el perfil administrativo:', error);
  });

  subscribeUsers();
  subscribeReports();
  adminDashboardReady = true;
}

export function stopAdminRealtimePanel() {
  if (unsubscribeUsers) unsubscribeUsers();
  if (unsubscribeReports) unsubscribeReports();

  unsubscribeUsers = null;
  unsubscribeReports = null;
  adminDashboardReady = false;
}

window.startAdminRealtimePanel = startAdminRealtimePanel;
window.stopAdminRealtimePanel = stopAdminRealtimePanel;

window.addEventListener('load', () => {
  setTimeout(() => {
    if (window.isAdminUser?.() && !adminDashboardReady) {
      startAdminRealtimePanel();
    }
  }, 1200);
});
