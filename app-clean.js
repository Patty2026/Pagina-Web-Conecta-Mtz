/* Conecta Martínez - núcleo limpio y compatible con index.html */
import firebaseConfig from './firebase-config.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
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

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const BASIC_ADMIN_EMAIL = 'adminb@gmail.com';
const ADMIN_EMAILS = new Set([SUPERADMIN_EMAIL, BASIC_ADMIN_EMAIL]);

const CATEGORIES = [
  ['baches', 'Baches en vialidades', '🕳️'],
  ['alumbrado', 'Alumbrado público', '💡'],
  ['basura', 'Recolección de basura', '🗑️'],
  ['agua', 'Fugas de agua', '💧'],
  ['areas_verdes', 'Áreas verdes', '🌳'],
  ['seguridad', 'Seguridad / Riesgo', '⚠️'],
  ['otro', 'Otro', '📍']
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
  startBtn: $('#startBtn'),
  aboutBtn: $('#aboutBtn'),
  authForm: $('#authForm'),
  authTitle: $('#authTitle'),
  authSubtitle: $('#authSubtitle'),
  nameInput: $('#nameInput'),
  emailInput: $('#emailInput'),
  passwordInput: $('#passwordInput'),
  roleLabel: $('#roleLabel'),
  roleInput: $('#roleInput'),
  authSubmit: $('#authSubmit'),
  toggleAuthBtn: $('#toggleAuthBtn'),
  authMessage: $('#authMessage'),
  userAvatar: $('#userAvatar'),
  userName: $('#userName'),
  userRole: $('#userRole'),
  logoutBtn: $('#logoutBtn'),
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
  pendingLocation: null,
  pendingEvidence: []
};

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  return {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
    cancelado: 'Cancelado'
  }[normalizeStatus(value)] || 'Pendiente';
}

function categoryKey(value) {
  const clean = String(value || '').trim();
  return CATEGORIES.find(([key, label]) => key === clean || label === clean)?.[0] || 'otro';
}

function categoryLabel(value) {
  const key = categoryKey(value);
  return CATEGORIES.find(([itemKey]) => itemKey === key)?.[1] || 'Otro';
}

function categoryIcon(value) {
  const key = categoryKey(value);
  return CATEGORIES.find(([itemKey]) => itemKey === key)?.[2] || '📍';
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

function setMessage(text, type = '') {
  if (!dom.authMessage) return;
  dom.authMessage.className = `message ${type}`.trim();
  dom.authMessage.textContent = text || '';
}

function getDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = getDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function formatDate(value) {
  const date = getDate(value);
  if (!date) return 'Sin fecha';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function getReportLatLng(item) {
  const lat = Number(item.latitud ?? item.ubicacion?.lat ?? item.ubicacion?.latitude);
  const lng = Number(item.longitud ?? item.ubicacion?.lng ?? item.ubicacion?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function clearSubscriptions() {
  state.unsubscribes.forEach((unsubscribe) => {
    try { unsubscribe(); } catch (error) { console.warn('No se pudo cerrar listener', error); }
  });
  state.unsubscribes = [];
  clearCommentSubscription();
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
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === 'register';
  if (dom.authTitle) dom.authTitle.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  if (dom.authSubtitle) dom.authSubtitle.textContent = isRegister ? 'Registra tus datos para comenzar.' : 'Accede para continuar.';
  if (dom.authSubmit) dom.authSubmit.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  if (dom.toggleAuthBtn) dom.toggleAuthBtn.textContent = isRegister ? 'Ya tengo cuenta, iniciar sesión' : '¿No tienes cuenta? Regístrate';
  dom.nameInput?.closest('label')?.classList.toggle('hidden', !isRegister);
  dom.roleLabel?.classList.toggle('hidden', !isRegister);
  if (dom.passwordInput) dom.passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  setMessage('');
}

function setView(view) {
  state.activeView = view;
  $$('.view').forEach((item) => item.classList.remove('active'));
  $(`#${view}View`)?.classList.add('active');
  $$('.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  renderCurrentView();
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
  const email = normalizeEmail(dom.emailInput?.value);
  const password = dom.passwordInput?.value || '';
  const selectedRole = dom.roleInput?.value || 'Ciudadano';
  const name = dom.nameInput?.value?.trim() || email.split('@')[0];

  if (!email || !password) {
    setMessage('Completa correo y contraseña.', 'err');
    return;
  }

  if (dom.authSubmit) dom.authSubmit.disabled = true;
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
    if (dom.authSubmit) dom.authSubmit.disabled = false;
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
      renderCurrentView();
    }
  }, (error) => console.error('Error perfil:', error)));

  const allReports = collection(db, 'incidencias');
  state.unsubscribes.push(onSnapshot(allReports, (snapshot) => {
    state.reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderCurrentView();
  }, (error) => {
    console.warn('No se pudieron leer todas las incidencias:', error?.code || error);
    const ownReports = query(collection(db, 'incidencias'), where('usuarioId', '==', state.user.uid));
    state.unsubscribes.push(onSnapshot(ownReports, (snapshot) => {
      state.reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderCurrentView();
    }, (ownError) => console.error('Error incidencias propias:', ownError)));
  }));

  if (isAdmin()) {
    state.unsubscribes.push(onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderCurrentView();
    }, (error) => console.error('Error usuarios:', error)));

    state.unsubscribes.push(onSnapshot(collection(db, 'administradores'), (snapshot) => {
      state.admins = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderCurrentView();
    }, (error) => console.error('Error administradores:', error)));
  }

  if (isSuperadmin()) {
    state.unsubscribes.push(onSnapshot(collection(db, 'auditoria_admin'), (snapshot) => {
      state.history = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderCurrentView();
    }, (error) => console.error('Error auditoría:', error)));
  }
}

function updateHeader() {
  const name = String(state.profile?.nombre || state.user?.displayName || state.user?.email?.split('@')[0] || 'Usuario').trim();
  if (dom.userName) dom.userName.textContent = name;
  if (dom.userRole) dom.userRole.textContent = state.role;
  if (dom.userAvatar) dom.userAvatar.textContent = name.charAt(0).toUpperCase();
}

function getVisibleReports() {
  if (canManageReports()) return state.reports;
  return state.reports.filter((item) => item.usuarioId === state.user?.uid || item.idCiudadano === state.user?.uid || item.uid === state.user?.uid);
}

function getMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const source = canManageReports() ? state.reports : getVisibleReports();
  const total = source.length;
  const todayCount = source.filter((item) => dateKey(item.fecha || item.fechaCreacion || item.createdAt) === today).length;
  const pendientes = source.filter((item) => normalizeStatus(item.estado) === 'pendiente').length;
  const enProceso = source.filter((item) => normalizeStatus(item.estado) === 'en_proceso').length;
  const resueltos = source.filter((item) => normalizeStatus(item.estado) === 'resuelto').length;
  const cancelados = source.filter((item) => normalizeStatus(item.estado) === 'cancelado').length;
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
    ${isAdmin() ? metricCard('👥', m.usuarios, 'Usuarios registrados') : ''}
    ${isAdmin() ? metricCard('🛡️', m.adminsActivos, 'Administradores activos') : ''}
    ${metricCard('⛔', m.cancelados, 'Canceladas')}
  </section>`;
}

function renderCurrentView() {
  if (!state.user) return;
  if (state.activeView === 'panel') renderPanel();
  if (state.activeView === 'reports') renderReportsView();
  if (state.activeView === 'map') renderMapView();
  if (state.activeView === 'profile') renderProfileView();
}

function renderPanel() {
  if (!dom.panelView) return;
  if (isAdmin()) dom.panelView.innerHTML = renderAdminPanel();
  else if (isSupport()) dom.panelView.innerHTML = renderSupportPanel();
  else dom.panelView.innerHTML = renderCitizenPanel();
  bindDynamicActions();
}

function renderCitizenPanel() {
  return `<article class="panel-card"><h2>Panel ciudadano</h2><p>Reporta incidencias con GPS, evidencia fotográfica y seguimiento.</p><button class="btn-primary full" data-action="open-report-form" type="button">+ Nueva incidencia</button></article>${renderMetrics()}${renderReportList(getVisibleReports().slice(0, 5), 'No hay incidencias registradas todavía.')}`;
}

function renderSupportPanel() {
  return `<article class="panel-card"><h2>Panel de Apoyo Comunitario</h2><p>Atiende incidencias registradas por la ciudadanía.</p></article>${renderMetrics()}${renderReportList(getFilteredReports(), 'No hay incidencias registradas todavía.', true)}`;
}

function renderAdminPanel() {
  const tabs = ['resumen', 'incidencias', ...(isSuperadmin() ? ['administradores', 'usuarios', 'historial'] : ['usuarios'])];
  const tabButtons = tabs.map((tab) => `<button class="${state.panelTab === tab ? 'active' : ''}" data-action="panel-tab" data-tab="${tab}" type="button">${labelTab(tab)}</button>`).join('');
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
  return `<article class="panel-card"><h3>Buscar y filtrar incidencias</h3>${renderFilters()}<div class="actions-row"><button class="btn-secondary" data-action="export-csv" type="button">Exportar CSV</button><button class="btn-primary" data-action="open-report-form" type="button">Nueva incidencia</button></div></article>${renderReportList(filtered, 'No hay incidencias con esos filtros.', true)}`;
}

function renderFilters() {
  const categoryOptions = ['<option value="todos">Todas las categorías</option>', ...CATEGORIES.map(([key, label]) => `<option value="${key}" ${state.filters.categoria === key ? 'selected' : ''}>${label}</option>`)].join('');
  const deptOptions = ['<option value="todos">Todos los departamentos</option>', ...DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}" ${state.filters.departamento === dept ? 'selected' : ''}>${escapeHTML(dept)}</option>`)].join('');
  return `<div class="filter-grid">
    <label><span>Buscar</span><input id="filterSearch" placeholder="Buscar incidencia" value="${escapeHTML(state.filters.search)}"></label>
    <label><span>Estado</span><select id="filterEstado"><option value="todos">Todos</option><option value="pendiente" ${state.filters.estado === 'pendiente' ? 'selected' : ''}>Pendientes</option><option value="en_proceso" ${state.filters.estado === 'en_proceso' ? 'selected' : ''}>En proceso</option><option value="resuelto" ${state.filters.estado === 'resuelto' ? 'selected' : ''}>Resueltos</option><option value="cancelado" ${state.filters.estado === 'cancelado' ? 'selected' : ''}>Cancelados</option></select></label>
    <label><span>Categoría</span><select id="filterCategoria">${categoryOptions}</select></label>
    <label><span>Departamento</span><select id="filterDepartamento">${deptOptions}</select></label>
    <label><span>Colonia o zona</span><input id="filterZona" placeholder="Colonia o zona" value="${escapeHTML(state.filters.zona)}"></label>
    <label><span>Fecha inicial</span><input id="filterFechaInicio" type="date" value="${escapeHTML(state.filters.fechaInicio)}"></label>
    <label><span>Fecha final</span><input id="filterFechaFin" type="date" value="${escapeHTML(state.filters.fechaFin)}"></label>
  </div>`;
}

function getFilteredReports() {
  const base = canManageReports() ? state.reports : getVisibleReports();
  return base.filter((item) => {
    const searchText = `${item.titulo || ''} ${item.descripcion || ''} ${item.categoria || ''} ${item.categoriaClave || ''} ${item.zona || ''} ${item.colonia || ''} ${item.direccion || ''} ${item.departamento || ''}`.toLowerCase();
    const zone = `${item.zona || ''} ${item.colonia || ''} ${item.direccion || ''}`.toLowerCase();
    const itemDate = dateKey(item.fecha || item.fechaCreacion || item.createdAt);
    return (!state.filters.search || searchText.includes(state.filters.search.toLowerCase()))
      && (state.filters.estado === 'todos' || normalizeStatus(item.estado) === state.filters.estado)
      && (state.filters.categoria === 'todos' || categoryKey(item.categoriaClave || item.categoria) === state.filters.categoria)
      && (state.filters.departamento === 'todos' || String(item.departamento || '').trim() === state.filters.departamento)
      && (!state.filters.zona || zone.includes(state.filters.zona.toLowerCase()))
      && (!state.filters.fechaInicio || itemDate >= state.filters.fechaInicio)
      && (!state.filters.fechaFin || itemDate <= state.filters.fechaFin);
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
  const categoria = safeText(categoryLabel(item.categoriaClave || item.categoria), 'Otro');
  const evidenceCount = Array.isArray(item.evidencias) ? item.evidencias.length : Number(item.evidenciaCount || 0);
  const coords = getReportLatLng(item);
  const coordText = coords ? `<small>🧭 ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</small>` : '';
  const actions = allowActions ? `<div class="item-actions">
      <button class="btn-secondary" data-action="open-report-detail" data-id="${item.id}" type="button">Detalle / comentarios</button>
      <button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="en_proceso" type="button">En proceso</button>
      <button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="resuelto" type="button">Resolver</button>
      <button class="btn-danger" data-action="change-status" data-id="${item.id}" data-status="cancelado" type="button">Cancelar</button>
      ${renderDepartmentSelect(item)}
    </div>` : `<div class="item-actions"><button class="btn-secondary" data-action="open-report-detail" data-id="${item.id}" type="button">Detalle / comentarios</button></div>`;
  return `<article class="item-card"><div><b>${categoryIcon(item.categoriaClave || item.categoria)} ${title}</b><span class="badge ${estado}">${displayStatus(estado)}</span><small>${desc}</small><small>🏷️ ${categoria}</small><small>🏛️ ${dept}</small><small>📍 ${zone}</small>${coordText}<small>📷 Evidencias: ${evidenceCount}</small><small>🕒 ${formatDate(item.fecha || item.fechaCreacion || item.createdAt)}</small></div>${actions}</article>`;
}

function renderDepartmentSelect(item) {
  const options = ['<option value="">Asignar departamento</option>', ...DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}" ${item.departamento === dept ? 'selected' : ''}>${escapeHTML(dept)}</option>`)].join('');
  return `<select class="dept-select" data-action="assign-department" data-id="${item.id}">${options}</select>`;
}

function renderAdminsSection() {
  if (!isSuperadmin()) return `<div class="empty-state"><b>Acceso exclusivo de Superadmin.</b></div>`;
  const activos = state.admins.filter((a) => String(a.estado || 'activo').toLowerCase() === 'activo').length;
  const inactivos = state.admins.length - activos;
  return `<article class="panel-card"><h3>Administradores</h3><div class="metrics-grid">${metricCard('🛡️', state.admins.length, 'Registrados')}${metricCard('✅', activos, 'Activos')}${metricCard('⛔', inactivos, 'Inactivos')}</div><button class="btn-primary full" data-action="open-admin-form" type="button">Agregar administrador</button></article>${renderAdminTable()}`;
}

function renderAdminTable() {
  if (!state.admins.length) return `<div class="empty-state"><b>No hay administradores registrados.</b><small>Agrega un nuevo administrador para comenzar.</small></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody>${state.admins.map((a) => `<tr><td>${safeText(a.nombre)}</td><td>${safeText(a.correo)}</td><td>${safeText(a.rol)}</td><td>${safeText(a.estado, 'activo')}</td><td>${formatDate(a.ultimoAcceso)}</td><td><button class="btn-secondary" data-action="edit-admin" data-id="${a.id}" type="button">Editar</button> <button class="btn-danger" data-action="toggle-admin" data-id="${a.id}" type="button">${String(a.estado || 'activo').toLowerCase() === 'activo' ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
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
  if (!dom.reportsView) return;
  dom.reportsView.innerHTML = `<article class="panel-card"><h2>Reportes</h2><p>Consulta incidencias sincronizadas con Firestore.</p>${renderFilters()}<div class="actions-row"><button class="btn-primary" data-action="open-report-form" type="button">Nueva incidencia</button>${canManageReports() ? '<button class="btn-secondary" data-action="export-csv" type="button">Exportar CSV</button>' : ''}</div></article>${renderReportList(getFilteredReports(), 'No hay incidencias registradas todavía.', canManageReports())}`;
  bindDynamicActions();
}

function renderMapView() {
  if (!dom.mapView) return;
  const items = getFilteredReports();
  dom.mapView.innerHTML = `<article class="panel-card"><h2>Mapa de incidencias</h2><p>Mapa interactivo con marcadores por categoría. Usa GPS al crear una incidencia para ubicarla automáticamente.</p>${renderFilters()}</article><div id="interactiveMap" class="map-box" style="height:420px; padding:0; overflow:hidden;"><div class="empty-state" style="margin:16px;"><b>Cargando mapa...</b><small>Sincronizando ubicaciones registradas.</small></div></div><article class="panel-card"><h3>Ubicaciones registradas</h3>${items.length ? items.map((item) => `<div class="map-pin">${categoryIcon(item.categoriaClave || item.categoria)} ${safeText(item.zona || item.colonia || item.direccion, 'Ubicación registrada')} · ${safeText(categoryLabel(item.categoriaClave || item.categoria), 'Incidencia')}</div>`).join('') : '<div class="empty-state"><b>No hay ubicaciones registradas.</b></div>'}</article>`;
  bindDynamicActions();
  setTimeout(() => window.ConectaGoogleMapsAdapter?.render?.(), 120);
  setTimeout(() => {
    if (window.ConectaUseFallbackMap || window.ConectaGoogleMapsFailed) {
      window.dispatchEvent(new CustomEvent('conecta-render-fallback-map', { detail: { reason: 'Usando mapa alternativo.' } }));
    }
  }, 500);
}

function renderProfileView() {
  if (!dom.profileView) return;
  const p = state.profile || {};
  dom.profileView.innerHTML = `<article class="panel-card"><h2>Mis datos</h2><p>Actualiza tu información directamente en la base de datos.</p><form id="profileForm" class="form-grid"><label>Nombre<input id="profileNombre" value="${safeText(p.nombre, '')}"></label><label>Num. de teléfono<input id="profileTelefono" value="${safeText(p.numeroTelefono || p.telefono, '')}"></label><label>Ocupación<input id="profileOcupacion" value="${safeText(p.ocupacion, '')}"></label><label>Descripción del Apoyo<textarea id="profileDescripcion">${safeText(p.descripcionApoyo, '')}</textarea></label><button class="btn-primary full" type="submit">Guardar cambios</button><div id="profileMessage" class="message"></div></form></article>`;
  $('#profileForm')?.addEventListener('submit', saveProfile);
}

async function saveProfile(event) {
  event.preventDefault();
  const msg = $('#profileMessage');
  if (msg) msg.textContent = 'Guardando en Firestore...';
  try {
    const data = {
      nombre: $('#profileNombre')?.value.trim() || '',
      telefono: $('#profileTelefono')?.value.trim() || '',
      numeroTelefono: $('#profileTelefono')?.value.trim() || '',
      ocupacion: $('#profileOcupacion')?.value.trim() || '',
      descripcionApoyo: $('#profileDescripcion')?.value.trim() || '',
      fechaActualizacion: serverTimestamp()
    };
    await setDoc(doc(db, 'usuarios', state.user.uid), data, { merge: true });
    if (isAdmin()) {
      const adminId = normalizeEmail(state.user.email).replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'administradores', adminId), { nombre: data.nombre, fechaActualizacion: serverTimestamp() }, { merge: true });
    }
    if (msg) {
      msg.className = 'message ok';
      msg.textContent = 'Datos guardados correctamente.';
    }
  } catch (error) {
    if (msg) {
      msg.className = 'message err';
      msg.textContent = `Error al guardar: ${error.code || error.message}`;
    }
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
    const eventName = input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'input';
    input[`on${eventName}`] = () => {
      state.filters.search = $('#filterSearch')?.value || '';
      state.filters.estado = $('#filterEstado')?.value || 'todos';
      state.filters.categoria = $('#filterCategoria')?.value || 'todos';
      state.filters.departamento = $('#filterDepartamento')?.value || 'todos';
      state.filters.zona = $('#filterZona')?.value || '';
      state.filters.fechaInicio = $('#filterFechaInicio')?.value || '';
      state.filters.fechaFin = $('#filterFechaFin')?.value || '';
      renderCurrentView();
    };
  });
}

function openModal(title, body) {
  clearCommentSubscription();
  if (dom.modalTitle) dom.modalTitle.textContent = title;
  if (dom.modalBody) dom.modalBody.innerHTML = body;
  dom.modal?.classList.add('active');
}

function closeModal() {
  dom.modal?.classList.remove('active');
  if (dom.modalBody) dom.modalBody.innerHTML = '';
  clearCommentSubscription();
  state.pendingLocation = null;
  state.pendingEvidence = [];
}

function openReportForm() {
  state.pendingLocation = null;
  state.pendingEvidence = [];
  const categoryOptions = CATEGORIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  const deptOptions = DEPARTMENTS.map((dept) => `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`).join('');
  openModal('Nueva incidencia', `<form id="reportForm" class="form-grid">
    <label>Título<input id="reportTitle" placeholder="Ej. Bache frente a la escuela" required></label>
    <label>Categoría<select id="reportCategory">${categoryOptions}</select></label>
    <label>Departamento sugerido<select id="reportDepartment"><option value="">Sin asignar</option>${deptOptions}</select></label>
    <label>Colonia o zona<input id="reportZone" placeholder="Colonia, calle o referencia"></label>
    <label>Descripción<textarea id="reportDescription" placeholder="Describe el incidente" required></textarea></label>

    <div class="evidence-section">
      <p class="field-label">📷 Fotografías de evidencia <small>(máx. 2)</small></p>
      <div class="evidence-buttons">
        <button type="button" id="btnCamera" class="btn-secondary">📷 Tomar foto</button>
        <button type="button" id="btnGallery" class="btn-secondary">🖼️ Elegir de galería</button>
      </div>
      <input id="reportEvidenceCamera" type="file" accept="image/*" capture="environment" multiple style="display:none">
      <input id="reportEvidenceGallery" type="file" accept="image/*" multiple style="display:none">
      <div id="evidencePreview" class="evidence-preview"></div>
    </div>

    <div class="location-section">
      <p class="field-label">📍 Ubicación del incidente</p>
      <div class="evidence-buttons">
        <button id="captureLocationBtn" class="btn-secondary" type="button">📡 Usar GPS</button>
        <button id="pickMapBtn" class="btn-secondary" type="button">🗺️ Marcar en mapa</button>
      </div>
      <span id="locationStatus" class="message">Ubicación pendiente.</span>
      <div id="formMiniMap" style="display:none;height:220px;border-radius:16px;overflow:hidden;margin-top:8px;"></div>
    </div>

    <button class="btn-primary full" type="submit">Guardar incidencia</button>
    <div id="reportMessage" class="message"></div>
  </form>`);

  $('#captureLocationBtn')?.addEventListener('click', captureLocation);
  $('#pickMapBtn')?.addEventListener('click', openFormMap);
  $('#btnCamera')?.addEventListener('click', () => $('#reportEvidenceCamera')?.click());
  $('#btnGallery')?.addEventListener('click', () => $('#reportEvidenceGallery')?.click());
  $('#reportEvidenceCamera')?.addEventListener('change', handleEvidenceFiles);
  $('#reportEvidenceGallery')?.addEventListener('change', handleEvidenceFiles);
  $('#reportForm')?.addEventListener('submit', saveReport);
}

function ensureLeafletForForm() {
  const CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${JS}"]`);
    if (existing) { existing.addEventListener('load', () => resolve(window.L)); return; }
    const script = document.createElement('script');
    script.src = JS;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function openFormMap() {
  const container = $('#formMiniMap');
  const status = $('#locationStatus');
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);">Cargando mapa…</div>';

  try {
    const L = await ensureLeafletForForm();
    container.innerHTML = '';

    const center = state.pendingLocation
      ? [state.pendingLocation.lat, state.pendingLocation.lng]
      : [20.0703, -97.0608];

    const map = L.map(container, { zoomControl: true, attributionControl: false }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    let marker = null;
    if (state.pendingLocation) {
      marker = L.marker(center).addTo(map).bindPopup('Ubicación actual').openPopup();
    }

    map.on('click', (event) => {
      const { lat, lng } = event.latlng;
      state.pendingLocation = { lat, lng, accuracy: null };
      if (marker) marker.setLatLng([lat, lng]);
      else marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup('Ubicación seleccionada').openPopup();
      if (status) {
        status.className = 'message ok';
        status.textContent = `Ubicación: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    });

    setTimeout(() => map.invalidateSize(), 100);
  } catch {
    container.innerHTML = '<div style="padding:16px;color:var(--muted);">No se pudo cargar el mapa. Usa GPS.</div>';
  }
}

function captureLocation() {
  const status = $('#locationStatus');
  if (!navigator.geolocation) {
    if (status) status.textContent = 'Tu navegador no permite GPS.';
    return;
  }
  if (status) status.textContent = 'Solicitando GPS...';
  navigator.geolocation.getCurrentPosition((position) => {
    state.pendingLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy || null
    };
    if (status) {
      status.className = 'message ok';
      status.textContent = `GPS capturado: ${state.pendingLocation.lat.toFixed(5)}, ${state.pendingLocation.lng.toFixed(5)}`;
    }
  }, (error) => {
    if (status) {
      status.className = 'message err';
      status.textContent = `No se pudo obtener GPS: ${error.message}`;
    }
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

async function handleEvidenceFiles(event) {
  const files = Array.from(event.target.files || []).slice(0, 2);
  state.pendingEvidence = [];
  const msg = $('#reportMessage');
  if (msg) { msg.className = 'message'; msg.textContent = files.length ? 'Comprimiendo fotografías...' : ''; }
  for (const file of files) {
    try { state.pendingEvidence.push(await compressImage(file)); }
    catch (error) { console.warn('No se pudo comprimir imagen', error); }
  }
  renderEvidencePreview();
  if (msg) {
    msg.className = 'message ok';
    msg.textContent = state.pendingEvidence.length ? `${state.pendingEvidence.length} fotografía(s) listas.` : '';
  }
}

function renderEvidencePreview() {
  const preview = $('#evidencePreview');
  if (!preview) return;
  if (!state.pendingEvidence.length) { preview.innerHTML = ''; return; }
  preview.innerHTML = state.pendingEvidence.map((img, index) => `
    <div class="evidence-thumb">
      <img src="${img.dataUrl}" alt="Evidencia ${index + 1}">
      <button type="button" class="evidence-remove" data-index="${index}" aria-label="Eliminar foto">✕</button>
    </div>
  `).join('');
  preview.querySelectorAll('.evidence-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pendingEvidence.splice(Number(btn.dataset.index), 1);
      renderEvidencePreview();
    });
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxWidth = 900;
        const ratio = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ nombre: file.name, tipo: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.68) });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveReport(event) {
  event.preventDefault();
  const msg = $('#reportMessage');
  if (msg) msg.textContent = 'Guardando incidencia en Firestore...';
  const category = $('#reportCategory')?.value || 'otro';
  const location = state.pendingLocation;
  try {
    await addDoc(collection(db, 'incidencias'), {
      titulo: $('#reportTitle')?.value.trim() || categoryLabel(category),
      descripcion: $('#reportDescription')?.value.trim() || '',
      categoria: categoryLabel(category),
      categoriaClave: category,
      departamento: $('#reportDepartment')?.value || '',
      zona: $('#reportZone')?.value.trim() || '',
      estado: 'pendiente',
      usuarioId: state.user.uid,
      idCiudadano: state.user.uid,
      correoUsuario: normalizeEmail(state.user.email),
      nombreUsuario: state.profile?.nombre || state.user.displayName || state.user.email,
      latitud: location?.lat ?? null,
      longitud: location?.lng ?? null,
      ubicacion: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : null,
      evidencias: state.pendingEvidence,
      evidenciaCount: state.pendingEvidence.length,
      fecha: serverTimestamp(),
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp()
    });
    if (msg) {
      msg.className = 'message ok';
      msg.textContent = 'Incidencia guardada correctamente.';
    }
    setTimeout(closeModal, 800);
  } catch (error) {
    if (msg) {
      msg.className = 'message err';
      msg.textContent = `Error: ${error.code || error.message}`;
    }
  }
}

function openReportDetail(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) return;
  const evidence = Array.isArray(report.evidencias) && report.evidencias.length
    ? `<div class="list">${report.evidencias.map((img) => `<img src="${img.dataUrl}" alt="Evidencia" style="width:100%;border-radius:16px;border:1px solid var(--line);">`).join('')}</div>`
    : '<div class="empty-state"><b>Sin fotografías adjuntas.</b></div>';
  openModal('Detalle de incidencia', `<div class="form-grid">
    <article class="panel-card"><h3>${categoryIcon(report.categoriaClave || report.categoria)} ${safeText(report.titulo || report.categoria, 'Incidencia')}</h3><p>${safeText(report.descripcion, 'Sin descripción')}</p><span class="badge ${normalizeStatus(report.estado)}">${displayStatus(report.estado)}</span><small>🏛️ ${safeText(report.departamento, 'Sin departamento')}</small><small>📍 ${safeText(report.zona || report.colonia || report.direccion, 'Sin zona')}</small></article>
    ${evidence}
    <article class="panel-card"><h3>Comentarios</h3><div id="commentsList" class="list"><div class="empty-state"><b>Cargando comentarios...</b></div></div><form id="commentForm" class="form-grid"><textarea id="commentText" placeholder="Escribe un comentario"></textarea><button class="btn-primary" type="submit">Publicar comentario</button><div id="commentMessage" class="message"></div></form></article>
  </div>`);
  listenComments(reportId);
  $('#commentForm')?.addEventListener('submit', (event) => saveComment(event, reportId));
}

function listenComments(reportId) {
  clearCommentSubscription();
  const commentsQuery = query(collection(db, 'comentarios'), where('incidenciaId', '==', reportId));
  state.commentUnsubscribe = onSnapshot(commentsQuery, (snapshot) => {
    state.comments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const target = $('#commentsList');
    if (!target) return;
    if (!state.comments.length) {
      target.innerHTML = '<div class="empty-state"><b>No hay comentarios todavía.</b></div>';
      return;
    }
    target.innerHTML = state.comments.map((comment) => `<article class="item-card"><div><b>${safeText(comment.nombreUsuario || comment.correoUsuario, 'Usuario')}</b><small>${safeText(comment.texto, '')}</small><small>${formatDate(comment.fecha)}</small></div></article>`).join('');
  }, (error) => {
    const target = $('#commentsList');
    if (target) target.innerHTML = `<div class="empty-state"><b>No se pudieron cargar comentarios.</b><small>${escapeHTML(error.code || error.message)}</small></div>`;
  });
}

async function saveComment(event, reportId) {
  event.preventDefault();
  const msg = $('#commentMessage');
  const text = $('#commentText')?.value.trim();
  if (!text) return;
  if (msg) msg.textContent = 'Guardando comentario...';
  try {
    await addDoc(collection(db, 'comentarios'), {
      incidenciaId: reportId,
      texto: text,
      usuarioId: state.user.uid,
      uid: state.user.uid,
      correoUsuario: normalizeEmail(state.user.email),
      nombreUsuario: state.profile?.nombre || state.user.displayName || state.user.email,
      fecha: serverTimestamp()
    });
    await updateDoc(doc(db, 'incidencias', reportId), { comentariosCount: state.comments.length + 1, fechaActualizacion: serverTimestamp() }).catch(() => null);
    if ($('#commentText')) $('#commentText').value = '';
    if (msg) {
      msg.className = 'message ok';
      msg.textContent = 'Comentario publicado.';
    }
  } catch (error) {
    if (msg) {
      msg.className = 'message err';
      msg.textContent = `Error: ${error.code || error.message}`;
    }
  }
}

async function changeReportStatus(reportId, status) {
  try {
    await updateDoc(doc(db, 'incidencias', reportId), { estado: status, fechaActualizacion: serverTimestamp() });
    if (isAdmin()) {
      await addDoc(collection(db, 'auditoria_admin'), { accion: 'Cambio de estado', detalle: `${reportId} → ${status}`, correo: state.user.email, fecha: serverTimestamp() }).catch(() => null);
    }
  } catch (error) {
    alert(`No se pudo cambiar el estado: ${error.code || error.message}`);
  }
}

async function assignDepartment(reportId, departamento) {
  try { await updateDoc(doc(db, 'incidencias', reportId), { departamento, fechaActualizacion: serverTimestamp() }); }
  catch (error) { alert(`No se pudo asignar departamento: ${error.code || error.message}`); }
}

function openAdminForm(adminId = null) {
  const current = adminId ? state.admins.find((item) => item.id === adminId) : {};
  openModal(adminId ? 'Editar administrador' : 'Nuevo administrador', `<form id="adminForm" class="form-grid"><label>Nombre<input id="adminName" value="${safeText(current?.nombre, '')}"></label><label>Correo<input id="adminEmail" type="email" value="${safeText(current?.correo, '')}"></label><label>Rol<select id="adminRole"><option ${current?.rol === 'Administrador básico' ? 'selected' : ''}>Administrador básico</option><option ${current?.rol === 'Superadmin' ? 'selected' : ''}>Superadmin</option></select></label><label>Estado<select id="adminStatus"><option value="activo" ${current?.estado !== 'inactivo' ? 'selected' : ''}>activo</option><option value="inactivo" ${current?.estado === 'inactivo' ? 'selected' : ''}>inactivo</option></select></label><button class="btn-primary full" type="submit">Guardar administrador</button><div id="adminFormMessage" class="message"></div></form>`);
  $('#adminForm')?.addEventListener('submit', (event) => saveAdmin(event, adminId));
}

async function saveAdmin(event, adminId) {
  event.preventDefault();
  const email = normalizeEmail($('#adminEmail')?.value);
  const id = adminId || email.replace(/[^a-z0-9]/g, '_');
  const msg = $('#adminFormMessage');
  if (msg) msg.textContent = 'Guardando administrador...';
  try {
    await setDoc(doc(db, 'administradores', id), {
      nombre: $('#adminName')?.value.trim() || email.split('@')[0],
      correo: email,
      rol: $('#adminRole')?.value || 'Administrador básico',
      estado: $('#adminStatus')?.value || 'activo',
      fechaActualizacion: serverTimestamp()
    }, { merge: true });
    await addDoc(collection(db, 'auditoria_admin'), { accion: adminId ? 'Editar administrador' : 'Crear administrador', detalle: email, correo: state.user.email, fecha: serverTimestamp() }).catch(() => null);
    if (msg) {
      msg.className = 'message ok';
      msg.textContent = 'Administrador guardado.';
    }
    setTimeout(closeModal, 700);
  } catch (error) {
    if (msg) {
      msg.className = 'message err';
      msg.textContent = `Error: ${error.code || error.message}`;
    }
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
      return [r.titulo || r.categoria || '', r.descripcion || '', categoryLabel(r.categoriaClave || r.categoria), displayStatus(r.estado), r.departamento || '', r.zona || r.colonia || '', coords[0], coords[1], formatDate(r.fecha || r.fechaCreacion)];
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

function openAbout() {
  openModal('Acerca de ConectaMartínez', `<p>ConectaMartínez permite reportar incidencias urbanas, dar seguimiento, consultar el mapa y apoyar la comunicación ciudadana.</p><p>La app usa Firebase Auth y Firestore para sincronizar datos en tiempo real.</p>`);
}

function setupEvents() {
  dom.startBtn?.addEventListener('click', () => { setAuthMode('login'); showScreen('auth'); });
  dom.aboutBtn?.addEventListener('click', openAbout);
  dom.toggleAuthBtn?.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
  dom.authForm?.addEventListener('submit', handleAuthSubmit);
  dom.logoutBtn?.addEventListener('click', async () => { await signOut(auth); });
  dom.closeModalBtn?.addEventListener('click', closeModal);
  dom.modal?.addEventListener('click', (event) => { if (event.target === dom.modal) closeModal(); });
  $$('.bottom-nav button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
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
  } catch (error) {
    console.error('No se pudo preparar perfil:', error);
    state.profile = { nombre: user.displayName || user.email?.split('@')[0], correo: user.email, rol: getRoleByEmail(user.email) };
  }

  state.role = getRoleByEmail(user.email, state.profile.rol);
  updateHeader();
  showScreen('main');
  setView('panel');
  startRealtime();
});

window.addEventListener('error', (event) => {
  console.error('Error global:', event.message, event.filename, event.lineno);
});

setupEvents();
setAuthMode('login');
console.info('Conecta Martínez limpia conectada a Firebase:', firebaseConfig.projectId);
