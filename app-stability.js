/* =========================================================
   ConectaMartínez - Núcleo estable de arranque
   ---------------------------------------------------------
   Mantiene la app navegable aunque un módulo tarde en cargar,
   evita scripts duplicados y centraliza la carga de módulos.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];
  const MODULE_VERSION = '202606-safe-boot';

  let bootStarted = false;
  let adminStarted = false;
  let superadminStarted = false;
  let retryTimer = null;

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
    return normalize(window.conectaCurrentUser?.email || profile.correo || profile.email || loginEmail || '');
  }

  function currentRole() {
    const profile = getStoredProfile();
    const email = currentEmail();

    if (email === 'adminp@gmail.com') return 'superadmin';
    if (email === 'adminb@gmail.com') return 'administrador';

    return normalize(profile.rol || '');
  }

  function isAdmin() {
    const email = currentEmail();
    const role = currentRole();

    if (ADMIN_EMAILS.includes(email)) return true;
    if (role.includes('ciudadano') || role.includes('apoyo')) return false;

    return role.includes('administrador') || role.includes('superadmin');
  }

  function isSuperadmin() {
    return currentEmail() === 'adminp@gmail.com' || currentRole().includes('superadmin');
  }

  function showScreen(screenId) {
    const screen = document.getElementById(screenId);
    if (!screen) return false;

    document.querySelectorAll('.screen').forEach(item => item.classList.remove('active'));
    screen.classList.add('active');
    window.scrollTo(0, 0);

    if (screenId === 'mapScreen') {
      setTimeout(() => {
        window.runConectaStableCore?.();
        window.startAdminClean?.();
      }, 250);
    }

    if (screenId === 'profileScreen') {
      setTimeout(() => window.startProfileClean?.(), 250);
    }

    if (screenId === 'adminScreen') {
      setTimeout(() => runCore(), 250);
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

      const destination = button.dataset.go;
      if (!destination) return;

      // No interferir con botones de envío de formularios.
      if (button.closest('form') && button.type === 'submit') return;

      const moved = showScreen(destination);
      if (moved) {
        setTimeout(runCore, 300);
      }
    }, false);
  }

  function hasScript(src) {
    const cleanName = src.replace('./', '');
    return Array.from(document.scripts).some(script => script.src.includes(cleanName));
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return;

    const script = document.createElement('script');
    script.src = `${src}?v=${MODULE_VERSION}`;
    script.type = type;
    script.defer = true;
    script.onerror = () => {
      console.error(`No se pudo cargar ${src}`);
      showBootMessage(`No se pudo cargar ${src}. Actualiza con Ctrl + F5.`);
    };
    document.body.appendChild(script);
  }

  function showBootMessage(message) {
    const authMessage = document.getElementById('authMessage');
    if (!authMessage) return;

    const loginVisible = document.getElementById('loginScreen')?.classList.contains('active');
    if (!loginVisible) return;

    authMessage.textContent = message;
    authMessage.dataset.type = 'error';
  }

  function loadBaseModules() {
    loadScript('./auth-access-fix.js', 'module');
    loadScript('./navigation-history.js');
    loadScript('./profile-clean.js', 'module');
    loadScript('./realtime-sync.js', 'module');
  }

  function startBaseModules() {
    try {
      window.startProfileClean?.();
      window.startRealtimeSync?.();
    } catch (error) {
      console.warn('No se pudieron iniciar módulos base:', error);
    }
  }

  function loadAdminModules() {
    if (!isAdmin()) return;

    loadScript('./admin-clean.js', 'module');
    loadScript('./admin-profile-fix.js', 'module');

    if (isSuperadmin()) {
      loadScript('./superadmin-enhancements.js', 'module');
    }
  }

  function startAdminModules() {
    if (!isAdmin()) {
      adminStarted = false;
      superadminStarted = false;
      window.stopSuperadminEnhancements?.();
      window.stopAdminClean?.();
      return;
    }

    loadAdminModules();

    try {
      if (typeof window.startAdminClean === 'function') {
        window.startAdminClean();
        adminStarted = true;
      }

      if (isSuperadmin() && typeof window.startSuperadminEnhancements === 'function') {
        window.startSuperadminEnhancements();
        superadminStarted = true;
      }
    } catch (error) {
      console.warn('No se pudo iniciar módulo administrativo:', error);
    }

    const needsRetry = !window.startAdminClean || (isSuperadmin() && !window.startSuperadminEnhancements);
    if (needsRetry) scheduleRetry();
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runCore, 900);
  }

  function removeAdminExtrasForNormalUsers() {
    if (isAdmin()) return;

    document.querySelectorAll(
      '#adminCleanRoot, #adminReportsPanel, #adminCleanMapFilters, #superIncidentTools, #superadminNotificationsPanel, #superadminUsersMetrics, #superadminMovementPanel, .admin-window-tabs, .admin-map-panel, .admin-realtime-panel'
    ).forEach(element => element.remove());

    document.body.classList.remove('superadmin-enhanced');

    const active = document.querySelector('.screen.active');
    if (active?.id === 'adminScreen') {
      const role = currentRole();
      showScreen(role.includes('apoyo') ? 'supportScreen' : 'homeScreen');
    }
  }

  function runCore() {
    installFallbackNavigation();
    loadBaseModules();
    startBaseModules();

    if (isAdmin()) {
      startAdminModules();
    } else {
      removeAdminExtrasForNormalUsers();
    }
  }

  function watchAuthAndNavigation() {
    document.getElementById('loginForm')?.addEventListener('submit', () => {
      setTimeout(runCore, 700);
      setTimeout(runCore, 1800);
      setTimeout(runCore, 3200);
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      setTimeout(() => {
        adminStarted = false;
        superadminStarted = false;
        window.stopSuperadminEnhancements?.();
        window.stopAdminClean?.();
        removeAdminExtrasForNormalUsers();
      }, 400);
    });

    document.addEventListener('click', event => {
      if (event.target.closest('[data-go], .profile-toggle, .bottom-nav button')) {
        setTimeout(runCore, 350);
      }
    });
  }

  function installErrorReporter() {
    if (window.__conectaErrorReporterReady) return;
    window.__conectaErrorReporterReady = true;

    window.addEventListener('error', event => {
      console.error('Error de carga en ConectaMartínez:', event.message, event.filename, event.lineno);
    });

    window.addEventListener('unhandledrejection', event => {
      console.error('Promesa rechazada en ConectaMartínez:', event.reason);
    });
  }

  window.runConectaStableCore = runCore;
  window.showConectaScreen = showScreen;

  window.addEventListener('load', () => {
    if (bootStarted) return;
    bootStarted = true;

    installFallbackNavigation();
    installErrorReporter();
    watchAuthAndNavigation();

    runCore();
    setTimeout(runCore, 900);
    setTimeout(runCore, 2200);
  });
})();