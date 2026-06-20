import firebaseConfig from './firebase-config.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const DEFAULT_CENTER = { lat: 20.0703, lng: -97.0608 };
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
  info: null,
  timer: null,
  triedOwnQuery: false,
  googleRejected: false
};

const $ = (selector) => document.querySelector(selector);

function clean(value) { return String(value ?? '').trim(); }
function esc(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function statusKey(value) {
  const raw = clean(value || 'pendiente').toLowerCase();
  if (raw.includes('proceso')) return 'en_proceso';
  if (raw.includes('resuelto')) return 'resuelto';
  if (raw.includes('cancel')) return 'cancelado';
  return 'pendiente';
}
function statusLabel(value) {
  return { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelto: 'Resuelto', cancelado: 'Cancelado' }[statusKey(value)] || 'Pendiente';
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
function itemDateKey(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function coords(item) {
  const lat = Number(item.latitud ?? item.ubicacion?.lat ?? item.ubicacion?.latitude);
  const lng = Number(item.longitud ?? item.ubicacion?.lng ?? item.ubicacion?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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
    const date = itemDateKey(item.fecha || item.fechaCreacion || item.createdAt);
    return (!f.search || text.includes(f.search))
      && (f.estado === 'todos' || statusKey(item.estado) === f.estado)
      && (f.categoria === 'todos' || categoryKey(item.categoriaClave || item.categoria) === f.categoria)
      && (f.departamento === 'todos' || clean(item.departamento) === f.departamento)
      && (!f.zona || zone.includes(f.zona))
      && (!f.inicio || date >= f.inicio)
      && (!f.fin || date <= f.fin);
  });
}
function clearMarkers() {
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = [];
}
function message(container, title, detail = '') {
  container.innerHTML = `<div class="empty-state" style="margin:16px;"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
}
function activateFallback(reason = 'Google Maps no cargó correctamente. Se usará un mapa alternativo.') {
  state.googleRejected = true;
  window.ConectaGoogleMapsFailed = true;
  window.ConectaUseFallbackMap = true;
  window.dispatchEvent(new CustomEvent('conecta-render-fallback-map', { detail: { reason } }));
}
function isGoogleError(container) {
  const text = clean(container?.textContent || '');
  return text.includes('Esta página no puede cargar Google Maps')
    || text.includes('Google Maps correctamente')
    || Boolean(container?.querySelector('.gm-err-container, .gm-err-message'));
}
function schedule(delay = 180) {
  clearTimeout(state.timer);
  state.timer = setTimeout(renderGoogleMap, delay);
}
function renderGoogleMap() {
  const container = $('#interactiveMap');
  if (!container || !$('#mapView')?.classList.contains('active')) return;

  // Si Google rechazó la carga, usa respaldo. Si solo no hay puntos GPS, NO se desactiva Google Maps.
  if (state.googleRejected || window.ConectaGoogleMapsFailed || window.ConectaUseFallbackMap) {
    activateFallback('Google Maps no respondió correctamente. Se mostrará el mapa alternativo si hay ubicaciones GPS.');
    return;
  }

  if (!window.google?.maps) {
    message(container, 'Google Maps está cargando...', 'Si tarda, revisa la API Key, el dominio permitido, Maps JavaScript API y facturación.');
    schedule(1400);
    return;
  }

  const points = filteredReports().map((item) => ({ item, position: coords(item) })).filter((entry) => entry.position);
  container.innerHTML = '<div id="googleMapCanvas" style="width:100%;height:100%;min-height:420px;border-radius:24px;"></div>';
  const canvas = $('#googleMapCanvas');
  const center = points[0]?.position || DEFAULT_CENTER;

  try {
    state.map = new google.maps.Map(canvas, {
      center,
      zoom: points.length ? 14 : 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
    state.info = new google.maps.InfoWindow();
  } catch (error) {
    activateFallback(error?.message || 'No se pudo inicializar Google Maps.');
    return;
  }

  window.setTimeout(() => {
    if (isGoogleError(container)) activateFallback('Google Maps rechazó la carga. Revisa restricciones, API habilitada o facturación.');
  }, 1300);

  clearMarkers();
  if (!points.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.margin = '16px';
    empty.innerHTML = '<b>No hay incidencias con GPS para mostrar.</b><small>El mapa ya está activo. Crea una incidencia y presiona “Capturar ubicación GPS” para ubicarla automáticamente.</small>';
    container.appendChild(empty);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  points.forEach(({ item, position }) => {
    const title = clean(item.titulo || categoryLabel(item.categoriaClave || item.categoria) || 'Incidencia');
    const marker = new google.maps.Marker({
      map: state.map,
      position,
      title,
      label: { text: categoryIcon(item.categoriaClave || item.categoria), fontSize: '18px' }
    });
    marker.addListener('click', () => {
      state.info.setContent(`<div style="max-width:240px;color:#111827;font-family:system-ui,-apple-system,Segoe UI,sans-serif;"><strong>${esc(title)}</strong><br>${esc(statusLabel(item.estado))}<br><small>${esc(categoryLabel(item.categoriaClave || item.categoria))}</small><br><small>${esc(item.zona || item.colonia || item.direccion || 'Sin zona')}</small></div>`);
      state.info.open(state.map, marker);
    });
    state.markers.push(marker);
    bounds.extend(position);
  });
  if (points.length > 1) state.map.fitBounds(bounds, 36);
}
function listenReports(user, ownOnly = false) {
  if (state.unsubscribe) state.unsubscribe();
  const source = ownOnly ? query(collection(db, 'incidencias'), where('usuarioId', '==', user.uid)) : collection(db, 'incidencias');
  state.unsubscribe = onSnapshot(source, (snapshot) => {
    state.reports = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    schedule();
  }, (error) => {
    console.warn('Google Maps no pudo leer incidencias:', error?.code || error);
    if (!ownOnly && !state.triedOwnQuery) {
      state.triedOwnQuery = true;
      listenReports(user, true);
    }
  });
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-view="map"], [data-action]')) schedule(320);
});
document.addEventListener('input', (event) => { if (event.target?.id?.startsWith('filter')) schedule(320); });
document.addEventListener('change', (event) => { if (event.target?.id?.startsWith('filter')) schedule(320); });
new MutationObserver(() => { if ($('#interactiveMap')) schedule(240); }).observe(document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, (user) => {
  state.user = user || null;
  state.triedOwnQuery = false;
  state.reports = [];
  state.googleRejected = false;
  if (state.unsubscribe) state.unsubscribe();
  if (!user) return;
  listenReports(user, false);
  schedule(600);
});

window.ConectaGoogleMapsAdapter = { render: () => schedule(0) };
