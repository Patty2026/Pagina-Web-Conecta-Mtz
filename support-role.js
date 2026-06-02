import {
  obtenerTodasLasIncidencias,
  actualizarEstadoIncidencia
} from './firebase-service.js';

const allowed = new Set([
  'supportScreen',
  'mapScreen',
  'notificationsScreen',
  'profileScreen',
  'trackingScreen',
  'loginScreen'
]);

function roleValue() {
  const selectRole = document.getElementById('roleSelect')?.value || '';
  const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
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

      return `
        <article class="support-report-card">
          <header>
            <div>
              <b>${categoryIcon(tipo)} ${folio}</b>
              <small>${tipo}</small>
              <small>${descripcion}</small>
              <small>${ubicacion}</small>
            </div>
            <span class="status-pill">${estado}</span>
          </header>
          <textarea class="support-comment" id="supportComment${index}" placeholder="Agregar comentario de atención...">${comentario}</textarea>
          <div class="support-actions">
            <button type="button" data-support-map="${index}">Ver ubicación</button>
            <button type="button" data-support-status="${index}" data-status="En revisión">En revisión</button>
            <button type="button" data-support-status="${index}" data-status="En proceso" class="primary-action">En proceso</button>
            <button type="button" data-support-status="${index}" data-status="Resuelto">Resolver</button>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('[data-support-map]').forEach(button => {
      button.addEventListener('click', () => {
        const report = window.conectaSupportReports[Number(button.dataset.supportMap)];
        window.conectaSelectedReport = report;
        localStorage.setItem('conectaSelectedReport', JSON.stringify(report));
        showOnly('mapScreen');
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
          await actualizarEstadoIncidencia(report.id, nextStatus, comment);
          alert(`Reporte actualizado a: ${nextStatus}`);
          await loadSupportReports();
        } catch (error) {
          console.error(error);
          alert('No se pudo actualizar el reporte. Revisa conexión o reglas de Firestore.');
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

  const loginForm = document.getElementById('loginForm');
  loginForm?.addEventListener('submit', () => {
    setTimeout(() => {
      const selectedRole = document.getElementById('roleSelect')?.value || 'Ciudadano';
      if (selectedRole.toLowerCase().includes('apoyo')) {
        const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
        localStorage.setItem('conectaPerfil', JSON.stringify({ ...stored, rol: selectedRole }));
        applySupportMenu();
        showOnly('supportScreen');
      }
    }, 900);
  });

  const registerBtn = document.getElementById('registerBtn');
  registerBtn?.addEventListener('click', () => {
    setTimeout(() => {
      const selectedRole = document.getElementById('roleSelect')?.value || 'Ciudadano';
      if (selectedRole.toLowerCase().includes('apoyo')) {
        const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
        localStorage.setItem('conectaPerfil', JSON.stringify({ ...stored, rol: selectedRole }));
        applySupportMenu();
        showOnly('supportScreen');
      }
    }, 900);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applySupportMenu();
  protectSupportActions();
  if (isSupport()) loadSupportReports();
});

window.loadSupportReports = loadSupportReports;
window.applySupportMenu = applySupportMenu;
