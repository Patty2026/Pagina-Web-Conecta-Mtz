/* =========================================================
   ConectaMartínez - Arranque seguro y ligero
   ---------------------------------------------------------
   Evita cargar módulos pesados antes de iniciar sesión.
   Mantiene la navegación básica activa y carga Admin/Superadmin
   solo cuando realmente se necesita.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];
  const MODULE_VERSION = '202606-safe-lite-boot';

  let bootReady = false;
  let baseModulesLoaded = false;
  let adminModulesLoaded = false;
  let adminStartAttempts = 0;

  function normalize(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function getStoredProfile() {
    try {
      return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
    } catch {
      return {};
    }
  }

  function getLoginEmail() {
    return normalize(document.getElementById('loginEmail')?.value || '');
  }

  function currentEmail() {
    const loginEmail = getLoginEmail();
    if (ADMIN_EMAILS.includes(loginEmail)) return loginEmail;

    const profile = getStoredProfile();
    return normalize(window.conectaCurrentUser?.email || profile.correo || profile.email || '');
  }

  function isAdminEmail(email = currentEmail()) {
    return ADMIN_EMAILS.includes(normalize(email));
  }

  function isSuperadmin() {
    return currentEmail() === 'adminp@gmail.com';
  }

  function showScreen(screenId) {
    const screen = document.getElementById(screenId);
    if (!screen) return false;

    document.querySelectorAll('.screen').forEach(item => item.classList.remove('active'));
    screen.classList.add('active');
    window.scrollTo(0, 0);

    if (screenId === 'profileScreen') {
      loadBaseModules();
      setTimeout(() => window.startProfileClean?.(), 350);
    }

    if (screenId === 'adminScreen' || screenId === 'mapScreen' || screenId === 'trackingScreen') {
      maybeStartAdminModules();
    }

    return true;
  }

  function installFallbackNavigation() {
    if (window.__conectaFallbackNavigationReady) return;
    window.__conectaFallbackNavigationReady = true;
    window.showConectaScreen = showScreen;

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-go]');
      if (!button) return;

      if (button.closest('form') && button.type === 'submit') return;

      const destination = button.dataset.go;
      if (!destination) return;

      const moved = showScreen(destination);
      if (moved) {
        setTimeout(() => {
          if (destination === 'adminScreen') maybeStartAdminModules();
          if (destination === 'profileScreen') window.startProfileClean?.();
        }, 250);
      }
    }, false);
  }

  function hasScript(src) {
    const cleanName = src.replace('./', '').split('?')[0];
    return Array.from(document.scripts).some(script => script.src.includes(cleanName));
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return;

    const script = document.createElement('script');
    script.src = `${src}?v=${MODULE_VERSION}`;
    script.type = type;
    script.async = true;
    script.onerror = () => {
      console.error(`No se pudo cargar ${src}`);
      showBootMessage(`No se pudo cargar ${src}. Actualiza con Ctrl + F5.`);
    };
    document.body.appendChild(script);
  }

  function showBootMessage(message) {
    const authMessage = document.getElementById('authMessage');
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.dataset.type = 'error';
  }

  function loadBaseModules() {
    if (baseModulesLoaded) return;
    baseModulesLoaded = true;

    loadScript('./auth-access-fix.js', 'module');
    loadScript('./navigation-history.js');
    loadScript('./profile-clean.js', 'module');
    loadScript('./realtime-sync.js', 'module');

    setTimeout(() => {
      window.startProfileClean?.();
      window.startRealtimeSync?.();
    }, 800);
  }

  function loadAdminModules() {
    if (!isAdminEmail()) return;
    if (adminModulesLoaded) return;
    adminModulesLoaded = true;

    loadBaseModules();
    loadScript('./admin-clean.js', 'module');
    loadScript('./admin-profile-fix.js', 'module');

    if (isSuperadmin()) {
      loadScript('./superadmin-enhancements.js', 'module');
    }
  }

  function maybeStartAdminModules() {
    if (!isAdminEmail()) return;

    loadAdminModules();

    const active = document.querySelector('.screen.active')?.id;
    const allowAdminStart = ['adminScreen', 'mapScreen', 'trackingScreen', 'profileScreen'].includes(active);
    if (!allowAdminStart) return;

    adminStartAttempts += 1;

    try {
      window.startAdminClean?.();
      if (isSuperadmin()) window.startSuperadminEnhancements?.();
    } catch (error) {
      console.warn('No se pudo iniciar panel administrativo:', error);
    }

    if ((!window.startAdminClean || (isSuperadmin() && !window.startSuperadminEnhancements)) && adminStartAttempts < 5) {
      setTimeout(maybeStartAdminModules, 900);
    }
  }

  function installErrorReporter() {
    if (window.__conectaErrorReporterReady) return;
    window.__conectaErrorReporterReady = true;

    window.addEventListener('error', event => {
      console.error('Error de carga en ConectaMartínez:', event.message, event.filename, event.lineno);
      showBootMessage('Se detectó un error de carga. Abre F12 → Console para ver el detalle.');
    });

    window.addEventListener('unhandledrejection', event => {
      console.error('Promesa rechazada en ConectaMartínez:', event.reason);
    });
  }

  function installLoginWatcher() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm || loginForm.dataset.safeBootReady === 'true') return;
    loginForm.dataset.safeBootReady = 'true';

    loginForm.addEventListener('submit', () => {
      const email = getLoginEmail();
      loadBaseModules();

      if (isAdminEmail(email)) {
        localStorage.setItem('conectaPerfil', JSON.stringify({
          ...getStoredProfile(),
          correo: email,
          email,
          rol: email === 'adminp@gmail.com' ? 'Superadmin' : 'Administrador',
          accesoAdministrativo: true,
          adminSessionActive: true,
          estado: 'Activo'
        }));

        [900, 1800, 3000].forEach(delay => {
          setTimeout(() => {
            showScreen('adminScreen');
            maybeStartAdminModules();
          }, delay);
        });
      }
    });
  }

  window.runConectaStableCore = function runConectaStableCore() {
    installFallbackNavigation();
    installLoginWatcher();
    const active = document.querySelector('.screen.active')?.id;
    if (active === 'profileScreen') loadBaseModules();
    if (['adminScreen', 'mapScreen', 'trackingScreen'].includes(active)) maybeStartAdminModules();
  };

  window.showConectaScreen = showScreen;
  window.maybeStartAdminModules = maybeStartAdminModules;
  window.loadConectaBaseModules = loadBaseModules;

  window.addEventListener('load', () => {
    if (bootReady) return;
    bootReady = true;

    installFallbackNavigation();
    installErrorReporter();
    installLoginWatcher();

    // Carga mínima después del arranque. No iniciar Admin/Superadmin desde localStorage.
    setTimeout(() => loadScript('./auth-access-fix.js', 'module'), 600);
  });
})();
