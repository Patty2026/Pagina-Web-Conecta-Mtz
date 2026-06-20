import firebaseConfig from './firebase-config.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const DEFAULT_CENTER = [20.0703, -97.0608];
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const CATEGORIES = [
  ['baches', 'Baches en vialidades', '🕳️'],
  ['alumbrado', 'Alumbrado público', '💡'],
  ['basura', 'Recolección de basura', '🗑️'],
  ['agua', 'Fugas de agua', '💧'],
  ['areas_verdes', 'Áreas verdes', '🌳'],
  ['seguridad', 'Seguridad / Riesgo', '⚠️'],
  ['otro', 'Otro', '📍']
];

const state = {
  user: null,
  reports: [],
  unsubscribe: null,
  map: null,
  markers: [],
  timer: null,
  triedOwnQuery: false,
  reason: ''
};

const $ = (selector) => document.querySelector(selector);
const clean = (value) => String(value ?? '').trim();
const esc = (value) => clean(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function statusKey(value) {
  const raw = clean(value || 'pendiente').toLowerCase();
  if (raw.includes('proceso')) return 'en_proceso';
  if (raw.includes('resuelto')) return 'resuelto';
  if (raw.includes('cancel')) return 'cancelado';
  return 'pendiente';
}

function categoryKey(value) {
  const raw = clean(value);
  return CATEGORIES.find(([key, label]) => key === raw || label === raw)?.[0] || 'otro';
}

function categoryLabel(value) {
  const key = categoryKey(value);
  return CATEGORIES.find(([itemKey]) => itemKey === key)?.[1] || 'Otro';
}

function categoryIcon(value) {
  const key = categoryKey(value);
  return CATEGORIES.find(([itemKey]) => itemKey === key)?.[2] || '📍';
}

function dateKey(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function coords(item) {
  const lat = Number(item.latitud ?? item.ubicacion?.lat ?? item.ubicacion?.latitude);
  const lng = Number(item.longitud ?? item.ubicacion?.lng ?? item.ubicacion?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function filters() {
  return {
    search: clean($('#filterSearch')?.value).toLowerCase(),
    estado: clean($('#filterEstado')?.value || 'todos'),
    categoria: clean($('#filterCategoria')?.value || 'todos'),
    departamento: clean($('#filterDepartamento')?.value || 'todos'),
    zona: clean($('#filterZona')?.value).toLowerCase(),
    inicio: clean($('#filterFechaInicio')?.value),
    fin: clean($('#filterFechaFin')?.value)
  };
}

function filteredReports() {
  const f = filters();
  return state.reports.filter((item) => {
    const text = [item.titulo, item.descripcion, item.categoria, item.categoriaClave, item.zona, item.colonia, item.direccion, item.departamento].join(' ').toLowerCase();
    const zone = [item.zona, item.colonia, item.direccion].join(' ').toLowerCase();
    const fecha = dateKey(item.fecha || item.fechaCreacion || item.createdAt);
    return (!f.search || text.includes(f.search))
      && (f.estado === 'todos' || statusKey(item.estado) === f.estado)
      && (f.categoria === 'todos' || categoryKey(item.categoriaClave || item.categoria) === f.categoria)
      && (f.departamento === 'todos' || clean(item.departamento) === f.departamento)
      && (!f.zona || zone.includes(f.zona))
      && (!f.inicio || fecha >= f.inicio)
      && (!f.fin || fecha <= f.fin);
  });
}

function ensureLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function showMessage(container, title, detail = '') {
  container.innerHTML = `<div class="empty-state" style="margin:16px;"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
}

function scheduleFallback(reason = '') {
  if (reason) state.reason = reason;
  clearTimeout(state.timer);
  state.timer = setTimeout(renderFallbackMap, 220);
}

async function renderFallbackMap() {
  const container = $('#interactiveMap');
  if (!container || !$('#mapView')?.classList.contains('active')) return;
  if (!window.ConectaUseFallbackMap && !window.ConectaGoogleMapsFailed) return;

  const points = filteredReports().map((item) => ({ item, coords: coords(item) })).filter((entry) => entry.coords);

  if (!points.length) {
    showMessage(container, 'No hay incidencias con GPS para mostrar.', state.reason || 'Google Maps no cargó; se usará mapa alternativo cuando existan ubicaciones.');
    return;
  }

  try {
    const L = await ensureLeaflet();
    if (state.map) {
      try { state.map.remove(); } catch (_) {}
      state.map = null;
    }

    container.innerHTML = '<div id="fallbackMapCanvas" style="width:100%;height:100%;min-height:420px;border-radius:24px;"></div>';
    const map = L.map('fallbackMapCanvas', { zoomControl: true }).setView(points[0].coords || DEFAULT_CENTER, points.length ? 14 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    points.forEach(({ item, coords: position }) => {
      const icon = L.divIcon({
        className: 'conecta-marker',
        html: `<span style="font-size:24px">${categoryIcon(item.categoriaClave || item.categoria)}</span>`,
        iconSize: [30, 30]
      });
      L.marker(position, { icon }).addTo(map).bindPopup(`<b>${esc(item.titulo || categoryLabel(item.categoriaClave || item.categoria))}</b><br>${esc(categoryLabel(item.categoriaClave || item.categoria))}<br>${esc(item.zona || item.colonia || item.direccion || 'Sin zona')}`);
    });

    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((entry) => entry.coords));
      map.fitBounds(bounds, { padding: [28, 28] });
    }

    state.map = map;
  } catch (error) {
    showMessage(container, 'No se pudo cargar el mapa alternativo.', error?.message || 'Revisa tu conexión a internet.');
  }
}

function listenReports(user, ownOnly = false) {
  if (state.unsubscribe) state.unsubscribe();
  const source = ownOnly ? query(collection(db, 'incidencias'), where('usuarioId', '==', user.uid)) : collection(db, 'incidencias');
  state.unsubscribe = onSnapshot(source, (snapshot) => {
    state.reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    scheduleFallback();
  }, () => {
    if (!ownOnly && !state.triedOwnQuery) {
      state.triedOwnQuery = true;
      listenReports(user, true);
    }
  });
}

window.addEventListener('conecta-render-fallback-map', (event) => {
  window.ConectaGoogleMapsFailed = true;
  window.ConectaUseFallbackMap = true;
  scheduleFallback(event.detail?.reason || 'Google Maps no cargó correctamente.');
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-view="map"], [data-action]')) scheduleFallback();
});
document.addEventListener('input', (event) => { if (event.target?.id?.startsWith('filter')) scheduleFallback(); });
document.addEventListener('change', (event) => { if (event.target?.id?.startsWith('filter')) scheduleFallback(); });

new MutationObserver(() => {
  const container = $('#interactiveMap');
  if (!container) return;
  const text = container.textContent || '';
  if (text.includes('Esta página no puede cargar Google Maps') || container.querySelector('.gm-err-container, .gm-err-message')) {
    window.ConectaGoogleMapsFailed = true;
    window.ConectaUseFallbackMap = true;
    scheduleFallback('Google Maps rechazó la carga. Revisa API Key, dominio permitido, API habilitada o facturación.');
  }
}).observe(document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, (user) => {
  state.user = user || null;
  state.reports = [];
  state.triedOwnQuery = false;
  if (state.unsubscribe) state.unsubscribe();
  if (!user) return;
  listenReports(user, false);
  scheduleFallback();
});
