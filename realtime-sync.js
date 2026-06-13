import { auth, db, escucharSesion } from './firebase-service.js';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let unsubscribeProfile = null;
let unsubscribeReports = null;
let activeUser = null;
let liveReports = [];

const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];

function normalize(value = '') {
  return String(value).trim().toLowerCase();
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function saveStoredProfile(data = {}) {
  const stored = getStoredProfile();
  localStorage.setItem('conectaPerfil', JSON.stringify({ ...stored, ...data }));
}

function getCurrentRole() {
  const stored = getStoredProfile();
  const email = normalize(activeUser?.email || stored.correo || stored.email);
  const role = normalize(stored.rol || '');

  if (email === 'adminp@gmail.com') return 'superadmin';
  if (email === 'adminb@gmail.com') return 'administrador';

  return role;
}

function isAdminSession() {
  const stored = getStoredProfile();
  const email = normalize(activeUser?.email || stored.correo || stored.email);
  const role = getCurrentRole();

  return ADMIN_EMAILS.includes(email)
    || role.includes('superadmin')
    || role.includes('administrador');
}

function isSupportSession() {
  return getCurrentRole().includes('apoyo');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function fechaMillis(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (valor.seconds) return valor.seconds * 1000;
  return 0;
}

function sortReports(reports) {
  return [...reports].sort((a, b) => fechaMillis(b.fechaRegistro) - fechaMillis(a.fechaRegistro));
}

function normalizeStatus(status = 'Pendiente') {
  const value = normalize(status);
  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';
  return 'Pendiente';
}

function getCategoryIcon(category = '') {
  const lower = normalize(category);
  if (lower.includes('alumbrado')) return '💡';
  if (lower.includes('bache')) return '🚧';
  if (lower.includes('agua') || lower.includes('fuga')) return '💧';
  if (lower.includes('basura')) return '🗑️';
  if (lower.includes('verde')) return '🌳';
  return '📌';
}

function buildReportCard(report) {
  const status = normalizeStatus(report.estado || 'Pendiente');
  const folio = report.folio || `#${String(report.id || 'INC').slice(0, 8)}`;
  const tipo = report.tipo || report.categoria || 'Reporte ciudadano';
  const desc = report.descripcion || 'Sin descripción';

  return `
    <div class="report-card" data-live-report-id="${report.id}">
      <span class="icon cyan">${getCategoryIcon(tipo)}</span>
      <div>
        <b>${folio} · ${tipo}</b>
        <small>${status} · ${desc}</small>
      </div>
      <span>›</span>
    </div>
  `;
}

function renderCitizenHomeReports() {
  const list = document.getElementById('reportsList');
  if (!list || isSupportSession() || isAdminSession()) return;

  if (!liveReports.length) {
    list.innerHTML = `
      <div class="report-card">
        <span class="icon green">ℹ️</span>
        <div><b>Sin reportes todavía</b><small>Crea tu primera incidencia</small></div>
        <span>›</span>
      </div>
    `;
    return;
  }

  list.innerHTML = liveReports.slice(0, 3).map(buildReportCard).join('');
}

function renderProfileReports() {
  const container = document.getElementById('profileReportsList');
  if (!container) return;

  if (!liveReports.length) {
    container.innerHTML = '<div class="empty-state"><b>No hay reportes disponibles</b><small>Cuando existan incidencias aparecerán aquí.</small></div>';
    return;
  }

  container.innerHTML = liveReports.map(report => {
    const status = normalizeStatus(report.estado || 'Pendiente');
    const folio = report.folio || `#${String(report.id || 'INC').slice(0, 8)}`;
    const tipo = report.tipo || report.categoria || 'Reporte ciudadano';
    const desc = report.descripcion || 'Sin descripción';

    return `
      <div class="profile-report-item" data-live-profile-report="${report.id}">
        <span>${getCategoryIcon(tipo)}</span>
        <div><b>${folio}</b><small>${tipo}</small><small>${desc}</small></div>
        <span class="mini-status">${status}</span>
      </div>
    `;
  }).join('');
}

function renderSupportPanel() {
  const list = document.getElementById('supportReportsList');
  if (!list || !isSupportSession()) return;

  const pending = liveReports.filter(item => normalizeStatus(item.estado) === 'Pendiente').length;
  const process = liveReports.filter(item => ['En revisión', 'En proceso'].includes(normalizeStatus(item.estado))).length;
  const resolved = liveReports.filter(item => normalizeStatus(item.estado) === 'Resuelto').length;

  setText('pendingCount', pending);
  setText('processCount', process);
  setText('resolvedCount', resolved);

  list.innerHTML = liveReports.length
    ? liveReports.slice(0, 20).map(report => {
        const status = normalizeStatus(report.estado || 'Pendiente');
        const folio = report.folio || `#${String(report.id || 'INC').slice(0, 8)}`;
        const tipo = report.tipo || report.categoria || 'Reporte ciudadano';
        const desc = report.descripcion || 'Sin descripción';

        return `
          <div class="support-report-card admin-live-item">
            <b>${folio} · ${tipo}</b>
            <small>${status} · ${desc}</small>
          </div>
        `;
      }).join('')
    : '<div class="empty-state"><b>No hay reportes disponibles</b><small>Cuando se registren incidencias aparecerán aquí.</small></div>';
}

function renderMapInfoOnly() {
  const activeMap = document.getElementById('mapScreen')?.classList.contains('active');
  const info = document.getElementById('mapInfoCard');
  if (!activeMap || !info || isAdminSession()) return;

  const withCoords = liveReports.filter(report => {
    const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
    const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }).length;

  info.innerHTML = `
    <span class="icon orange">🗺️</span>
    <div>
      <b>Mapa sincronizado</b>
      <small>${withCoords} ubicación(es) disponibles. Los datos se actualizan en tiempo real.</small>
    </div>
  `;
}

function renderLiveData() {
  renderCitizenHomeReports();
  renderProfileReports();
  renderSupportPanel();
  renderMapInfoOnly();
}

function subscribeProfile(user) {
  if (unsubscribeProfile) unsubscribeProfile();

  unsubscribeProfile = onSnapshot(doc(db, 'usuarios', user.uid), snapshot => {
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    saveStoredProfile({ ...data, uid: user.uid, correo: user.email, email: user.email });

    const name = data.nombre || user.email?.split('@')[0] || 'Usuario';
    const role = data.rol || getStoredProfile().rol || 'Usuario';

    setText('profileName', name);
    setText('profileRole', `${role} activo`);

    const avatar = document.querySelector('#profileScreen .avatar');
    if (avatar) avatar.textContent = name.slice(0, 1).toUpperCase();

    window.dispatchEvent(new CustomEvent('conecta:profile-updated', { detail: data }));
  }, error => {
    console.warn('No se pudo escuchar el perfil en tiempo real:', error);
  });
}

function subscribeReports(user) {
  if (unsubscribeReports) unsubscribeReports();

  if (isAdminSession()) return;

  const reportsQuery = isSupportSession()
    ? collection(db, 'incidencias')
    : query(collection(db, 'incidencias'), where('idCiudadano', '==', user.uid));

  unsubscribeReports = onSnapshot(reportsQuery, snapshot => {
    liveReports = sortReports(snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() })));
    window.conectaLiveReports = liveReports;
    renderLiveData();
  }, error => {
    console.warn('No se pudieron escuchar incidencias en tiempo real:', error);
  });
}

export function startRealtimeSync() {
  escucharSesion(user => {
    activeUser = user || null;
    window.conectaCurrentUser = user || null;

    if (!user) {
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeReports) unsubscribeReports();
      unsubscribeProfile = null;
      unsubscribeReports = null;
      liveReports = [];
      return;
    }

    saveStoredProfile({ uid: user.uid, correo: user.email, email: user.email });
    subscribeProfile(user);

    setTimeout(() => subscribeReports(user), 250);
  });
}

window.startRealtimeSync = startRealtimeSync;
window.addEventListener('load', () => setTimeout(startRealtimeSync, 600));
document.addEventListener('click', event => {
  if (event.target.closest('[data-go="profileScreen"], [data-go="mapScreen"], [data-go="supportScreen"], [data-go="homeScreen"], .profile-toggle')) {
    setTimeout(renderLiveData, 300);
  }
});
