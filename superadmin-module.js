import {
  auth,
  db
} from './firebase-service.js';

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let homeMap = null;
let homeMarkersLayer = null;
let unsubscribeIncidents = null;
let unsubscribeAdmins = null;
let currentFilter = 'Todos';
let incidentCache = [];
let adminCache = [];

const DEFAULT_CENTER = [20.0700, -97.0600];
const DEFAULT_ZOOM = 13;

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function safeEmailId(email = '') {
  return normalizeEmail(email).replaceAll('.', '_');
}

function normalizeStatus(status = 'Pendiente') {
  const value = String(status).toLowerCase();

  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';

  return 'Pendiente';
}

function getCoords(report) {
  const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
  const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);

  return Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function isSuperadmin() {
  return window.getCurrentAdminRole?.() === 'Superadmin';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function showOnlyAdminWindow(windowId) {
  document.querySelectorAll('.admin-window').forEach(panel => {
    panel.style.display = panel.id === windowId ? '' : 'none';
  });

  document.querySelectorAll('[data-admin-window]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminWindow === windowId);
  });

  if (windowId === 'adminIncidentsWindow') {
    setTimeout(() => {
      if (homeMap) homeMap.invalidateSize();
    }, 250);
  }
}

function createAdminWindows() {
  const adminScreen = document.getElementById('adminScreen');
  if (!adminScreen || document.getElementById('adminWindowsRoot')) return;

  const root = document.createElement('section');
  root.id = 'adminWindowsRoot';
  root.className = 'admin-windows-root';

  root.innerHTML = `
    <div class="tabs admin-window-tabs">
      <button class="active" type="button" data-admin-window="adminIncidentsWindow">Incidentes y mapa</button>
      <button type="button" data-admin-window="adminManagersWindow" data-superadmin-only>Administradores</button>
    </div>

    <section class="admin-window" id="adminIncidentsWindow">
      <div class="section-title">
        <h3>Incidentes y ubicaciones</h3>
        <small id="adminHomeMapSummary">Cargando mapa...</small>
      </div>

      <div class="tabs admin-map-filters" id="adminHomeMapFilters">
        <button class="active" type="button" data-status="Todos">Todos</button>
        <button type="button" data-status="Pendiente">Pendientes</button>
        <button type="button" data-status="En revisión">En revisión</button>
        <button type="button" data-status="En proceso">En proceso</button>
        <button type="button" data-status="Resuelto">Resueltos</button>
      </div>

      <div id="adminHomeMap" class="reports-map admin-home-map"></div>

      <div class="admin-data-grid">
        <article class="admin-data-card">
          <h3>Todos los incidentes</h3>
          <div id="adminAllIncidentsList" class="admin-live-list">
            <small>Cargando incidentes...</small>
          </div>
        </article>

        <article class="admin-data-card">
          <h3>Todas las ubicaciones</h3>
          <div id="adminAllLocationsList" class="admin-live-list">
            <small>Cargando ubicaciones...</small>
          </div>
        </article>
      </div>
    </section>

    <section class="admin-window" id="adminManagersWindow" style="display:none" data-superadmin-only>
      <div class="section-title">
        <h3>Administradores</h3>
        <small>Crear, desactivar, cambiar rol y consultar accesos.</small>
      </div>

      <form id="adminManagerForm" class="app-form admin-manager-form">
        <label>Correo del administrador</label>
        <input id="managerEmailInput" type="email" placeholder="admin@correo.com" required>

        <label>Nombre</label>
        <input id="managerNameInput" type="text" placeholder="Nombre del administrador">

        <label>Rol</label>
        <select id="managerRoleInput">
          <option value="Administrador">Administrador básico</option>
          <option value="Superadmin">Superadmin</option>
        </select>

        <button class="main-btn" type="submit">Guardar administrador</button>
        <small id="managerFormMessage"></small>
      </form>

      <div class="admin-data-grid">
        <article class="admin-data-card">
          <h3>Administradores activos y registrados</h3>
          <div id="adminManagersList" class="admin-live-list">
            <small>Cargando administradores...</small>
          </div>
        </article>

        <article class="admin-data-card">
          <h3>Historial de accesos</h3>
          <div id="adminAccessHistory" class="admin-live-list">
            <small>Los accesos se mostrarán cuando inicien sesión.</small>
          </div>
        </article>
      </div>
    </section>
  `;

  const oldStats = adminScreen.querySelector('.support-stats');
  adminScreen.insertBefore(root, oldStats?.nextSibling || adminScreen.querySelector('.bottom-nav'));

  root.addEventListener('click', event => {
    const windowButton = event.target.closest('[data-admin-window]');
    if (windowButton) {
      if (windowButton.dataset.adminWindow === 'adminManagersWindow' && !isSuperadmin()) {
        alert('Esta ventana solo está disponible para Superadmin.');
        return;
      }

      showOnlyAdminWindow(windowButton.dataset.adminWindow);
      return;
    }

    const statusButton = event.target.closest('[data-status]');
    if (statusButton) {
      currentFilter = statusButton.dataset.status;
      root.querySelectorAll('[data-status]').forEach(button => {
        button.classList.toggle('active', button === statusButton);
      });
      renderIncidents(incidentCache);
    }

    const actionButton = event.target.closest('[data-admin-action]');
    if (actionButton) {
      handleAdminAction(actionButton);
    }
  });

  document.getElementById('adminManagerForm')?.addEventListener('submit', saveManager);
  window.applyAdminPanelInfo?.();
}

function initHomeMap() {
  const mapElement = document.getElementById('adminHomeMap');
  if (!mapElement || typeof L === 'undefined') return null;

  if (homeMap) {
    setTimeout(() => homeMap.invalidateSize(), 250);
    return homeMap;
  }

  homeMap = L.map(mapElement, {
    zoomControl: true,
    attributionControl: false
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(homeMap);

  homeMarkersLayer = L.layerGroup().addTo(homeMap);
  setTimeout(() => homeMap.invalidateSize(), 300);

  return homeMap;
}

function buildPopup(report, coords) {
  const status = normalizeStatus(report.estado);
  const folio = report.folio || 'INC-SIN-ID';
  const type = report.tipo || report.categoria || 'Incidente';
  const description = report.descripcion || report.detalle || 'Sin descripción';

  return `
    <div style="min-width:220px">
      <b>${folio}</b><br>
      <strong>${type}</strong><br>
      <small>Estado: ${status}</small><br>
      <small>Lat: ${coords.lat.toFixed(6)}</small><br>
      <small>Lng: ${coords.lng.toFixed(6)}</small><br>
      <p style="margin:8px 0 0">${description}</p>
      <a href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank" rel="noopener">Abrir ubicación</a>
    </div>
  `;
}

function renderIncidents(reports) {
  const filtered = reports.filter(report => {
    if (currentFilter === 'Todos') return true;
    return normalizeStatus(report.estado) === currentFilter;
  });

  const withCoords = filtered
    .map(report => ({ report, coords: getCoords(report) }))
    .filter(item => item.coords);

  setText('adminPendingCount', reports.filter(report => normalizeStatus(report.estado) === 'Pendiente').length);
  setText('adminProcessCount', reports.filter(report => ['En revisión', 'En proceso'].includes(normalizeStatus(report.estado))).length);
  setText('adminResolvedCount', reports.filter(report => normalizeStatus(report.estado) === 'Resuelto').length);

  setText('adminHomeMapSummary', `${withCoords.length} ubicaciones visibles de ${reports.length} incidentes registrados`);

  renderIncidentLists(filtered, withCoords);

  const map = initHomeMap();
  if (!map || !homeMarkersLayer) return;

  homeMarkersLayer.clearLayers();

  withCoords.forEach(({ report, coords }) => {
    L.marker([coords.lat, coords.lng])
      .bindPopup(buildPopup(report, coords))
      .addTo(homeMarkersLayer);
  });

  if (withCoords.length) {
    const bounds = L.latLngBounds(withCoords.map(item => [item.coords.lat, item.coords.lng]));
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  setTimeout(() => map.invalidateSize(), 150);
}

function renderIncidentLists(filtered, withCoords) {
  const incidentList = document.getElementById('adminAllIncidentsList');
  const locationList = document.getElementById('adminAllLocationsList');

  if (incidentList) {
    incidentList.innerHTML = filtered.length
      ? filtered.slice(0, 12).map(report => `
          <div class="admin-live-item">
            <b>${report.folio || 'INC-SIN-ID'} · ${report.tipo || report.categoria || 'Incidente'}</b>
            <small>${normalizeStatus(report.estado)} · ${report.descripcion || 'Sin descripción'}</small>
          </div>
        `).join('')
      : '<small>No hay incidentes registrados.</small>';
  }

  if (locationList) {
    locationList.innerHTML = withCoords.length
      ? withCoords.slice(0, 12).map(({ report, coords }) => `
          <div class="admin-live-item">
            <b>${report.folio || 'INC-SIN-ID'} · ${report.tipo || 'Incidente'}</b>
            <small>Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}</small>
          </div>
        `).join('')
      : '<small>No hay ubicaciones registradas.</small>';
  }
}

function subscribeIncidents() {
  if (unsubscribeIncidents) return;

  unsubscribeIncidents = onSnapshot(collection(db, 'incidencias'), snapshot => {
    incidentCache = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => Number(b.idIncremental || 0) - Number(a.idIncremental || 0));

    renderIncidents(incidentCache);
  }, error => {
    console.error('Error al cargar incidentes administrativos:', error);
    setText('adminHomeMapSummary', 'No se pudieron cargar incidentes. Revisa reglas de Firestore.');
  });
}

function renderManagers(admins) {
  const list = document.getElementById('adminManagersList');
  const history = document.getElementById('adminAccessHistory');

  if (list) {
    list.innerHTML = admins.length
      ? admins.map(admin => `
          <div class="admin-live-item">
            <b>${admin.nombre || admin.correo}</b>
            <small>${admin.correo} · ${admin.rol || 'Administrador'} · ${admin.estado || 'Activo'}</small>
            <div class="dual-actions">
              <button type="button" data-admin-action="toggle" data-email="${admin.correo}">
                ${admin.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}
              </button>
              <button type="button" data-admin-action="role" data-email="${admin.correo}" data-role="${admin.rol === 'Superadmin' ? 'Administrador' : 'Superadmin'}">
                Cambiar rol
              </button>
            </div>
          </div>
        `).join('')
      : '<small>No hay administradores registrados.</small>';
  }

  if (history) {
    history.innerHTML = admins.length
      ? admins.map(admin => `
          <div class="admin-live-item">
            <b>${admin.correo}</b>
            <small>Último acceso: ${admin.ultimoAcceso || admin.fechaUltimoAcceso || 'Sin registro'}</small>
          </div>
        `).join('')
      : '<small>Aún no hay historial de accesos.</small>';
  }
}

function subscribeManagers() {
  if (!isSuperadmin() || unsubscribeAdmins) return;

  unsubscribeAdmins = onSnapshot(collection(db, 'administradores'), snapshot => {
    adminCache = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.correo).localeCompare(String(b.correo)));

    renderManagers(adminCache);
  }, error => {
    console.error('Error al cargar administradores:', error);
    const list = document.getElementById('adminManagersList');
    if (list) list.innerHTML = '<small>No se pudieron cargar administradores. Revisa reglas de Firestore.</small>';
  });
}

async function saveManager(event) {
  event.preventDefault();

  if (!isSuperadmin()) {
    alert('Solo Superadmin puede gestionar administradores.');
    return;
  }

  const email = normalizeEmail(document.getElementById('managerEmailInput')?.value);
  const name = document.getElementById('managerNameInput')?.value?.trim() || email.split('@')[0];
  const role = document.getElementById('managerRoleInput')?.value || 'Administrador';
  const message = document.getElementById('managerFormMessage');

  if (!email) return;

  const adminRef = doc(db, 'administradores', safeEmailId(email));

  await setDoc(adminRef, {
    correo: email,
    nombre: name,
    rol: role,
    estado: 'Activo',
    creadoPor: auth.currentUser?.email || 'superadmin',
    fechaActualizacion: serverTimestamp(),
    ultimoAcceso: 'Sin registro'
  }, { merge: true });

  await addDoc(collection(db, 'auditoria_admin'), {
    accion: 'guardar_administrador',
    correo: email,
    rol: role,
    ejecutadoPor: auth.currentUser?.email || 'superadmin',
    fecha: serverTimestamp()
  });

  if (message) message.textContent = 'Administrador guardado correctamente.';
  event.target.reset();
}

async function handleAdminAction(button) {
  if (!isSuperadmin()) return;

  const email = button.dataset.email;
  const action = button.dataset.adminAction;
  const role = button.dataset.role;
  const current = adminCache.find(admin => admin.correo === email);
  const ref = doc(db, 'administradores', safeEmailId(email));

  if (action === 'toggle') {
    await updateDoc(ref, {
      estado: current?.estado === 'Inactivo' ? 'Activo' : 'Inactivo',
      fechaActualizacion: serverTimestamp()
    });
  }

  if (action === 'role') {
    await updateDoc(ref, {
      rol: role,
      fechaActualizacion: serverTimestamp()
    });
  }

  await addDoc(collection(db, 'auditoria_admin'), {
    accion: action === 'toggle' ? 'cambiar_estado_administrador' : 'cambiar_rol_administrador',
    correo: email,
    nuevoRol: role || current?.rol,
    ejecutadoPor: auth.currentUser?.email || 'superadmin',
    fecha: serverTimestamp()
  });
}

async function registerAdminAccess() {
  const user = auth.currentUser;
  const role = window.getCurrentAdminRole?.();

  if (!user || !role) return;

  const email = normalizeEmail(user.email);
  const ref = doc(db, 'administradores', safeEmailId(email));
  const accessDate = new Date().toLocaleString('es-MX');

  await setDoc(ref, {
    correo: email,
    nombre: email.split('@')[0],
    rol: role,
    estado: 'Activo',
    ultimoAcceso: accessDate,
    fechaUltimoAcceso: serverTimestamp()
  }, { merge: true });
}

export function startSuperadminModule() {
  if (!window.isAdminUser?.()) return;

  createAdminWindows();
  initHomeMap();
  subscribeIncidents();
  subscribeManagers();
  registerAdminAccess().catch(error => console.warn('No se pudo registrar acceso:', error));
  showOnlyAdminWindow('adminIncidentsWindow');
}

window.startSuperadminModule = startSuperadminModule;

window.addEventListener('load', () => {
  setTimeout(startSuperadminModule, 1300);

  document.addEventListener('click', event => {
    if (event.target.closest('[data-go="adminScreen"]')) {
      setTimeout(startSuperadminModule, 250);
    }
  });
});
