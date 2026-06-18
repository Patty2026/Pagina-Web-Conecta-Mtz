/* Conecta Martínez - app limpia y estable 2026 */

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
  deleteDoc,
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
  filters: {
    search: '',
    estado: 'todos',
    zona: '',
    fecha: ''
  },
  unsubscribes: []
};

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

function safeText(value, fallback = 'Sin dato') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function todayKey(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
  return date.toISOString().slice(0, 10);
}

function clearSubscriptions() {
  state.unsubscribes.forEach((unsubscribe) => {
    try { unsubscribe(); } catch (error) { console.warn('No se pudo cerrar listener', error); }
  });
  state.unsubscribes = [];
}

function showScreen(screenName) {
  [dom.welcomeScreen, dom.authScreen, dom.mainScreen].forEach((screen) => screen?.classList.remove('active'));
  const target = {
    welcome: dom.welcomeScreen,
    auth: dom.authScreen,
    main: dom.mainScreen
  }[screenName];
  target?.classList.add('active');
  if (screenName === 'main') dom.bottomNav?.classList.remove('hidden');
  else dom.bottomNav?.classList.add('hidden');
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
  const nombre = safeText(extra.nombre || existing.nombre || user.displayName || email.split('@')[0], email.split('@')[0]);

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

  let reportsQuery;
  if (isAdmin() || isSupport()) {
    reportsQuery = collection(db, 'incidencias');
  } else {
    reportsQuery = query(collection(db, 'incidencias'), where('usuarioId', '==', state.user.uid));
  }

  state.unsubscribes.push(onSnapshot(reportsQuery, (snapshot) => {
    state.reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  }, (error) => {
    console.error('Error incidencias:', error);
    state.reports = [];
    renderAll();
  }));

  if (isAdmin() || isSuperadmin()) {
    state.unsubscribes.push(onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }, (error) => console.error('Error usuarios:', error)));
  }

  if (isAdmin()) {
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
  const name = safeText(state.profile?.nombre || state.user?.displayName || state.user?.email?.split('@')[0], 'Usuario');
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
  return `<article class="metric"><span>${icon}</span><b>${value}</b><small>${label}</small></article>`;
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

  if (isAdmin()) {
    view.innerHTML = renderAdminPanel();
  } else if (isSupport()) {
    view.innerHTML = renderSupportPanel();
  } else {
    view.innerHTML = renderCitizenPanel();
  }
  bindDynamicActions();
}

function renderCitizenPanel() {
  return `<article class="panel-card"><h2>Panel ciudadano</h2><p>Reporta incidencias y consulta el avance de tus solicitudes.</p><button class="btn-primary full" data-action="open-report-form">+ Nueva incidencia</button></article>${renderMetrics()}${renderReportList(state.reports.slice(0, 5), 'No hay incidencias registradas todavía.')}`;
}

function renderSupportPanel() {
  return `<article class="panel-card"><h2>Panel de Apoyo Comunitario</h2><p>Atiende incidencias registradas por la ciudadanía.</p></article>${renderMetrics()}${renderReportList(state.reports, 'No hay incidencias registradas todavía.', true)}`;
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
  return `${renderMetrics()}<article class="panel-card"><h3>Actividad reciente</h3>${renderReportList(state.reports.slice(0, 6), 'No hay actividad reciente.')}</article>`;
}

function renderIncidentsTools() {
  const filtered = getFilteredReports();
  return `<article class="panel-card"><h3>Buscar y filtrar incidencias</h3>${renderFilters()}<div class="actions-row"><button class="btn-secondary" data-action="export-csv">Exportar CSV</button><button class="btn-primary" data-action="open-report-form">Nueva incidencia</button></div></article>${renderReportList(filtered, 'No hay incidencias con esos filtros.', true)}`;
}

function renderFilters() {
  return `<div class="filter-grid">
    <input id="filterSearch" placeholder="Buscar incidencia" value="${state.filters.search}">
    <select id="filterEstado"><option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="en_proceso">En proceso</option><option value="resuelto">Resueltos</option><option value="cancelado">Cancelados</option></select>
    <input id="filterZona" placeholder="Colonia o zona" value="${state.filters.zona}">
    <input id="filterFecha" type="date" value="${state.filters.fecha}">
  </div>`;
}

function getFilteredReports() {
  return state.reports.filter((item) => {
    const searchText = `${item.titulo || ''} ${item.descripcion || ''} ${item.categoria || ''} ${item.zona || ''} ${item.colonia || ''}`.toLowerCase();
    const matchesSearch = !state.filters.search || searchText.includes(state.filters.search.toLowerCase());
    const matchesStatus = state.filters.estado === 'todos' || normalizeStatus(item.estado) === state.filters.estado;
    const zone = `${item.zona || ''} ${item.colonia || ''}`.toLowerCase();
    const matchesZone = !state.filters.zona || zone.includes(state.filters.zona.toLowerCase());
    const matchesDate = !state.filters.fecha || todayKey(item.fecha || item.fechaCreacion || item.createdAt) === state.filters.fecha;
    return matchesSearch && matchesStatus && matchesZone && matchesDate;
  });
}

function renderReportList(items, emptyText, allowActions = false) {
  if (!items.length) return `<div class="empty-state"><b>${emptyText}</b><small>Última actualización: ahora</small></div>`;
  return `<div class="list">${items.map((item) => renderReportCard(item, allowActions)).join('')}</div>`;
}

function renderReportCard(item, allowActions = false) {
  const estado = normalizeStatus(item.estado);
  const title = safeText(item.titulo || item.categoria, 'Incidencia ciudadana');
  const desc = safeText(item.descripcion, 'Sin descripción');
  const zone = safeText(item.zona || item.colonia || item.direccion, 'Zona no especificada');
  const actions = allowActions ? `<div class="item-actions"><button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="en_proceso">En proceso</button><button class="btn-secondary" data-action="change-status" data-id="${item.id}" data-status="resuelto">Resolver</button><button class="btn-danger" data-action="change-status" data-id="${item.id}" data-status="cancelado">Cancelar</button></div>` : '';
  return `<article class="item-card"><div><b>${title}</b><span class="badge ${estado}">${displayStatus(estado)}</span><small>${desc}</small><small>📍 ${zone}</small><small>🕒 ${formatDate(item.fecha || item.fechaCreacion || item.createdAt)}</small></div>${actions}</article>`;
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
  dom.reportsView.innerHTML = `<article class="panel-card"><h2>Reportes</h2><p>Consulta incidencias sincronizadas con Firestore.</p>${isAdmin() ? renderFilters() : ''}</article>${renderReportList(isAdmin() ? getFilteredReports() : state.reports, 'No hay incidencias registradas todavía.', isAdmin() || isSupport())}`;
  bindDynamicActions();
}

function renderMapView() {
  const items = isAdmin() || isSupport() ? state.reports : state.reports;
  dom.mapView.innerHTML = `<article class="panel-card"><h2>Mapa de incidencias</h2><p>Vista ligera para evitar bloqueos. Las ubicaciones se muestran como puntos de referencia.</p></article><div class="map-box">${items.length ? items.map((item) => `<div class="map-pin">📍 ${safeText(item.zona || item.colonia || item.direccion, 'Ubicación registrada')} · ${safeText(item.categoria || item.titulo, 'Incidencia')}</div>`).join('') : '<div class="empty-state"><b>No hay ubicaciones registradas.</b></div>'}</div>`;
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
  $$('[data-action="open-admin-form"]').forEach((button) => button.onclick = () => openAdminForm());
  $$('[data-action="edit-admin"]').forEach((button) => button.onclick = () => openAdminForm(button.dataset.id));
  $$('[data-action="toggle-admin"]').forEach((button) => button.onclick = () => toggleAdmin(button.dataset.id));
  $$('[data-action="change-status"]').forEach((button) => button.onclick = () => changeReportStatus(button.dataset.id, button.dataset.status));
  $$('[data-action="export-csv"]').forEach((button) => button.onclick = exportReportsCsv);
  ['filterSearch', 'filterEstado', 'filterZona', 'filterFecha'].forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;
    if (id === 'filterEstado') input.value = state.filters.estado;
    input.oninput = () => {
      state.filters.search = $('#filterSearch')?.value || '';
      state.filters.estado = $('#filterEstado')?.value || 'todos';
      state.filters.zona = $('#filterZona')?.value || '';
      state.filters.fecha = $('#filterFecha')?.value || '';
      renderAll();
    };
  });
}

function openModal(title, body) {
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = body;
  dom.modal.classList.add('active');
}

function closeModal() {
  dom.modal.classList.remove('active');
  dom.modalBody.innerHTML = '';
}

function openReportForm() {
  openModal('Nueva incidencia', `<form id="newReportForm" class="form-grid"><label>Título<input id="newReportTitle" placeholder="Ej. Fuga de agua"></label><label>Descripción<textarea id="newReportDesc" required></textarea></label><label>Categoría<select id="newReportCategory"><option>Alumbrado público</option><option>Baches en vialidades</option><option>Fugas de agua</option><option>Recolección de basura</option><option>Áreas verdes</option><option>Otro</option></select></label><label>Colonia o zona<input id="newReportZone" placeholder="Colonia, calle o referencia"></label><button class="btn-primary full" type="submit">Guardar incidencia</button><div id="newReportMessage" class="message"></div></form>`);
  $('#newReportForm').onsubmit = createReport;
}

async function createReport(event) {
  event.preventDefault();
  const msg = $('#newReportMessage');
  msg.textContent = 'Guardando incidencia...';
  try {
    await addDoc(collection(db, 'incidencias'), {
      titulo: $('#newReportTitle').value.trim() || $('#newReportCategory').value,
      descripcion: $('#newReportDesc').value.trim(),
      categoria: $('#newReportCategory').value,
      zona: $('#newReportZone').value.trim(),
      estado: 'pendiente',
      usuarioId: state.user.uid,
      idCiudadano: state.user.uid,
      correoUsuario: normalizeEmail(state.user.email),
      fecha: serverTimestamp(),
      fechaCreacion: serverTimestamp()
    });
    msg.className = 'message ok';
    msg.textContent = 'Incidencia registrada correctamente.';
    setTimeout(closeModal, 800);
  } catch (error) {
    msg.className = 'message err';
    msg.textContent = `Error: ${error.code || error.message}`;
  }
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
  const rows = [['Titulo', 'Descripcion', 'Estado', 'Zona', 'Fecha'], ...getFilteredReports().map((r) => [r.titulo || r.categoria || '', r.descripcion || '', displayStatus(r.estado), r.zona || r.colonia || '', formatDate(r.fecha || r.fechaCreacion)])];
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
