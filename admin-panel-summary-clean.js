/* =========================================================
   Limpieza del Panel Administrativo
   ---------------------------------------------------------
   Quita el mapa de la primera ventana del panel Admin.
   El mapa completo queda únicamente en la pestaña Mapa.
   ========================================================= */

function removeAdminHomeMap() {
  const root = document.getElementById('adminWindowsRoot');
  if (!root) return;

  const tab = root.querySelector('[data-admin-window="adminIncidentsWindow"]');
  if (tab) tab.textContent = 'Resumen';

  const title = root.querySelector('#adminIncidentsWindow .section-title h3');
  if (title) title.textContent = 'Resumen administrativo';

  const summary = document.getElementById('adminHomeMapSummary');
  if (summary) summary.textContent = 'Consulta general de incidentes. El mapa completo está en la pestaña Mapa.';

  const filters = document.getElementById('adminHomeMapFilters');
  if (filters) filters.remove();

  const map = document.getElementById('adminHomeMap');
  if (map) map.remove();

  const locationCard = document.getElementById('adminAllLocationsList')?.closest('.admin-data-card');
  if (locationCard) locationCard.remove();

  const incidentsTitle = document.querySelector('#adminAllIncidentsList')?.closest('.admin-data-card')?.querySelector('h3');
  if (incidentsTitle) incidentsTitle.textContent = 'Últimos incidentes registrados';
}

function keepPanelClean() {
  removeAdminHomeMap();

  const observer = new MutationObserver(() => {
    removeAdminHomeMap();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

window.addEventListener('load', () => {
  setTimeout(keepPanelClean, 1000);
  setTimeout(removeAdminHomeMap, 1800);
  setTimeout(removeAdminHomeMap, 3000);
});
