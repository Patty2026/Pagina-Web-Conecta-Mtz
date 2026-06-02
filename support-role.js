import {
  obtenerTodasLasIncidencias,
  actualizarAtencionIncidencia
} from './firebase-service.js';

const allowed = new Set([
  'supportScreen',
  'mapScreen',
  'notificationsScreen',
  'profileScreen',
  'trackingScreen',
  'loginScreen'
]);

const MAX_RESOLUTION_DISTANCE_METERS = 120;

let supportReady = false;

function roleValue() {
  const loginVisible = document.getElementById('loginScreen')?.classList.contains('active');
  const selectRole = document.getElementById('roleSelect')?.value || '';
  const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');

  if (loginVisible) return selectRole || 'Ciudadano';
  return stored.rol || selectRole || 'Ciudadano';
}

function isSupport() {
  return roleValue().toLowerCase().includes('apoyo');
}

function screens() {
  return Array.from(document.querySelectorAll('.screen'));
}

function showOnly(id) {
  if (isSupport() && !allowed.has(id)) id = 'supportScreen';
  screens().forEach(screen => screen.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'supportScreen') loadSupportReports();
  if (id === 'mapScreen') setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
}

function normalizeStatus(status = 'Pendiente') {
  const value = String(status).toLowerCase();
  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';
  return 'Pendiente';
}

function categoryIcon(category = '') {
  const lower = String(category).toLowerCase();
  if (lower.includes('alumbrado')) return '💡';
  if (lower.includes('bache')) return '🚧';
  if (lower.includes('agua') || lower.includes('fuga')) return '💧';
  if (lower.includes('basura')) return '🗑️';
  if (lower.includes('verde')) return '🌳';
  return '📌';
}

function getReportCoords(report) {
  const lat = Number(report?.coordenadas?.latitud ?? report?.latitud ?? report?.lat);
  const lng = Number(report?.coordenadas?.longitud ?? report?.longitud ?? report?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function getSupportLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS no disponible en este dispositivo.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy || 0)
      }),
      error => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function applySupportMenu() {
  if (!isSupport()) return;

  document
    .querySelectorAll('[data-go="categoriesScreen"], [data-go="reportInfoScreen"], [data-go="locationScreen"], [data-go="evidenceScreen"], [data-go="confirmScreen"]')
    .forEach(element => {
      element.style.display = 'none';
    });

  document.querySelectorAll('.bottom-nav').forEach(nav => {
    nav.innerHTML = `
      <button class="active" data-go="supportScreen">Reportes</button>
      <button data-go="mapScreen">Mapa</button>
      <button data-go="notificationsScreen">Alertas</button>
      <button data-go="profileScreen">Perfil</button>
    `;
    nav.style.gridTemplateColumns = 'repeat(4,1fr)';
  });
}

function buildExternalMapLink(report) {
  const coords = getReportCoords(report);
  if (!coords) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
}

function saveSelectedReport(report) {
  window.conectaSelectedReport = report;
  localStorage.setItem('conectaSelectedReport', JSON.stringify(report));
}

function renderRoutePreview(report, supportLocation = null) {
  const coords = getReportCoords(report);
  if (!coords) {
    alert('Este reporte no tiene coordenadas registradas.');
    return;
  }

  const detail = supportLocation
    ? `Incidente: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} | Brigadista: ${supportLocation.lat.toFixed(6)}, ${supportLocation.lng.toFixed(6)} | Distancia: ${haversineMeters(supportLocation, coords)} m`
    : `Incidente: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;

  saveSelectedReport({
    ...report,
    mapaDetalle: detail,
    ubicacionApoyoActual: supportLocation
  });

  const mapUrl = buildExternalMapLink(report);
  window.open(mapUrl, '_blank', 'noopener,noreferrer');
  showOnly('mapScreen');
}

async function loadSupportReports() {
  const container = document.getElementById('supportReportsList');
  if (!container) return;

  container.innerHTML = '<div class="empty-state"><b>Cargando reportes...</b><small>Consultando reportes registrados en Firestore.</small></div>';

  try {
    const reports = await obtenerTodasLasIncidencias();
    window.conectaSupportReports = reports;

    const pending = reports.filter(r => normalizeStatus(r.estado) === 'Pendiente').length;
    const process = reports.filter(r => ['En revisión', 'En proceso'].includes(normalizeStatus(r.estado))).length;
    const resolved = reports.filter(r => normalizeStatus(r.estado) === 'Resuelto').length;

    const pendingCount = document.getElementById('pendingCount');
    const processCount = document.getElementById('processCount');
    const resolvedCount = document.getElementById('resolvedCount');

    if (pendingCount) pendingCount.textContent = pending;
    if (processCount) processCount.textContent = process;
    if (resolvedCount) resolvedCount.textContent = resolved;

    if (!reports.length) {
      container.innerHTML = '<div class="empty-state"><b>No hay reportes registrados</b><small>Cuando un ciudadano cree una incidencia aparecerá aquí.</small></div>';
      return;
    }

    container.innerHTML = reports.map((report, index) => {
      const tipo = report.tipo || 'Incidencia ciudadana';
      const estado = report.estado || 'Pendiente';
      const folio = report.folio || `#${report.id?.slice(0, 8) || 'INC'}`;
      const descripcion = report.descripcion || 'Sin descripción';
      const ubicacion = report.ubicacion || 'Sin ubicación';
      const comentario = report.ultimoComentario || '';
      const evidencia = report.evidenciaAtencionNombre || '';
      const resolvedDisabled = evidencia ? '' : 'disabled';
      const resolvedHint = evidencia ? 'Listo para cerrar' : 'Adjunta evidencia para resolver';
      const mapLink = buildExternalMapLink(report);

      return `
        <article class="support-report-card" data-support-card="${index}">
          <header>
            <div>
              <b>${categoryIcon(tipo)} ${folio}</b>
              <small>${tipo}</small>
              <small>${descripcion}</small>
              <small>${ubicacion}</small>
            </div>
            <span class="status-pill">${estado}</span>
          </header>

          <div class="support-verification">
            <a class="support-location-link" href="${mapLink}" target="_blank" rel="noopener noreferrer">📍 Abrir ubicación del incidente</a>
            <small id="supportDistance${index}">Verifica tu ubicación antes de resolver.</small>
          </div>

          <textarea class="support-comment" id="supportComment${index}" placeholder="Agregar comentario de atención...">${comentario}</textarea>

          <label class="support-evidence-label">
            📷 Evidencia de asistencia
            <input type="file" accept="image/*" capture="environment" data-support-evidence="${index}">
          </label>
          <small class="support-evidence-name" id="supportEvidenceName${index}">${evidencia || 'Sin evidencia adjunta'}</small>

          <div class="support-actions">
            <button type="button" data-support-map="${index}">Ver ubicación</button>
            <button type="button" data-support-status="${index}" data-status="En revisión">En revisión</button>
            <button type="button" data-support-status="${index}" data-status="En proceso" class="primary-action">En proceso</button>
            <button type="button" data-support-resolve="${index}" ${resolvedDisabled}>Resolver</button>
          </div>
          <small class="support-resolve-hint" id="supportResolveHint${index}">${resolvedHint}</small>
        </article>
      `;
    }).join('');

    container.querySelectorAll('[data-support-map]').forEach(button => {
      button.addEventListener('click', async () => {
        const report = window.conectaSupportReports[Number(button.dataset.supportMap)];
        saveSelectedReport(report);
        try {
          const supportLocation = await getSupportLocation();
          renderRoutePreview(report, supportLocation);
        } catch {
          renderRoutePreview(report, null);
        }
      });
    });

    container.querySelectorAll('[data-support-evidence]').forEach(input => {
      input.addEventListener('change', async event => {
        const index = Number(input.dataset.supportEvidence);
        const report = window.conectaSupportReports[index];
        const file = event.target.files?.[0];
        if (!file || !report?.id) return;

        const nameEl = document.getElementById(`supportEvidenceName${index}`);
        const hintEl = document.getElementById(`supportResolveHint${index}`);
        const resolveBtn = container.querySelector(`[data-support-resolve="${index}"]`);

        try {
          const supportLocation = await getSupportLocation();
          const incidentCoords = getReportCoords(report);
          const distance = incidentCoords ? haversineMeters(supportLocation, incidentCoords) : null;

          await actualizarAtencionIncidencia(report.id, {
            evidenciaAtencionNombre: file.name,
            evidenciaAtencionTipo: file.type,
            evidenciaAtencionTamano: file.size,
            evidenciaAtencionFecha: new Date().toISOString(),
            evidenciaAtencionValidada: true,
            ubicacionEvidencia: supportLocation,
            distanciaEvidenciaMetros: distance,
            estado: normalizeStatus(report.estado) === 'Pendiente' ? 'En proceso' : report.estado
          });

          report.evidenciaAtencionNombre = file.name;
          report.ubicacionEvidencia = supportLocation;
          report.distanciaEvidenciaMetros = distance;

          if (nameEl) nameEl.textContent = `Evidencia adjunta: ${file.name}`;
          if (hintEl) hintEl.textContent = distance === null ? 'Evidencia registrada. Verifica ubicación para resolver.' : `Evidencia registrada a ${distance} m del incidente.`;
          if (resolveBtn) resolveBtn.disabled = false;
        } catch (error) {
          console.error(error);
          alert('No se pudo registrar la evidencia. Permite la ubicación GPS e intenta nuevamente.');
        }
      });
    });

    container.querySelectorAll('[data-support-status]').forEach(button => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.supportStatus);
        const nextStatus = button.dataset.status;
        const report = window.conectaSupportReports[index];
        const comment = document.getElementById(`supportComment${index}`)?.value || '';

        if (!report?.id) {
          alert('No se encontró el ID del reporte.');
          return;
        }

        try {
          const supportLocation = await getSupportLocation().catch(() => null);
          await actualizarAtencionIncidencia(report.id, {
            estado: nextStatus,
            ultimoComentario: comment,
            ubicacionUltimaAtencion: supportLocation,
            atendidoPorRol: 'Apoyo comunitario'
          });
          alert(`Reporte actualizado a: ${nextStatus}`);
          await loadSupportReports();
        } catch (error) {
          console.error(error);
          alert('No se pudo actualizar el reporte. Revisa conexión o reglas de Firestore.');
        }
      });
    });

    container.querySelectorAll('[data-support-resolve]').forEach(button => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.supportResolve);
        const report = window.conectaSupportReports[index];
        const comment = document.getElementById(`supportComment${index}`)?.value?.trim() || '';

        if (!report?.id) {
          alert('No se encontró el ID del reporte.');
          return;
        }

        if (!report.evidenciaAtencionNombre) {
          alert('Para resolver debes adjuntar evidencia fotográfica de la asistencia.');
          return;
        }

        if (!comment) {
          alert('Agrega un comentario de cierre antes de resolver.');
          return;
        }

        const incidentCoords = getReportCoords(report);
        if (!incidentCoords) {
          alert('Este reporte no tiene coordenadas. No se puede validar la asistencia.');
          return;
        }

        try {
          const supportLocation = await getSupportLocation();
          const distance = haversineMeters(supportLocation, incidentCoords);
          const distanceEl = document.getElementById(`supportDistance${index}`);
          if (distanceEl) distanceEl.textContent = `Distancia actual al incidente: ${distance} m`;

          if (distance > MAX_RESOLUTION_DISTANCE_METERS) {
            alert(`Para resolver debes estar a menos de ${MAX_RESOLUTION_DISTANCE_METERS} metros del incidente. Distancia actual: ${distance} m.`);
            return;
          }

          await actualizarAtencionIncidencia(report.id, {
            estado: 'Resuelto',
            ultimoComentario: comment,
            comentarioCierre: comment,
            fechaResolucion: new Date().toISOString(),
            evidenciaAtencionValidada: true,
            ubicacionResolucion: supportLocation,
            distanciaResolucionMetros: distance,
            atendidoPorRol: 'Apoyo comunitario'
          });

          alert('Reporte resuelto con evidencia y ubicación verificadas.');
          await loadSupportReports();
        } catch (error) {
          console.error(error);
          alert('No se pudo validar tu ubicación. Permite el GPS para resolver el reporte.');
        }
      });
    });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<div class="empty-state"><b>No se pudieron cargar los reportes</b><small>Revisa la conexión o las reglas de Firestore.</small></div>';
  }
}

function protectSupportActions() {
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-go]');
    if (!target || !isSupport()) return;

    const requested = target.dataset.go;
    if (!allowed.has(requested)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showOnly('supportScreen');
    }
  }, true);
}

function activateSupportModeAfterAuth() {
  setTimeout(() => {
    if (!isSupport()) return;
    applySupportMenu();
    showOnly('supportScreen');
  }, 900);
}

function initSupportRole() {
  if (supportReady) return;
  supportReady = true;

  protectSupportActions();

  const loginForm = document.getElementById('loginForm');
  loginForm?.addEventListener('submit', activateSupportModeAfterAuth);

  const registerBtn = document.getElementById('registerBtn');
  registerBtn?.addEventListener('click', activateSupportModeAfterAuth);
}

document.addEventListener('DOMContentLoaded', () => {
  initSupportRole();
  if (isSupport() && document.getElementById('supportScreen')?.classList.contains('active')) {
    applySupportMenu();
    loadSupportReports();
  }
});

window.loadSupportReports = loadSupportReports;
window.applySupportMenu = applySupportMenu;
window.activateSupportModeAfterAuth = activateSupportModeAfterAuth;
