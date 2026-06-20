/* Conecta Martínez - app limpia, estable y ampliada 2026 */

import firebaseConfig from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const BASIC_ADMIN_EMAIL = 'adminb@gmail.com';
const ADMIN_EMAILS = new Set([SUPERADMIN_EMAIL, BASIC_ADMIN_EMAIL]);

const DEFAULT_CENTER = [20.0703, -97.0608]; // Martínez de la Torre, Ver. aproximado
const MAX_EVIDENCE_FILES = 2;
const MAX_IMAGE_WIDTH = 900;
const JPEG_QUALITY = 0.68;

const CATEGORIES = [
  ['baches', 'Baches en vialidades'],
  ['alumbrado', 'Alumbrado público'],
  ['basura', 'Recolección de basura'],
  ['agua', 'Fugas de agua'],
  ['areas_verdes', 'Áreas verdes'],
  ['seguridad', 'Seguridad / Riesgo'],
  ['otro', 'Otro']
];

const DEPARTMENTS = [
  'Atención ciudadana',
  'Obras públicas',
  'Alumbrado público',
  'Limpia pública',
  'Agua potable',
  'Parques y jardines',
  'Protección civil',
  'Tránsito municipal'
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const dom = {
  welcomeScreen: $('#welcomeScreen'),
  authScreen: $('#authScreen'),
  mainScreen: $('#mainScreen'),
  goLoginBtn: $('#goLoginBtn'),
  goRegisterBtn: $('#goRegisterBtn'),
  backWelcomeBtn: $('#backWelcomeBtn'),
  authForm: $('#authForm'),
  authTitle: $('#authTitle'),
  authSubtitle: $('#authSubtitle'),
  authEmail: $('#authEmail'),
  authPassword: $('#authPassword'),
  registerFields: $('#registerFields'),
  registerName: $('#registerName'),
  registerRole: $('#registerRole'),
  authSubmitBtn: $('#authSubmitBtn'),
  toggleAuthBtn: $('#toggleAuthBtn'),
  authMessage: $('#authMessage'),
  userAvatar: $('#userAvatar'),
  userName: $('#userName'),
  userRole: $('#userRole'),
  logoutBtn: $('#logoutBtn'),
  bottomNav: $('#bottomNav'),
  panelView: $('#panelView'),
  mapView: $('#mapView'),
  reportsView: $('#reportsView'),
  profileView: $('#profileView'),
  modal: $('#modal'),
  modalTitle: $('#modalTitle'),
  modalBody: $('#modalBody'),
  closeModalBtn: $('#closeModalBtn')
};

const state = {
  authMode: 'login',
  user: null,
  profile: null,
  role: 'Visitante',
  activeView: 'panel',
  panelTab: 'resumen',
  reports: [],
  users: [],
  admins: [],
  history: [],
  comments: [],
  filters: {
    search: '',
    estado: 'todos',
    categoria: 'todos',
    departamento: 'todos',
    zona: '',
    fechaInicio: '',
    fechaFin: ''
  },
  unsubscribes: [],
  commentUnsubscribe: null,
  mapInstance: null
};

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setMessage(text, type = '') {
  if (!dom.authMessage) return;
  dom.authMessage.className = `message ${type}`.trim();
  dom.authMessage.textContent = text || '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeStatus(value) {
  const raw = String(value || 'pendiente').trim().toLowerCase();
  if (raw.includes('proceso')) return 'en_proceso';
  if (raw.includes('resuelto')) return 'resuelto';
  if (raw.includes('cancel')) return 'cancelado';
  return 'pendiente';
}

function displayStatus(value) {
  const estado = normalizeStatus(value);
  return {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
    cancelado: 'Cancelado'
  }[estado] || 'Pendiente';
}

function getCategoryLabel(value) {
  const clean = String(value || '').trim();
  const found = CATEGORIES.find(([key, label]) => key === clean || label === clean);
  return found ? found[1] : clean || 'Otro';
}

function getCategoryKey(value) {
  const clean = String(value || '').trim();
  const found = CATEGORIES.find(([key, label]) => key === clean || label === clean);
  return found ? found[0] : 'otro';
}

function categoryIcon(value) {
  const key = getCategoryKey(value);
  return {
    baches: '🕳️',
    alumbrado: '💡',
    basura: '🗑️',
    agua: '💧',
    areas_verdes: '🌳',
    seguridad: '⚠️',
    otro: '📍'
  }[key] || '📍';
}

function getRoleByEmail(email, fallbackRole = 'Ciudadano') {
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail === SUPERADMIN_EMAIL) return 'Superadmin';
  if (cleanEmail === BASIC_ADMIN_EMAIL) return 'Administrador básico';
  return fallbackRole || 'Ciudadano';
}

function isSuperadmin() {
  return normalizeEmail(state.user?.email) === SUPERADMIN_EMAIL || state.role === 'Superadmin';
}

function isAdmin() {
  return ADMIN_EMAILS.has(normalizeEmail(state.user?.email)) || ['Superadmin', 'Administrador básico'].includes(state.role);
}

function isSupport() {
  return state.role === 'Apoyo comunitario';
}

function canManageReports() {
  return isAdmin() || isSupport();
}

function safeText(value, fallback = 'Sin dato') {
  const text = String(value ?? '').trim();
  return escapeHTML(text || fallback);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function getDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayKey(value) {
  const date = getDate(value) || new Date();
  return date.toISOString().slice(0, 10);
}

function clearSubscriptions() {
  state.unsubscribes.forEach((unsubscribe) => {
    try { unsubscribe(); } catch (error) { console.warn('No se pudo cerrar listener', error); }
  });
  state.unsubscribes = [];
  clearCommentSubscription();
  if (state.mapInstance) {
    try { state.mapInstance.remove(); } catch (error) { console.warn('No se pudo cerrar mapa', error); }
    state.mapInstance = null;
  }
}

function clearCommentSubscription() {
  if (state.commentUnsubscribe) {
    try { state.commentUnsubscribe(); } catch (error) { console.warn('No se pudo cerrar comentarios', error); }
    state.commentUnsubscribe = null;
  }
  state.comments = [];
}

function showScreen(screenName) {
  [dom.welcomeScreen, dom.authScreen, dom.mainScreen].forEach((screen) => screen?.classList.remove('active'));
  const target = { welcome: dom.welcomeScreen, auth: dom.authScreen, main: dom.mainScreen }[screenName];
  target?.classList.add('active');
  dom.bottomNav?.classList.toggle('hidden', screenName !== 'main');
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === 'register';
  dom.authTitle.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  dom.authSubtitle.textContent = isRegister ? 'Registra tus datos para comenzar.' : 'Accede para continuar.';
  dom.registerFields.classList.toggle('hidden', !isRegister);
  dom.authSubmitBtn.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  dom.toggleAuthBtn.textContent = isRegister ? 'Ya tengo cuenta, iniciar sesión' : 'No tengo cuenta, registrarme';
  dom.authPassword.autocomplete = isRegister ? 'new-password' : 'current-password';
  setMessage('');
}

function setView(view) {
  state.activeView = view;
  $$('.view').forEach((item) => item.classList.remove('active'));
  $(`#${view}View`)?.classList.add('active');
  $$('#bottomNav button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  renderAll();
}

async function ensureUserProfile(user, selectedRole = 'Ciudadano', extra = {}) {
  const email = normalizeEmail(user.email);
  const userRef = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(userRef).catch(() => null);
  const existing = snap?.exists() ? snap.data() : {};
  const role = getRoleByEmail(email, existing.rol || selectedRole);
  const nombre = String(extra.nombre || existing.nombre || user.displayName || email.split('@')[0] || 'Usuario').trim();

  const payload = {
    uid: user.uid,
    correo: email,
    nombre,
    rol: role,
    estado: existing.estado || 'activo',
    telefono: existing.telefono || existing.numeroTelefono || '',
    numeroTelefono: existing.numeroTelefono || existing.telefono || '',
    ocupacion: existing.ocupacion || '',
    descripcionApoyo: existing.descripcionApoyo || '',
    ultimaConexion: serverTimestamp(),
    fechaActualizacion: serverTimestamp()
  };

  if (!snap?.exists()) payload.fechaRegistro = serverTimestamp();
  await setDoc(userRef, payload, { merge: true });

  if (ADMIN_EMAILS.has(email)) {
    const adminId = email.replace(/[^a-z0-9]/g, '_');
    await setDoc(doc(db, 'administradores', adminId), {
      uid: user.uid,
      correo: email,
      nombre,
      rol: role,
      estado: 'activo',
      ultimoAcceso: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    }, { merge: true });
  }

  return { ...existing, ...payload, rol: role, nombre };
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = normalizeEmail(dom.authEmail.value);
  const password = dom.authPassword.value;
  const selectedRole = dom.registerRole?.value || 'Ciudadano';
  const name = dom.registerName?.value?.trim() || email.split('@')[0];

  if (!email || !password) {
    setMessage('Completa correo y contraseña.', 'err');
    return;
  }

  dom.authSubmitBtn.disabled = true;
  setMessage('Conectando con Firebase...', '');

  try {
    let credential;
    if (state.authMode === 'register') {
      credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await ensureUserProfile(credential.user, selectedRole, { nombre: name });
      setMessage('Cuenta creada correctamente.', 'ok');
    } else {
      credential = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserProfile(credential.user, getRoleByEmail(email));
      setMessage('Sesión iniciada correctamente.', 'ok');
    }
  } catch (error) {
    setMessage(readableAuthError(error), 'err');
  } finally {
    dom.authSubmitBtn.disabled = false;
  }
}

function readableAuthError(error) {
  const code = error?.code || '';
  if (code.includes('too-many-requests')) return 'Firebase bloqueó temporalmente los intentos. Espera unos minutos e intenta de nuevo.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
  if (code.includes('user-not-found')) return 'No existe una cuenta con ese correo.';
  if (code.includes('email-already-in-use')) return 'Ese correo ya está registrado.';
  if (code.includes('weak-password')) return 'La contraseña debe tener mínimo 6 caracteres.';
  if (code.includes('network-request-failed')) return 'No hay conexión a internet o Firebase no respondió.';
  return `Error: ${code || error?.message || 'No se pudo conectar.'}`;
}

function startRealtime() {
  clearSubscriptions();
  if (!state.user) return;

  const userRef = doc(db, 'usuarios', state.user.uid);
  state.unsubscribes.push(onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      state.profile = snap.data();
      state.role = getRoleByEmail(state.user.email, state.profile.rol);
      updateHeader();
      renderAll();
    }
  }, (error) => console.error('Error perfil:', error)));

  const reportsQuery = canManageReports()
    ? collection(db, 'incidencias')
    : query(collection(db, 'incidencias'), where('usuarioId', '==', state.user.uid));

  state.unsubscribes.push(onSnapshot(reportsQuery, (snapshot) => {
    state.reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  }, (error) => {
    console.error('Error incidencias:', error);
    state.reports = [];
    renderAll();
  }));

  if (isAdmin()) {
    state.unsubscribes.push(onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }, (error) => console.error('Error usuarios:', error)));

    state.unsubscribes.push(onSnapshot(collection(db, 'administradores'), (snapshot) => {
      state.admins = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }, (error) => console.error('Error administradores:', error)));
  }

  if (isSuperadmin()) {
    state.unsubscribes.push(onSnapshot(collection(db, 'auditoria_admin'), (snapshot) => {
      state.history = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }, (error) => console.error('Error auditoría:', error)));
  }
}

function updateHeader() {
  const name = String(state.profile?.nombre || state.user?.displayName || state.user?.email?.split('@')[0] || 'Usuario').trim();
  dom.userName.textContent = name;
  dom.userRole.textContent = state.role;
  dom.userAvatar.textContent = name.charAt(0).toUpperCase();
}

function getMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const total = state.reports.length;
  const todayCount = state.reports.filter((item) => todayKey(item.fecha || item.fechaCreacion || item.createdAt) === today).length;
  const pendientes = state.reports.filter((item) => normalizeStatus(item.estado) === 'pendiente').length;
  const enProceso = state.reports.filter((item) => normalizeStatus(item.estado) === 'en_proceso').length;
  const resueltos = state.reports.filter((item) => normalizeStatus(item.estado) === 'resuelto').length;
  const cancelados = state.reports.filter((item) => normalizeStatus(item.estado) === 'cancelado').length;
  const usuarios = state.users.length;
  const adminsActivos = state.admins.filter((item) => String(item.estado || 'activo').toLowerCase() === 'activo').length;
  return { total, todayCount, pendientes, enProceso, resueltos, cancelados, usuarios, adminsActivos };
}

function metricCard(icon, value, label) {
  return `<article class="metric"><span>${icon}</span><b>${value}</b><small>${escapeHTML(label)}</small></article>`;
}

function renderMetrics() {
  const m = getMetrics();
  return `<section class="metrics-grid">
    ${metricCard('📊', m.total, 'Total de incidencias')}
    ${metricCard('📅', m.todayCount, 'Incidencias de hoy')}
    ${metricCard('🟡', m.pendientes, 'Pendientes')}
    ${metricCard('🔵', m.enProceso, 'En proceso')}
    ${metricCard('✅', m.resueltos, 'Resueltas')}
    ${metricCard('👥', m.usuarios, 'Usuarios registrados')}
    ${isAdmin() ? metricCard('🛡️', m.adminsActivos, 'Administradores activos') : ''}
    ${metricCard('⛔', m.cancelados, 'Canceladas')}
  </section>`;
}

function renderAll() {
  if (!state.user) return;
  renderPanel();
  renderReportsView();
  renderMapView();
  renderProfileView();
}

function renderPanel() {
  const view = dom.panelView;
  if (!view) return;

  if (isAdmin()) view.innerHTML = renderAdminPanel();
  else if (isSupport()) view.innerHTML = renderSupportPanel();
  else view.innerHTML = renderCitizenPanel();

  bindDynamicActions();
}

function renderCitizenPanel() {
  return `<article class="panel-card"><h2>Panel ciudadano</h2><p>Reporta incidencias con GPS, evidencia fotográfica y seguimiento de estado.</p><button class="btn-primary full" data-action="open-report-form">+ Nueva incidencia</button></article>${renderMetrics()}${renderReportList(state.reports.slice(0, 5), 'No hay incidencias registradas todavía.')}`;
}

function renderSupportPanel() {
  return `<article class="panel-card"><h2>Panel de Apoyo Comunitario</h2><p>Atiende incidencias registradas por la ciudadanía.</p></article>${renderMetrics()}${renderReportList(getFilteredReports(), 'No hay incidencias registradas todavía.', true)}`;
}

function renderAdminPanel() {
  const tabs = ['resumen', 'incidencias', ...(isSuperadmin() ? ['administradores', 'usuarios', 'historial'] : ['usuarios'])];
  const tabButtons = tabs.map((tab) => `<button class="${state.panelTab === tab ? 'active' : ''}" data-action="panel-tab" data-tab="${tab}">${labelTab(tab)}</button>`).join('');

  let content = '';
  if (state.panelTab === 'resumen') content = renderAdminSummary();
  if (state.panelTab === 'incidencias') content = renderIncidentsTools();
  if (state.panelTab === 'administradores') content = renderAdminsSection();
  if (state.panelTab === 'usuarios') content = renderUsersSection();
  if (state.panelTab === 'historial') content = renderHistorySection();

  return `<article class="panel-card"><h2>${isSuperadmin() ? 'Panel Superadmin' : 'Panel Administrativo'}</h2><p>Sincronizando datos en tiempo real con Firestore.</p><div class="tabs">${tabButtons}</div></article>${content}`;
}

function labelTab(tab) {
  return { resumen: 'Resumen', incidencias: 'Incidencias', administradores: 'Administradores', usuarios: 'Usuarios', historial: 'Historial' }[tab] || tab;
}

function renderAdminSummary() {
  return `${renderMetrics()}<article class="panel-card"><h3>Actividad reciente</h3>${renderReportList(state.reports.slice(0, 6), 'No hay actividad reciente.', true)}</article>`;
}

function renderIncidentsTools() {
  const filtered = getFilteredReports();
  return `<article class="panel-card"><h3>Buscar y filtrar incidencias</h3>${renderFilters()}<div class="actions-row"><button class="btn-secondary" data-action="export-csv">Exportar CSV</button><button class="btn-primary" data-action="open-report-form">Nueva incidencia</button></div></article>${renderReportList(filtered, 'No hay incidencias con esos filtros.', true)}`;
}

function renderFilters() {
  const categoryOptions = ['<option value="todos">Todas las categorías</option>', ...CATEGORIES.map(([key, label]) => `<option value="${key}" ${state.filters.categoria === key ? 'selected' : ''}>${label}</option>`)].join('');
  const deptOptions = ['<option value="todos">Todos los departamentos</option>', ...DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}" ${state.filters.departamento === dept ? 'selected' : ''}>${escapeHTML(dept)}</option>`)].join('');
  return `<div class="filter-grid">
    <input id="filterSearch" placeholder="Buscar incidencia" value="${escapeHTML(state.filters.search)}">
    <select id="filterEstado"><option value="todos">Todos</option><option value="pendiente" ${state.filters.estado === 'pendiente' ? 'selected' : ''}>Pendientes</option><option value="en_proceso" ${state.filters.estado === 'en_proceso' ? 'selected' : ''}>En proceso</option><option value="resuelto" ${state.filters.estado === 'resuelto' ? 'selected' : ''}>Resueltos</option><option value="cancelado" ${state.filters.estado === 'cancelado' ? 'selected' : ''}>Cancelados</option></select>
    <select id="filterCategoria">${categoryOptions}</select>
    <select id="filterDepartamento">${deptOptions}</select>
    <input id="filterZona" placeholder="Colonia o zona" value="${escapeHTML(state.filters.zona)}">
    <input id="filterFechaInicio" type="date" value="${escapeHTML(state.filters.fechaInicio)}">
    <input id="filterFechaFin" type="date" value="${escapeHTML(state.filters.fechaFin)}">
  </div>`;
}

function getFilteredReports() {
  return state.reports.filter((item) => {
    const searchText = `${item.titulo || ''} ${item.descripcion || ''} ${item.categoria || ''} ${item.zona || ''} ${item.colonia || ''} ${item.departamento || ''}`.toLowerCase();
    const matchesSearch = !state.filters.search || searchText.includes(state.filters.search.toLowerCase());
    const matchesStatus = state.filters.estado === 'todos' || normalizeStatus(item.estado) === state.filters.estado;
    const matchesCategory = state.filters.categoria === 'todos' || getCategoryKey(item.categoriaClave || item.categoria) === state.filters.categoria;
    const matchesDepartment = state.filters.departamento === 'todos' || String(item.departamento || '').trim() === state.filters.departamento;
    const zone = `${item.zona || ''} ${item.colonia || ''} ${item.direccion || ''}`.toLowerCase();
    const matchesZone = !state.filters.zona || zone.includes(state.filters.zona.toLowerCase());
    const dateKey = todayKey(item.fecha || item.fechaCreacion || item.createdAt);
    const matchesStart = !state.filters.fechaInicio || dateKey >= state.filters.fechaInicio;
    const matchesEnd = !state.filters.fechaFin || dateKey <= state.filters.fechaFin;
    return matchesSearch && matchesStatus && matchesCategory && matchesDepartment && matchesZone && matchesStart && matchesEnd;
  });
}

function renderReportList(items, emptyText, allowActions = false) {
  if (!items.length) return `<div class="empty-state"><b>${escapeHTML(emptyText)}</b><small>Última actualización: ahora</small></div>`;
  return `<div class="list">${items.map((item) => renderReportCard(item, allowActions)).join('')}</div>`;
}

function renderReportCard(item, allowActions = false) {
  const estado = normalizeStatus(item.estado);
  const title = safeText(item.titulo || item.categoria, 'Incidencia ciudadana');
  const desc = safeText(item.descripcion, 'Sin descripción');
  const zone = safeText(item.zona || item.colonia || item.direccion, 'Zona no especificada');
  const dept = safeText(item.departamento, 'Sin departamento');
  const categoria = safeText(getCategoryLabel(item.categoriaClave || item.categoria), 'Otro');
  const evidenceCount = Array.isArray(item.evidencias) ? item.evidencias.length : Number(item.evidenciaCount || 0);
  const coords = getReportLatLng(item);
  const coordText = coords ? `<small>🧭 ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</small>` : '';
  const adminActions = allowActions ? `<div class="item-actions">
      <button class="btn-secondary" data-action="open-report-detail" data-id="${item.id}">Detalle / comentarios</button>
      <button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="en_proceso">En proceso</button>
      <button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="resuelto">Resolver</button>
      <button class="btn-danger" data-action="change-status" data-id="${item.id}" data-status="cancelado">Cancelar</button>
      ${renderDepartmentSelect(item)}
    </div>` : `<div class="item-actions"><button class="btn-secondary" data-action="open-report-detail" data-id="${item.id}">Detalle / comentarios</button></div>`;
  return `<article class="item-card"><div><b>${categoryIcon(item.categoriaClave || item.categoria)} ${title}</b><span class="badge ${estado}">${displayStatus(estado)}</span><small>${desc}</small><small>🏷️ ${categoria}</small><small>🏛️ ${dept}</small><small>📍 ${zone}</small>${coordText}<small>📷 Evidencias: ${evidenceCount}</small><small>🕒 ${formatDate(item.fecha || item.fechaCreacion || item.createdAt)}</small></div>${adminActions}</article>`;
}

function renderDepartmentSelect(item) {
  const options = ['<option value="">Asignar departamento</option>', ...DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}" ${item.departamento === dept ? 'selected' : ''}>${escapeHTML(dept)}</option>`)].join('');
  return `<select class="dept-select" data-action="assign-department" data-id="${item.id}">${options}</select>`;
}

function renderAdminsSection() {
  if (!isSuperadmin()) return `<div class="empty-state"><b>Acceso exclusivo de Superadmin.</b></div>`;
  const activos = state.admins.filter((a) => String(a.estado || 'activo').toLowerCase() === 'activo').length;
  const inactivos = state.admins.length - activos;
  return `<article class="panel-card"><h3>Administradores</h3><div class="metrics-grid">${metricCard('🛡️', state.admins.length, 'Registrados')}${metricCard('✅', activos, 'Activos')}${metricCard('⛔', inactivos, 'Inactivos')}</div><button class="btn-primary full" data-action="open-admin-form">Agregar administrador</button></article>${renderAdminTable()}`;
}

function renderAdminTable() {
  if (!state.admins.length) return `<div class="empty-state"><b>No hay administradores registrados.</b><small>Agrega un nuevo administrador para comenzar.</small></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody>${state.admins.map((a) => `<tr><td>${safeText(a.nombre)}</td><td>${safeText(a.correo)}</td><td>${safeText(a.rol)}</td><td>${safeText(a.estado, 'activo')}</td><td>${formatDate(a.ultimoAcceso)}</td><td><button class="btn-secondary" data-action="edit-admin" data-id="${a.id}">Editar</button> <button class="btn-danger" data-action="toggle-admin" data-id="${a.id}">${String(a.estado || 'activo').toLowerCase() === 'activo' ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderUsersSection() {
  if (!state.users.length) return `<div class="empty-state"><b>No hay usuarios registrados.</b></div>`;
  return `<article class="panel-card"><h3>Usuarios registrados</h3></article><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Última conexión</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${safeText(u.nombre)}</td><td>${safeText(u.correo)}</td><td>${safeText(u.rol)}</td><td>${safeText(u.estado, 'activo')}</td><td>${formatDate(u.ultimaConexion)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderHistorySection() {
  if (!state.history.length) return `<div class="empty-state"><b>No hay historial de cambios todavía.</b></div>`;
  return `<div class="list">${state.history.slice(0, 30).map((h) => `<article class="item-card"><div><b>${safeText(h.accion, 'Cambio registrado')}</b><small>${safeText(h.detalle)}</small><small>${formatDate(h.fecha)}</small></div></article>`).join('')}</div>`;
}

function renderReportsView() {
  dom.reportsView.innerHTML = `<article class="panel-card"><h2>Reportes</h2><p>Consulta incidencias sincronizadas con Firestore.</p>${renderFilters()}<div class="actions-row"><button class="btn-primary" data-action="open-report-form">Nueva incidencia</button>${canManageReports() ? '<button class="btn-secondary" data-action="export-csv">Exportar CSV</button>' : ''}</div></article>${renderReportList(getFilteredReports(), 'No hay incidencias registradas todavía.', canManageReports())}`;
  bindDynamicActions();
}

function renderMapView() {
  const items = getFilteredReports();
  dom.mapView.innerHTML = `<article class="panel-card"><h2>Mapa de incidencias</h2><p>Mapa interactivo con marcadores por categoría. Usa GPS al crear una incidencia para ubicarla automáticamente.</p>${renderFilters()}</article><div id="interactiveMap" class="map-box" style="height:420px; padding:0; overflow:hidden;"></div><article class="panel-card"><h3>Ubicaciones registradas</h3>${items.length ? items.map((item) => `<div class="map-pin">${categoryIcon(item.categoriaClave || item.categoria)} ${safeText(item.zona || item.colonia || item.direccion, 'Ubicación registrada')} · ${safeText(getCategoryLabel(item.categoriaClave || item.categoria), 'Incidencia')}</div>`).join('') : '<div class="empty-state"><b>No hay ubicaciones registradas.</b></div>'}</article>`;
  bindDynamicActions();
  window.setTimeout(renderLeafletMap, 80);
}

function getReportLatLng(item) {
  const lat = Number(item.latitud ?? item.ubicacion?.lat ?? item.ubicacion?.latitude);
  const lng = Number(item.longitud ?? item.ubicacion?.lng ?? item.ubicacion?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function renderLeafletMap() {
  if (state.activeView !== 'map') return;
  const container = $('#interactiveMap');
  if (!container) return;
  if (!window.L) {
    container.innerHTML = '<div class="empty-state"><b>No se pudo cargar el mapa interactivo.</b><small>Revisa tu conexión a internet.</small></div>';
    return;
  }
  if (state.mapInstance) {
    try { state.mapInstance.remove(); } catch (error) { console.warn('Mapa anterior no cerrado', error); }
    state.mapInstance = null;
  }

  const L = window.L;
  const points = getFilteredReports().map((item) => ({ item, coords: getReportLatLng(item) })).filter((entry) => entry.coords);
  const center = points[0]?.coords || DEFAULT_CENTER;
  const map = L.map(container, { zoomControl: true }).setView(center, points.length ? 14 : 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  points.forEach(({ item, coords }) => {
    const icon = L.divIcon({ className: 'conecta-marker', html: `<span style="font-size:24px">${categoryIcon(item.categoriaClave || item.categoria)}</span>`, iconSize: [28, 28] });
    L.marker(coords, { icon }).addTo(map).bindPopup(`<b>${safeText(item.titulo || item.categoria, 'Incidencia')}</b><br>${displayStatus(item.estado)}<br>${safeText(item.zona || item.colonia || '', 'Sin zona')}`);
  });

  if (points.length > 1) {
    const bounds = L.latLngBounds(points.map((entry) => entry.coords));
    map.fitBounds(bounds, { padding: [28, 28] });
  }

  state.mapInstance = map;
}

function renderProfileView() {
  const p = state.profile || {};
  dom.profileView.innerHTML = `<article class="panel-card"><h2>Mis datos</h2><p>Actualiza tu información directamente en la base de datos.</p><form id="profileForm" class="form-grid"><label>Nombre<input id="profileNombre" value="${safeText(p.nombre, '')}"></label><label>Num. de teléfono<input id="profileTelefono" value="${safeText(p.numeroTelefono || p.telefono, '')}"></label><label>Ocupación<input id="profileOcupacion" value="${safeText(p.ocupacion, '')}"></label><label>Descripción del Apoyo<textarea id="profileDescripcion">${safeText(p.descripcionApoyo, '')}</textarea></label><button class="btn-primary full" type="submit">Guardar cambios</button><div id="profileMessage" class="message"></div></form></article>`;
  $('#profileForm')?.addEventListener('submit', saveProfile);
}

async function saveProfile(event) {
  event.preventDefault();
  const msg = $('#profileMessage');
  msg.textContent = 'Guardando en Firestore...';
  try {
    const data = {
      nombre: $('#profileNombre').value.trim(),
      telefono: $('#profileTelefono').value.trim(),
      numeroTelefono: $('#profileTelefono').value.trim(),
      ocupacion: $('#profileOcupacion').value.trim(),
      descripcionApoyo: $('#profileDescripcion').value.trim(),
      fechaActualizacion: serverTimestamp()
    };
    await setDoc(doc(db, 'usuarios', state.user.uid), data, { merge: true });
    if (isAdmin()) {
      const adminId = normalizeEmail(state.user.email).replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'administradores', adminId), { nombre: data.nombre, fechaActualizacion: serverTimestamp() }, { merge: true });
    }
    msg.className = 'message ok';
    msg.textContent = 'Datos guardados correctamente.';
  } catch (error) {
    msg.className = 'message err';
    msg.textContent = `Error al guardar: ${error.code || error.message}`;
  }
}

function bindDynamicActions() {
  $$('[data-action="panel-tab"]').forEach((button) => {
    button.onclick = () => { state.panelTab = button.dataset.tab; renderPanel(); };
  });
  $$('[data-action="open-report-form"]').forEach((button) => button.onclick = openReportForm);
  $$('[data-action="open-report-detail"]').forEach((button) => button.onclick = () => openReportDetail(button.dataset.id));
  $$('[data-action="open-admin-form"]').forEach((button) => button.onclick = () => openAdminForm());
  $$('[data-action="edit-admin"]').forEach((button) => button.onclick = () => openAdminForm(button.dataset.id));
  $$('[data-action="toggle-admin"]').forEach((button) => button.onclick = () => toggleAdmin(button.dataset.id));
  $$('[data-action="change-status"]').forEach((button) => button.onclick = () => changeReportStatus(button.dataset.id, button.dataset.status));
  $$('[data-action="export-csv"]').forEach((button) => button.onclick = exportReportsCsv);
  $$('[data-action="assign-department"]').forEach((select) => select.onchange = () => assignDepartment(select.dataset.id, select.value));
  ['filterSearch', 'filterEstado', 'filterCategoria', 'filterDepartamento', 'filterZona', 'filterFechaInicio', 'filterFechaFin'].forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;
    input.oninput = () => {
      state.filters.search = $('#filterSearch')?.value || '';
      state.filters.estado = $('#filterEstado')?.value || 'todos';
      state.filters.categoria = $('#filterCategoria')?.value || 'todos';
      state.filters.departamento = $('#filterDepartamento')?.value || 'todos';
      state.filters.zona = $('#filterZona')?.value || '';
      state.filters.fechaInicio = $('#filterFechaInicio')?.value || '';
      state.filters.fechaFin = $('#filterFechaFin')?.value || '';
      renderAll();
    };
  });
}

function openModal(title, body) {
  clearCommentSubscription();
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = body;
  dom.modal.classList.add('active');
}

function closeModal() {
  clearCommentSubscription();
  dom.modal.classList.remove('active');
  dom.modalBody.innerHTML = '';
}

function openReportForm() {
  const categoryOptions = CATEGORIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  const deptOptions = DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`).join('');
  openModal('Nueva incidencia', `<form id="newReportForm" class="form-grid">
    <label>Título<input id="newReportTitle" placeholder="Ej. Fuga de agua"></label>
    <label>Descripción<textarea id="newReportDesc" required placeholder="Describe claramente el problema"></textarea></label>
    <label>Categoría<select id="newReportCategory">${categoryOptions}</select></label>
    <label>Departamento sugerido<select id="newReportDepartment">${deptOptions}</select></label>
    <label>Colonia o zona<input id="newReportZone" placeholder="Colonia, calle o referencia"></label>
    <input id="newReportLat" type="hidden"><input id="newReportLng" type="hidden">
    <button class="btn-secondary full" id="gpsBtn" type="button">📍 Capturar ubicación GPS</button>
    <label>Fotografías de evidencia<input id="newReportFiles" type="file" accept="image/*" capture="environment" multiple></label>
    <small class="message">Puedes adjuntar hasta ${MAX_EVIDENCE_FILES} fotos. Se comprimen para Firestore.</small>
    <button class="btn-primary full" type="submit">Guardar incidencia</button>
    <div id="newReportMessage" class="message"></div>
  </form>`);
  $('#newReportForm').onsubmit = createReport;
  $('#gpsBtn').onclick = captureGPS;
}

function captureGPS() {
  const msg = $('#newReportMessage');
  if (!navigator.geolocation) {
    msg.className = 'message err';
    msg.textContent = 'Este dispositivo no permite geolocalización.';
    return;
  }
  msg.className = 'message';
  msg.textContent = 'Solicitando ubicación GPS...';
  navigator.geolocation.getCurrentPosition((position) => {
    $('#newReportLat').value = String(position.coords.latitude);
    $('#newReportLng').value = String(position.coords.longitude);
    msg.className = 'message ok';
    msg.textContent = `Ubicación capturada: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
  }, (error) => {
    msg.className = 'message err';
    msg.textContent = `No se pudo obtener GPS: ${error.message}`;
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function createReport(event) {
  event.preventDefault();
  const msg = $('#newReportMessage');
  msg.className = 'message';
  msg.textContent = 'Procesando evidencia y guardando incidencia...';
  try {
    const files = Array.from($('#newReportFiles')?.files || []).slice(0, MAX_EVIDENCE_FILES);
    const evidencias = [];
    for (const file of files) {
      const evidence = await compressImageFile(file);
      if (evidence) evidencias.push(evidence);
    }

    const categoriaClave = $('#newReportCategory').value;
    const lat = Number($('#newReportLat').value);
    const lng = Number($('#newReportLng').value);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    await addDoc(collection(db, 'incidencias'), {
      titulo: $('#newReportTitle').value.trim() || getCategoryLabel(categoriaClave),
      descripcion: $('#newReportDesc').value.trim(),
      categoria: getCategoryLabel(categoriaClave),
      categoriaClave,
      departamento: $('#newReportDepartment').value,
      zona: $('#newReportZone').value.trim(),
      estado: 'pendiente',
      usuarioId: state.user.uid,
      idCiudadano: state.user.uid,
      correoUsuario: normalizeEmail(state.user.email),
      nombreUsuario: state.profile?.nombre || state.user.displayName || state.user.email,
      latitud: hasCoords ? lat : null,
      longitud: hasCoords ? lng : null,
      ubicacion: hasCoords ? { lat, lng } : null,
      evidencias,
      evidenciaCount: evidencias.length,
      comentariosCount: 0,
      fecha: serverTimestamp(),
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
    msg.className = 'message ok';
    msg.textContent = 'Incidencia registrada correctamente.';
    setTimeout(closeModal, 900);
  } catch (error) {
    msg.className = 'message err';
    msg.textContent = `Error: ${error.code || error.message}`;
  }
}

function compressImageFile(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve({
          nombre: file.name,
          tipo: 'image/jpeg',
          tamanoOriginal: file.size,
          dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
          fecha: new Date().toISOString()
        });
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function changeReportStatus(id, status) {
  try {
    await updateDoc(doc(db, 'incidencias', id), { estado: status, fechaActualizacion: serverTimestamp() });
    if (isSuperadmin()) {
      await addDoc(collection(db, 'auditoria_admin'), { accion: 'Cambio de estado', detalle: `${id} → ${status}`, correo: state.user.email, fecha: serverTimestamp() });
    }
  } catch (error) {
    alert(`No se pudo actualizar: ${error.code || error.message}`);
  }
}

async function assignDepartment(id, departamento) {
  if (!departamento) return;
  try {
    await updateDoc(doc(db, 'incidencias', id), { departamento, fechaActualizacion: serverTimestamp() });
    if (isSuperadmin()) {
      await addDoc(collection(db, 'auditoria_admin'), { accion: 'Asignación de departamento', detalle: `${id} → ${departamento}`, correo: state.user.email, fecha: serverTimestamp() });
    }
  } catch (error) {
    alert(`No se pudo asignar departamento: ${error.code || error.message}`);
  }
}

function openReportDetail(reportId) {
  const item = state.reports.find((report) => report.id === reportId);
  if (!item) return;
  const evidencias = Array.isArray(item.evidencias) ? item.evidencias : [];
  const evidenceHTML = evidencias.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0;">${evidencias.map((e) => `<a href="${e.dataUrl}" target="_blank" rel="noopener"><img src="${e.dataUrl}" alt="Evidencia" style="width:100%;height:110px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.18);"></a>`).join('')}</div>`
    : '<div class="empty-state"><b>Sin fotografías de evidencia.</b></div>';
  const coords = getReportLatLng(item);
  openModal('Detalle de incidencia', `<article class="panel-card">
    <h3>${safeText(item.titulo || item.categoria, 'Incidencia')}</h3>
    <span class="badge ${normalizeStatus(item.estado)}">${displayStatus(item.estado)}</span>
    <p>${safeText(item.descripcion, 'Sin descripción')}</p>
    <small>🏷️ ${safeText(getCategoryLabel(item.categoriaClave || item.categoria), 'Otro')}</small><br>
    <small>🏛️ ${safeText(item.departamento, 'Sin departamento')}</small><br>
    <small>📍 ${safeText(item.zona || item.colonia || item.direccion, 'Sin zona')}</small><br>
    ${coords ? `<small>🧭 ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</small><br>` : ''}
    <small>🕒 ${formatDate(item.fecha || item.fechaCreacion || item.createdAt)}</small>
    <h3>Fotografías</h3>${evidenceHTML}
  </article>
  <article class="panel-card"><h3>Comentarios</h3><div id="commentsList" class="list"><div class="empty-state"><b>Sincronizando comentarios...</b></div></div><form id="commentForm" class="form-grid"><label>Nuevo comentario<textarea id="commentText" required placeholder="Escribe una observación"></textarea></label><button class="btn-primary full" type="submit">Enviar comentario</button><div id="commentMessage" class="message"></div></form></article>`);
  $('#commentForm').onsubmit = (event) => saveComment(event, reportId);
  subscribeComments(reportId);
}

function subscribeComments(reportId) {
  clearCommentSubscription();
  const q = query(collection(db, 'comentarios'), where('incidenciaId', '==', reportId));
  state.commentUnsubscribe = onSnapshot(q, (snapshot) => {
    state.comments = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    renderCommentsList();
  }, (error) => {
    const box = $('#commentsList');
    if (box) box.innerHTML = `<div class="empty-state"><b>Error al cargar comentarios.</b><small>${escapeHTML(error.code || error.message)}</small></div>`;
  });
}

function renderCommentsList() {
  const box = $('#commentsList');
  if (!box) return;
  const comments = [...state.comments].sort((a, b) => (getDate(a.fecha)?.getTime() || 0) - (getDate(b.fecha)?.getTime() || 0));
  if (!comments.length) {
    box.innerHTML = '<div class="empty-state"><b>No hay comentarios todavía.</b><small>Sé el primero en colaborar.</small></div>';
    return;
  }
  box.innerHTML = comments.map((c) => `<article class="item-card"><div><b>${safeText(c.nombreUsuario || c.correoUsuario, 'Usuario')}</b><small>${safeText(c.texto, '')}</small><small>${formatDate(c.fecha)}</small></div></article>`).join('');
}

async function saveComment(event, reportId) {
  event.preventDefault();
  const msg = $('#commentMessage');
  const text = $('#commentText').value.trim();
  if (!text) return;
  msg.className = 'message';
  msg.textContent = 'Guardando comentario...';
  try {
    await addDoc(collection(db, 'comentarios'), {
      incidenciaId: reportId,
      texto: text,
      usuarioId: state.user.uid,
      correoUsuario: normalizeEmail(state.user.email),
      nombreUsuario: state.profile?.nombre || state.user.displayName || state.user.email,
      fecha: serverTimestamp()
    });
    await updateDoc(doc(db, 'incidencias', reportId), { comentariosCount: state.comments.length + 1, fechaActualizacion: serverTimestamp() }).catch(() => null);
    $('#commentText').value = '';
    msg.className = 'message ok';
    msg.textContent = 'Comentario publicado.';
  } catch (error) {
    msg.className = 'message err';
    msg.textContent = `Error: ${error.code || error.message}`;
  }
}

function openAdminForm(adminId = null) {
  const current = adminId ? state.admins.find((item) => item.id === adminId) : {};
  openModal(adminId ? 'Editar administrador' : 'Nuevo administrador', `<form id="adminForm" class="form-grid"><label>Nombre<input id="adminName" value="${safeText(current?.nombre, '')}"></label><label>Correo<input id="adminEmail" type="email" value="${safeText(current?.correo, '')}"></label><label>Rol<select id="adminRole"><option ${current?.rol === 'Administrador básico' ? 'selected' : ''}>Administrador básico</option><option ${current?.rol === 'Superadmin' ? 'selected' : ''}>Superadmin</option></select></label><label>Estado<select id="adminStatus"><option value="activo" ${current?.estado !== 'inactivo' ? 'selected' : ''}>activo</option><option value="inactivo" ${current?.estado === 'inactivo' ? 'selected' : ''}>inactivo</option></select></label><button class="btn-primary full" type="submit">Guardar administrador</button><div id="adminFormMessage" class="message"></div></form>`);
  $('#adminForm').onsubmit = (event) => saveAdmin(event, adminId);
}

async function saveAdmin(event, adminId) {
  event.preventDefault();
  const email = normalizeEmail($('#adminEmail').value);
  const id = adminId || email.replace(/[^a-z0-9]/g, '_');
  const msg = $('#adminFormMessage');
  msg.textContent = 'Guardando administrador...';
  try {
    await setDoc(doc(db, 'administradores', id), {
      nombre: $('#adminName').value.trim() || email.split('@')[0],
      correo: email,
      rol: $('#adminRole').value,
      estado: $('#adminStatus').value,
      fechaActualizacion: serverTimestamp()
    }, { merge: true });
    await addDoc(collection(db, 'auditoria_admin'), { accion: adminId ? 'Editar administrador' : 'Crear administrador', detalle: email, correo: state.user.email, fecha: serverTimestamp() });
    msg.className = 'message ok';
    msg.textContent = 'Administrador guardado.';
    setTimeout(closeModal, 700);
  } catch (error) {
    msg.className = 'message err';
    msg.textContent = `Error: ${error.code || error.message}`;
  }
}

async function toggleAdmin(adminId) {
  const admin = state.admins.find((item) => item.id === adminId);
  if (!admin) return;
  const next = String(admin.estado || 'activo').toLowerCase() === 'activo' ? 'inactivo' : 'activo';
  await updateDoc(doc(db, 'administradores', adminId), { estado: next, fechaActualizacion: serverTimestamp() });
}

function exportReportsCsv() {
  const rows = [
    ['Titulo', 'Descripcion', 'Categoria', 'Estado', 'Departamento', 'Zona', 'Latitud', 'Longitud', 'Fecha'],
    ...getFilteredReports().map((r) => {
      const coords = getReportLatLng(r) || ['', ''];
      return [r.titulo || r.categoria || '', r.descripcion || '', getCategoryLabel(r.categoriaClave || r.categoria), displayStatus(r.estado), r.departamento || '', r.zona || r.colonia || '', coords[0], coords[1], formatDate(r.fecha || r.fechaCreacion)];
    })
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `incidencias-conecta-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function setupEvents() {
  dom.goLoginBtn?.addEventListener('click', () => { setAuthMode('login'); showScreen('auth'); });
  dom.goRegisterBtn?.addEventListener('click', () => { setAuthMode('register'); showScreen('auth'); });
  dom.backWelcomeBtn?.addEventListener('click', () => showScreen('welcome'));
  dom.toggleAuthBtn?.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
  dom.authForm?.addEventListener('submit', handleAuthSubmit);
  dom.logoutBtn?.addEventListener('click', async () => { await signOut(auth); });
  dom.closeModalBtn?.addEventListener('click', closeModal);
  dom.modal?.addEventListener('click', (event) => { if (event.target === dom.modal) closeModal(); });
  $$('#bottomNav button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
}

onAuthStateChanged(auth, async (user) => {
  clearSubscriptions();
  state.user = user;
  state.profile = null;
  state.reports = [];
  state.users = [];
  state.admins = [];
  state.history = [];

  if (!user) {
    state.role = 'Visitante';
    showScreen('welcome');
    setAuthMode('login');
    return;
  }

  try {
    state.profile = await ensureUserProfile(user, getRoleByEmail(user.email));
    state.role = getRoleByEmail(user.email, state.profile.rol);
    updateHeader();
    showScreen('main');
    setView('panel');
    startRealtime();
  } catch (error) {
    console.error('No se pudo preparar perfil:', error);
    showScreen('main');
    state.role = getRoleByEmail(user.email);
    updateHeader();
    setView('panel');
    startRealtime();
  }
});

setupEvents();
setAuthMode('login');
console.info('Conecta Martínez limpia conectada a Firebase:', firebaseConfig.projectId);