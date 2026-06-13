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

function show(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(screenId)?.classList.add('active');
  window.scrollTo(0, 0);
}

function ensurePanel() {
  const adminScreen = document.getElementById('adminScreen');
  if (!adminScreen || document.getElementById('adminCleanRoot')) return;

  adminScreen.querySelectorAll('.bottom-nav button').forEach(button => {
    const target = button.dataset.go;
    if (!['adminScreen', 'mapScreen', 'profileScreen'].includes(target)) button.remove();
    if (target === 'adminScreen') button.textContent = 'Panel';
  });

  const root = document.createElement('section');
  root.id = 'adminCleanRoot';
  root.innerHTML = `
    <div class="tabs admin-window-tabs">
      <button class="active" type="button" data-admin-tab="incidents">Incidentes</button>
      <button type="button" data-admin-tab="admins" data-superadmin-only>Administradores</button>
    </div>

    <section id="adminIncidentsTab" class="admin-clean-tab">
      <div class="section-title"><h3>Resumen operativo</h3><small id="adminCleanSummary">Actualizando...</small></div>
      <div id="adminCleanIncidents" class="admin-live-list"><small>Cargando incidencias...</small></div>
    </section>

    <section id="adminManagersTab" class="admin-clean-tab" style="display:none" data-superadmin-only>
      <div class="section-title"><h3>Administradores</h3><small>Gestión exclusiva de Superadmin</small></div>
      <form id="adminCleanForm" class="app-form">
        <label>Correo</label>
        <input id="adminCleanEmail" type="email" placeholder="admin@correo.com" required>
        <label>Nombre</label>
        <input id="adminCleanName" type="text" placeholder="Nombre del administrador">
        <label>Rol</label>
        <select id="adminCleanRole"><option value="Administrador">Administrador básico</option><option value="Superadmin">Superadmin</option></select>
        <button class="main-btn" type="submit">Guardar administrador</button>
        <small id="adminCleanMessage"></small>
      </form>
      <div id="adminCleanManagers" class="admin-live-list"><small>Cargando administradores...</small></div>
    </section>
  `;

  const nav = adminScreen.querySelector('.bottom-nav');
  adminScreen.insertBefore(root, nav || null);

  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    if (tab.dataset.adminTab === 'admins' && !isSuperadmin()) return;
    root.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button === tab));
    document.getElementById('adminIncidentsTab').style.display = tab.dataset.adminTab === 'incidents' ? '' : 'none';
    document.getElementById('adminManagersTab').style.display = tab.dataset.adminTab === 'admins' ? '' : 'none';
  });

  document.getElementById('adminCleanForm')?.addEventListener('submit', saveAdmin);
  applyVisibility();
}

function applyVisibility() {
  document.querySelectorAll('[data-superadmin-only]').forEach(element => {
    element.style.display = isSuperadmin() ? '' : 'none';
  });
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
  const visible = reports.filter(item => currentStatus === 'Todos' || normalizeStatus(item.estado) === currentStatus).map(item => ({ item, coords: coords(item) })).filter(item => item.coords);
  visible.forEach(({ item, coords }) => {
    L.marker([coords.lat, coords.lng]).bindPopup(`<b>${item.folio || 'INC-SIN-ID'}</b><br>${item.tipo || item.categoria || 'Incidente'}<br>Estado: ${normalizeStatus(item.estado)}<br><a href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank">Abrir ubicación</a>`).addTo(markersLayer);
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
    const list = document.getElementById('adminCleanManagers');
    if (!list) return;
    list.innerHTML = adminCache.length ? adminCache.map(item => `<div class="admin-live-item"><b>${item.nombre || item.correo}</b><small>${item.correo} · ${item.rol || 'Administrador'} · ${item.estado || 'Activo'} · Último acceso: ${item.ultimoAcceso || 'Sin registro'}</small><div class="dual-actions"><button data-admin-toggle="${item.correo}">${item.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}</button><button data-admin-role="${item.correo}" data-role="${item.rol === 'Superadmin' ? 'Administrador' : 'Superadmin'}">Cambiar rol</button></div></div>`).join('') : '<small>No hay administradores registrados.</small>';
  });
}

async function saveAdmin(event) {
  event.preventDefault();
  if (!isSuperadmin()) return;
  const adminEmail = String(document.getElementById('adminCleanEmail')?.value || '').trim().toLowerCase();
  const adminName = document.getElementById('adminCleanName')?.value?.trim() || adminEmail.split('@')[0];
  const adminRole = document.getElementById('adminCleanRole')?.value || 'Administrador';
  await setDoc(doc(db, 'administradores', safeEmailId(adminEmail)), { correo: adminEmail, nombre: adminName, rol: adminRole, estado: 'Activo', creadoPor: email(), fechaActualizacion: serverTimestamp(), ultimoAcceso: 'Sin registro' }, { merge: true });
  await addDoc(collection(db, 'auditoria_admin'), { accion: 'guardar_administrador', correo: adminEmail, rol: adminRole, ejecutadoPor: email(), fecha: serverTimestamp() });
  setText('adminCleanMessage', 'Administrador guardado correctamente.');
  event.target.reset();
}

document.addEventListener('click', async event => {
  const toggle = event.target.closest('[data-admin-toggle]');
  const roleButton = event.target.closest('[data-admin-role]');
  if (!isSuperadmin() || (!toggle && !roleButton)) return;
  const adminEmail = toggle?.dataset.adminToggle || roleButton?.dataset.adminRole;
  const current = adminCache.find(item => item.correo === adminEmail);
  const changes = toggle ? { estado: current?.estado === 'Inactivo' ? 'Activo' : 'Inactivo' } : { rol: roleButton.dataset.role };
  await updateDoc(doc(db, 'administradores', safeEmailId(adminEmail)), { ...changes, fechaActualizacion: serverTimestamp() });
});

async function syncAdminProfile() {
  if (!isAdmin() || !auth.currentUser) return;
  await crearPerfilUsuario(auth.currentUser.uid, { correo: email(), nombre: email().split('@')[0], rol: role(), estado: 'Activo', accesoAdministrativo: true, fechaUltimoAcceso: new Date().toISOString() });
  await setDoc(doc(db, 'administradores', safeEmailId(email())), { correo: email(), nombre: email().split('@')[0], rol: role(), estado: 'Activo', ultimoAcceso: new Date().toLocaleString('es-MX'), fechaUltimoAcceso: serverTimestamp() }, { merge: true });
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
