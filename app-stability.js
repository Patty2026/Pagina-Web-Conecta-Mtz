/* =========================================================
   ConectaMartínez - Núcleo ligero de estabilidad
   ---------------------------------------------------------
   Carga únicamente los módulos consolidados para mantener la
   app fluida, ordenada y sin duplicar paneles administrativos.
   ========================================================= */

(function () {
  const CLEAN_MODULES = [
    './navigation-history.js',
    './admin-clean.js',
    './profile-clean.js'
  ];

  function hasScript(src) {
    return Array.from(document.scripts).some(script => script.src.includes(src.replace('./', '')));
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return;

    const script = document.createElement('script');
    script.src = `${src}?v=202606-clean-core`;
    script.type = type;
    script.defer = true;
    document.body.appendChild(script);
  }

  function loadCleanModules() {
    CLEAN_MODULES.forEach(src => {
      const isModule = src.includes('admin-clean') || src.includes('profile-clean');
      loadScript(src, isModule ? 'module' : 'text/javascript');
    });
  }

  function isAdminSession() {
    return Boolean(window.isAdminUser?.());
  }

  function runCleanModules() {
    window.startProfileClean?.();

    if (isAdminSession()) {
      window.startAdminClean?.();
    }
  }

  function disableUnimplementedSocialButtons() {
    document.querySelectorAll('.social-row button').forEach(button => {
      button.disabled = true;
      button.title = 'Disponible próximamente';
      button.style.opacity = '0.55';
    });
  }

  function preventAdminDuplicates() {
    if (!isAdminSession()) return;

    const adminScreen = document.getElementById('adminScreen');
    if (!adminScreen) return;

    adminScreen.querySelectorAll('#adminRealtimePanel, #adminWindowsRoot').forEach(element => {
      element.remove();
    });

    const cleanRoot = document.getElementById('adminCleanRoot');
    if (cleanRoot) cleanRoot.style.display = '';
  }

  function afterNavigation() {
    setTimeout(() => {
      preventAdminDuplicates();
      runCleanModules();
    }, 350);
  }

  function watchNavigation() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-go], .profile-toggle')) {
        afterNavigation();
      }
    });
  }

  function keepAlive() {
    setInterval(() => {
      preventAdminDuplicates();
      runCleanModules();
    }, 2500);
  }

  window.addEventListener('load', () => {
    loadCleanModules();
    disableUnimplementedSocialButtons();
    watchNavigation();
    keepAlive();

    setTimeout(() => {
      preventAdminDuplicates();
      runCleanModules();
    }, 1200);
  });
})();
