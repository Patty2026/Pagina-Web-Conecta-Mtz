/* =========================================================
   ConectaMartínez - Núcleo limpio de estabilidad por rol
   ---------------------------------------------------------
   Carga módulos una sola vez y evita contaminación entre
   Ciudadano, Apoyo comunitario, Administrador y Superadmin.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];
  const MODULE_VERSION = '202606-stable-core';

  function normalize(value = '') {
    return String(value).trim().toLowerCase();
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
    script.onerror = () => console.error(`No se pudo cargar ${src}`);
    document.body.appendChild(script);
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
      '#adminCleanRoot, #adminRealtimePanel, #adminWindowsRoot, #adminMapPanel, #adminManagersWindow, #superIncidentTools, #superadminMovementPanel, #superadminNotificationsPanel, #superadminUsersMetrics, #adminReportsPanel, .admin-window-tabs, .admin-map-panel, .admin-realtime-panel'
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

    document.querySelectorAll('.screen').forEach(screen =>
      screen.classList.remove('active')
    );

    target?.classList.add('active');
  }

  function disableUnimplementedSocialButtons() {
    document.querySelectorAll('.social-row button').forEach(button => {
      button.disabled = true;
      button.title = 'Disponible próximamente';
      button.style.opacity = '0.55';
    });
  }

  function runModules() {
    loadBaseModules();

    window.startProfileClean?.();
    window.startRealtimeSync?.();

    if (isRealAdmin()) {
      loadAdminOnlyModules();
      window.startAdminClean?.();
      window.restoreAdminProfileName?.();

      if (isSuperadmin()) {
        window.startSuperadminEnhancements?.();
      } else {
        window.stopSuperadminEnhancements?.();
      }
    } else {
      window.stopSuperadminEnhancements?.();
      window.stopAdminClean?.();
      removeAdminViewsForNonAdmin();
      fixSupportNavigation();
    }
  }

  function afterNavigation() {
    setTimeout(runModules, 300);
  }

  function watchNavigation() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-go], .profile-toggle, .bottom-nav button')) {
        afterNavigation();
      }
    });
  }

  function keepCleanByRole() {
    setInterval(runModules, 2200);
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
  }

  window.addEventListener('load', () => {
    loadBaseModules();
    loadAdminOnlyModules();
    disableUnimplementedSocialButtons();
    watchNavigation();
    keepCleanByRole();
    showLoadErrors();

    setTimeout(runModules, 800);
    setTimeout(runModules, 1800);
  });
})();