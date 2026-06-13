/* =========================================================
   ConectaMartínez - Aislamiento de roles
   ---------------------------------------------------------
   Evita que Apoyo comunitario o Ciudadano vean ventanas,
   menús o módulos de administrador al entrar al mapa.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];

  function normalizeEmail(email = '') {
    return String(email).trim().toLowerCase();
  }

  function getStoredProfile() {
    try {
      return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
    } catch {
      return {};
    }
  }

  function getCurrentEmail() {
    const profile = getStoredProfile();
    return normalizeEmail(profile.correo || profile.email || document.getElementById('loginEmail')?.value || '');
  }

  function getCurrentRole() {
    const profile = getStoredProfile();
    return String(profile.rol || profile.role || '').toLowerCase();
  }

  function isRealAdmin() {
    const email = getCurrentEmail();
    const role = getCurrentRole();

    return ADMIN_EMAILS.includes(email)
      || role.includes('superadmin')
      || role.includes('administrador');
  }

  function isSupportOrCitizen() {
    return !isRealAdmin();
  }

  function removeAdminElementsForNonAdmin() {
    if (!isSupportOrCitizen()) return;

    const selectors = [
      '#adminWindowsRoot',
      '#adminRealtimePanel',
      '#adminMapPanel',
      '#adminHomeMap',
      '#adminManagersWindow',
      '#adminIncidentsWindow',
      '.admin-windows-root',
      '.admin-realtime-panel',
      '.admin-map-panel',
      '.admin-home-map',
      '[data-admin-window]',
      '[data-superadmin-only]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        element.remove();
      });
    });

    document.querySelectorAll('.bottom-nav button').forEach(button => {
      const target = button.dataset.go;
      const text = button.textContent.trim().toLowerCase();

      if (target === 'adminScreen' || text === 'panel' || text === 'admin') {
        button.remove();
      }
    });
  }

  function preventAdminScreenAccess() {
    document.addEventListener('click', event => {
      const adminButton = event.target.closest('[data-go="adminScreen"], [data-admin-window], [data-superadmin-only]');

      if (!adminButton || isRealAdmin()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      removeAdminElementsForNonAdmin();

      const supportScreen = document.getElementById('supportScreen');
      const homeScreen = document.getElementById('homeScreen');

      document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));

      if (getCurrentRole().includes('apoyo') && supportScreen) {
        supportScreen.classList.add('active');
      } else {
        homeScreen?.classList.add('active');
      }
    }, true);
  }

  function watchActiveScreen() {
    setInterval(() => {
      if (isSupportOrCitizen()) {
        removeAdminElementsForNonAdmin();

        const adminScreen = document.getElementById('adminScreen');
        if (adminScreen?.classList.contains('active')) {
          adminScreen.classList.remove('active');

          const supportScreen = document.getElementById('supportScreen');
          const homeScreen = document.getElementById('homeScreen');

          if (getCurrentRole().includes('apoyo') && supportScreen) {
            supportScreen.classList.add('active');
          } else {
            homeScreen?.classList.add('active');
          }
        }
      }
    }, 700);
  }

  window.isRealConectaAdmin = isRealAdmin;
  window.removeAdminElementsForNonAdmin = removeAdminElementsForNonAdmin;

  window.addEventListener('load', () => {
    preventAdminScreenAccess();
    watchActiveScreen();
    setTimeout(removeAdminElementsForNonAdmin, 600);
    setTimeout(removeAdminElementsForNonAdmin, 1500);
    setTimeout(removeAdminElementsForNonAdmin, 3000);
  });
})();
