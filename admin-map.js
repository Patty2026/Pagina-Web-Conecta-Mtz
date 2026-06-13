import { db } from './firebase-service.js';
import {
  collection,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let adminMap = null;
let adminMarkersLayer = null;
let unsubscribeAdminMapReports = null;
let latestReports = [];
let selectedStatus = 'Todos';

const DEFAULT_CENTER = [20.0700, -97.0600];
const DEFAULT_ZOOM = 13;

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

function getStatusIcon(status) {
  const normalized = normalizeStatus(status);

  if (normalized === 'Resuelto') return '✅';
  if (normalized === 'En proceso') return '🟣';
  if (normalized === 'En revisión') return '🔵';

  return '🟡';
}

function ensureAdminMapPanel() {
  const mapScreen = document.getElementById('mapScreen');
  if (!mapScreen) return null;

  let panel = document.getElementById('adminMapPanel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'adminMapPanel';
  panel.className = 'admin-map-panel';
  panel.innerHTML = `
    <div class="section-title">
      <h3>Mapa administrativo</h3>
      <small id="adminMapSummary">Cargando incidentes...</small>
    </div>

    <div class="tabs admin-map-filters" id="adminMapFilters">
      <button class="active" data-status="Todos">Todos</button>
      <button data-status="Pendiente">Pendientes</button>
      <button data-status="En revisión">En revisión</button>
      <button data-status="En proceso">En proceso</button>
      <button data-status="Resuelto">Resueltos</button>
    </div>
  `;

  const mapElement = document.getElementById('reportsMap');
  mapScreen.insertBefore(panel, mapElement || null);

  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;

    selectedStatus = button.dataset.status;

    panel.querySelectorAll('[data-status]').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    renderAdminMapMarkers(latestReports);
  });

  return panel;
}

function initAdminLeafletMap() {
  const mapElement = document.getElementById('reportsMap');

  if (!mapElement || typeof L === 'undefined') return null;

  if (adminMap) {
    setTimeout(() => adminMap.invalidateSize(), 250);
    return adminMap;
  }

  adminMap = L.map(mapElement, {
    zoomControl: true,
    attributionControl: false
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(adminMap);

  adminMarkersLayer = L.layerGroup().addTo(adminMap);

  setTimeout(() => adminMap.invalidateSize(), 300);

  return adminMap;
}

function buildPopup(report, coords) {
  const status = normalizeStatus(report.estado);
  const folio = report.folio || 'INC-SIN-ID';
  const type = report.tipo || report.categoria || 'Incidente';
  const description = report.descripcion || report.detalle || 'Sin descripción';

  return `
    <div style="min-width:220px">
      <b>${getStatusIcon(status)} ${folio}</b><br>
      <strong>${type}</strong><br>
      <small>Estado: ${status}</small><br>
      <small>Lat: ${coords.lat.toFixed(6)}</small><br>
      <small>Lng: ${coords.lng.toFixed(6)}</small><br>
      <p style="margin:8px 0 0">${description}</p>
      <a href="https://www.google.com/maps?q=${coords.lat},${coords.lng}" target="_blank" rel="noopener">
        Abrir ubicación
      </a>
    </div>
  `;
}

function renderAdminMapMarkers(reports) {
  const map = initAdminLeafletMap();
  if (!map || !adminMarkersLayer) return;

  adminMarkersLayer.clearLayers();

  const filtered = reports.filter(report => {
    if (selectedStatus === 'Todos') return true;
    return normalizeStatus(report.estado) === selectedStatus;
  });

  const reportsWithCoords = filtered
    .map(report => ({ report, coords: getCoords(report) }))
    .filter(item => item.coords);

  reportsWithCoords.forEach(({ report, coords }) => {
    L.marker([coords.lat, coords.lng])
      .bindPopup(buildPopup(report, coords))
      .addTo(adminMarkersLayer);
  });

  const summary = document.getElementById('adminMapSummary');
  if (summary) {
    summary.textContent = `${reportsWithCoords.length} ubicaciones visibles de ${reports.length} incidentes registrados`;
  }

  const infoCard = document.getElementById('mapInfoCard');
  if (infoCard) {
    const total = reportsWithCoords.length;
    infoCard.innerHTML = `
      <span class="icon orange">🗺️</span>
      <div>
        <b>Mapa administrativo en tiempo real</b>
        <small>${total} incidente(s) con ubicación. Toca un marcador para ver detalles.</small>
      </div>
    `;
  }

  if (reportsWithCoords.length) {
    const bounds = L.latLngBounds(reportsWithCoords.map(item => [item.coords.lat, item.coords.lng]));
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  setTimeout(() => map.invalidateSize(), 150);
}

function subscribeAdminMapReports() {
  if (unsubscribeAdminMapReports) return;

  unsubscribeAdminMapReports = onSnapshot(collection(db, 'incidencias'), snapshot => {
    latestReports = snapshot.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    renderAdminMapMarkers(latestReports);
  }, error => {
    console.error('No se pudo cargar el mapa administrativo:', error);

    const summary = document.getElementById('adminMapSummary');
    if (summary) summary.textContent = 'No se pudieron cargar ubicaciones. Revisa las reglas de Firestore.';
  });
}

export function startAdminMap() {
  if (!window.isAdminUser?.()) return;

  ensureAdminMapPanel();
  initAdminLeafletMap();
  subscribeAdminMapReports();
  renderAdminMapMarkers(latestReports);
}

export function stopAdminMap() {
  if (unsubscribeAdminMapReports) unsubscribeAdminMapReports();
  unsubscribeAdminMapReports = null;

  if (adminMarkersLayer) adminMarkersLayer.clearLayers();
}

function watchMapScreen() {
  document.addEventListener('click', event => {
    const goMap = event.target.closest('[data-go="mapScreen"]');
    if (!goMap) return;

    setTimeout(startAdminMap, 400);
  });

  setInterval(() => {
    if (!window.isAdminUser?.()) return;

    const mapScreen = document.getElementById('mapScreen');
    if (mapScreen?.classList.contains('active')) {
      startAdminMap();
    }
  }, 1200);
}

window.startAdminMap = startAdminMap;
window.stopAdminMap = stopAdminMap;

window.addEventListener('load', () => {
  watchMapScreen();

  setTimeout(() => {
    const mapScreen = document.getElementById('mapScreen');
    if (mapScreen?.classList.contains('active')) {
      startAdminMap();
    }
  }, 1000);
});
