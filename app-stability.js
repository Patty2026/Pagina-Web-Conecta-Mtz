/* =========================================================
   ConectaMartínez - Estabilidad general de la app
   ---------------------------------------------------------
   Corrige carga de módulos, navegación móvil, mapas y
   conexión administrativa en tiempo real sin tocar el HTML
   minificado principal.
   ========================================================= */

(function () {
  const MODULE_SCRIPTS = [
    './navigation-history.js',
    './admin-dashboard.js',
    './admin-map.js',
    './superadmin-module.js',
    './admin-panel-summary-clean.js',
    './admin-basic-restrictions.js',
    './admin-map-single-window.js'
  ];

  function hasScript(src) {
    return Array.from(document.scripts).some(script => script.src.includes(src.replace('./', '')));
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return;

    const script = document.createElement('script');
    script.src = src;
    script.type = type;
    script.defer = true;
    document.body.appendChild(script);
  }

  function loadMissingModules() {
    MODULE_SCRIPTS.forEach(src => {
      const isModule = src.includes('admin-dashboard') || src.includes('admin-map') || src.includes('superadmin-module');
      loadScript(src, isModule ? 'module' : 'text/javascript');
    });
  }

  function fixExternalButtons() {
    document.querySelectorAll('.social-row button').forEach(button => {
      button.disabled = true;
      button.title = 'Disponible próximamente';
      button.style.opacity = '0.55';
    });
  }

  function refreshMapsAfterNavigation() {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-go]');
      if (!target) return;

      setTimeout(() => {
        window.startAdminMap?.();
        window.startSuperadminModule?.();
        window.cleanAdminPanelSummary?.();
        window.applyAdminBasicRestrictions?.();
        window.enforceSingleMapWindow?.();
      }, 450);
    });
  }

  function syncAdminModules() {
    setInterval(() => {
      if (!window.isAdminUser?.()) return;

      const adminScreen = document.getElementById('adminScreen');
      const mapScreen = document.getElementById('mapScreen');

      if (adminScreen?.classList.contains('active')) {
        window.startAdminRealtimePanel?.();
        window.startSuperadminModule?.();
        window.cleanAdminPanelSummary?.();
        window.applyAdminBasicRestrictions?.();
        window.enforceSingleMapWindow?.();
      }

      if (mapScreen?.classList.contains('active')) {
        window.startAdminMap?.();
        window.applyAdminBasicRestrictions?.();
        window.enforceSingleMapWindow?.();
      }
    }, 1800);
  }

  window.addEventListener('load', () => {
    loadMissingModules();
    fixExternalButtons();
    refreshMapsAfterNavigation();
    syncAdminModules();
  });
})();
