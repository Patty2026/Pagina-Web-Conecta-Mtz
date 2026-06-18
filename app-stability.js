/* =========================================================
   ConectaMartínez - Núcleo estable y optimizado
   ---------------------------------------------------------
   Inicializa los módulos una sola vez por sesión/rol, evita
   duplicados, reduce lecturas/escrituras repetidas y limpia
   vistas que no corresponden al rol activo.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];
  const MODULE_VERSION = '202606-optimal-core';

  let lastIdentity = '';
  let profileStarted = false;
  let realtimeStarted = false;
  let adminStarted = false;
  let superadminStarted = false;
  let retryTimer = null;
  let healthTimer = null;

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

  function getCurrentEmail() {
    const loginEmail = getLoginEmail();
    if (ADMIN_EMAILS.includes(loginEmail)) return loginEmail;

    const profile = getStoredProfile();
    return normalize(profile.correo || profile.email || loginEmail || '');
  }

  function getCurrentRole() {
    const profile = getStoredProfile();
    return normalize(profile.rol || '');
  }

  function hasExplicitAdminAccess() {
    const profile = getStoredProfile();
    const role = getCurrentRole();

    if (role.includes('apoyo') || role.includes('ciudadano')) return false;

    return profile.accesoAdministrativo === true
      && (role.includes('superadmin') || role.includes('administrador'));
  }

  function isRealAdmin() {
    const email = getCurrentEmail();
    return ADMIN_EMAILS.includes(email) || hasExplicitAdminAccess();
  }

  function isSuperadmin() {
    const email = getCurrentEmail();
    const role = getCurrentRole();
    return email === 'adminp@gmail.com' || (hasExplicitAdminAccess() && role.includes('superadmin'));
  }

  function isSupportOrCitizen() {
    const role = getCurrentRole();
    const email = getCurrentEmail();

    if (ADMIN_EMAILS.includes(email) || hasExplicitAdminAccess()) return false;

    return role.includes('apoyo')
      || role.includes('ciudadano')
      || !role.includes('administrador');
  }

  function identity() {
    return `${getCurrentEmail()}|${getCurrentRole()}|${isRealAdmin() ? 'admin' : 'user'}|${isSuperadmin() ? 'super' : 'normal'}`;
  }

  function resetWhenIdentityChanges() {
    const currentIdentity = identity();
    if (currentIdentity === lastIdentity) return;

    if (lastIdentity) {
      window.stopSuperadminEnhancements?.();
      window.stopAdminClean?.();
    }

    lastIdentity = currentIdentity;
    profileStarted = false;
    realtimeStarted = false;
    adminStarted = false;
    superadminStarted = false;
  }

  function hasScript(src) {
    const cleanName = src.replace('./', '');
    return Array.from(document.scripts).some(script => script.src.includes(cleanName));
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return true;

    const script = document.createElement('script');
    script.src = `${src}?v=${MODULE_VERSION}`;
    script.type = type;
    script.defer = true;
    script.onerror = () => console.error(`No se pudo cargar ${src}`);
    document.body.appendChild(script);
    return false;
  }

  function loadBaseModules() {
    loadScript('./auth-access-fix.js', 'module');
    loadScript('./navigation-history.js');
    loadScript('./profile-clean.js', 'module');
    loadScript('./realtime-sync.js', 'module');
  }

  function loadAdminOnlyModules() {
    if (!isRealAdmin()) return;

    loadScript('./admin-clean.js', 'module');
    loadScript('./admin-profile-fix.js', 'module');

    if (isSuperadmin()) {
      loadScript('./superadmin-enhancements.js', 'module');
    }
  }

  function removeAdminViewsForNonAdmin() {
    if (!isSupportOrCitizen()) return;

    document.querySelectorAll(
      '#adminCleanRoot, #adminRealtimePanel, #adminWindowsRoot, #adminMapPanel, #adminManagersWindow, #superIncidentTools, #superadminMovementPanel, #superadminNotificationsPanel, #superadminUsersMetrics, #adminReportsPanel, #adminCleanMapFilters, .admin-window-tabs, .admin-map-panel, .admin-realtime-panel'
    ).forEach(element => element.remove());

    document.body.classList.remove('superadmin-enhanced');

    const adminScreen = document.getElementById('adminScreen');
    if (adminScreen) adminScreen.classList.remove('active');
  }

  function fixSupportNavigation() {
    if (!isSupportOrCitizen()) return;

    const active = document.querySelector('.screen.active');
    if (!active || active.id !== 'adminScreen') return;

    const target = getCurrentRole().includes('apoyo')
      ? document.getElementById('supportScreen')
      : document.getElementById('homeScreen');

    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    target?.classList.add('active');
  }

  function disableUnimplementedSocialButtons() {
    document.querySelectorAll('.social-row button').forEach(button => {
      button.disabled = true;
      button.title = 'Disponible próximamente';
      button.style.opacity = '0.55';
    });
  }

  function startBaseModules() {
    if (!profileStarted && typeof window.startProfileClean === 'function') {
      profileStarted = true;
      Promise.resolve(window.startProfileClean()).catch(console.warn);
    }

    if (!realtimeStarted && typeof window.startRealtimeSync === 'function') {
      realtimeStarted = true;
      Promise.resolve(window.startRealtimeSync()).catch(console.warn);
    }
  }

  function startAdminModules() {
    if (!isRealAdmin()) return;

    loadAdminOnlyModules();

    if (!adminStarted && typeof window.startAdminClean === 'function') {
      adminStarted = true;
      Promise.resolve(window.startAdminClean()).catch(console.warn);
    }

    if (isSuperadmin()) {
      if (!superadminStarted && typeof window.startSuperadminEnhancements === 'function') {
        superadminStarted = true;
        Promise.resolve(window.startSuperadminEnhancements()).catch(console.warn);
      }
    } else if (superadminStarted) {
      window.stopSuperadminEnhancements?.();
      superadminStarted = false;
    }
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => runModules({ retry: true }), 900);
  }

  function runModules() {
    resetWhenIdentityChanges();
    loadBaseModules();
    startBaseModules();

    if (isRealAdmin()) {
      startAdminModules();

      const waitingForAdmin = !window.startAdminClean || (isSuperadmin() && !window.startSuperadminEnhancements);
      if (waitingForAdmin) scheduleRetry();
      return;
    }

    window.stopSuperadminEnhancements?.();
    window.stopAdminClean?.();
    adminStarted = false;
    superadminStarted = false;
    removeAdminViewsForNonAdmin();
    fixSupportNavigation();
  }

  function afterNavigation() {
    setTimeout(runModules, 250);
  }

  function watchNavigation() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-go], .profile-toggle, .bottom-nav button')) {
        afterNavigation();
      }
    });

    document.getElementById('loginForm')?.addEventListener('submit', () => {
      setTimeout(runModules, 900);
      setTimeout(runModules, 2200);
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      setTimeout(() => {
        window.stopSuperadminEnhancements?.();
        window.stopAdminClean?.();
        adminStarted = false;
        superadminStarted = false;
        profileStarted = false;
        realtimeStarted = false;
        removeAdminViewsForNonAdmin();
      }, 300);
    });
  }

  function startHealthCheck() {
    if (healthTimer) return;

    healthTimer = setInterval(() => {
      resetWhenIdentityChanges();

      if (!isRealAdmin()) {
        removeAdminViewsForNonAdmin();
        fixSupportNavigation();
        return;
      }

      loadAdminOnlyModules();
      if (!adminStarted || (isSuperadmin() && !superadminStarted)) {
        runModules();
      }
    }, 15000);
  }

  function showLoadErrors() {
    window.addEventListener('error', event => {
      console.error('Error de carga en la app:', event.message, event.filename, event.lineno);
      const authMessage = document.getElementById('authMessage');
      if (authMessage && document.getElementById('loginScreen')?.classList.contains('active')) {
        authMessage.textContent = 'Se detectó un error de carga. Actualiza con Ctrl + F5 e intenta nuevamente.';
        authMessage.dataset.type = 'error';
      }
    });

    window.addEventListener('unhandledrejection', event => {
      console.error('Promesa rechazada en la app:', event.reason);
    });
  }

  window.runConectaStableCore = runModules;

  window.addEventListener('load', () => {
    disableUnimplementedSocialButtons();
    watchNavigation();
    showLoadErrors();
    startHealthCheck();

    runModules();
    setTimeout(runModules, 900);
    setTimeout(runModules, 2200);
  });
})();