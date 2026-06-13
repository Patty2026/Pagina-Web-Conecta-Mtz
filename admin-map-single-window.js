/* =========================================================
   ConectaMartínez - Mapa solo en ventana Mapa
   ---------------------------------------------------------
   Evita que el mapa se repita dentro del Panel/Admin.
   El mapa administrativo, marcadores, filtros e información
   de incidencias solo se muestran en mapScreen.
   Aplica para Superadmin y Administrador básico.
   ========================================================= */

(function () {
  function isAdmin() {
    return Boolean(window.isAdminUser?.());
  }

  function removeDuplicatedPanelMaps() {
    const adminScreen = document.getElementById('adminScreen');
    if (!adminScreen || !isAdmin()) return;

    const adminHomeMap = document.getElementById('adminHomeMap');
    const adminMapPanel = document.getElementById('adminMapPanel');
    const adminIncidentsWindow = document.getElementById('adminIncidentsWindow');

    if (adminHomeMap) {
      adminHomeMap.remove();
    }

    if (adminMapPanel && adminMapPanel.closest('#adminScreen')) {
      adminMapPanel.remove();
    }

    if (adminIncidentsWindow) {
      const title = adminIncidentsWindow.querySelector('.section-title h3');
      const subtitle = adminIncidentsWindow.querySelector('.section-title small');
      const filters = adminIncidentsWindow.querySelector('.admin-map-filters');

      if (title) title.textContent = 'Panel operativo';
      if (subtitle) subtitle.textContent = 'Resumen de incidentes. El mapa completo está en la pestaña Mapa.';
      if (filters) filters.remove();

      adminIncidentsWindow.querySelectorAll('.reports-map, .admin-home-map').forEach(map => map.remove());
    }
  }

  function ensureMapTabText() {
    const mapScreen = document.getElementById('mapScreen');
    if (!mapScreen || !isAdmin()) return;

    const title = mapScreen.querySelector('h2');
    if (title) title.textContent = 'Mapa de incidencias';

    const infoCard = document.getElementById('mapInfoCard');
    if (infoCard) {
      infoCard.innerHTML = `
        <span class="icon orange">🗺️</span>
        <div>
          <b>Mapa administrativo en tiempo real</b>
          <small>Ubicaciones, estados y detalles de incidencias para Superadmin y Administrador básico.</small>
        </div>
      `;
    }
  }

  function enforceSingleMapWindow() {
    if (!isAdmin()) return;

    removeDuplicatedPanelMaps();
    ensureMapTabText();
  }

  window.enforceSingleMapWindow = enforceSingleMapWindow;

  window.addEventListener('load', () => {
    setTimeout(enforceSingleMapWindow, 800);
    setInterval(enforceSingleMapWindow, 1500);

    document.addEventListener('click', () => {
      setTimeout(enforceSingleMapWindow, 350);
    });
  });
})();
