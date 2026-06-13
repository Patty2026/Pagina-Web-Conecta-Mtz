/* =========================================================
   ConectaMartínez - Núcleo limpio de estabilidad por rol
   ---------------------------------------------------------
   Evita contaminación entre Ciudadano, Apoyo comunitario,
   Administrador básico y Superadmin.
   ========================================================= */

(function () {
  const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];

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

  function getCurrentEmail() {
    const profile = getStoredProfile();
    return normalize(profile.correo || profile.email || document.getElementById('loginEmail')?.value || '');
  }

  function getCurrentRole() {
    const profile = getStoredProfile();
    return normalize(profile.rol || '');
  }

  function isRealAdmin() {
    const email = getCurrentEmail();
    const role = getCurrentRole();

    return ADMIN_EMAILS.includes(email)
      || role.includes('superadmin')
      || role.includes('administrador');
  }

  function isSupportOrCitizen() {
    const role = getCurrentRole();
    const email = getCurrentEmail();

    if (ADMIN_EMAILS.includes(email)) return false;

    return role.includes('apoyo')
      || role.includes('ciudadano')
      || !role.includes('administrador');
  }

  function hasScript(src) {
    return Array.from(document.scripts).some(script =>
      script.src.includes(src.replace('./', ''))
    );
  }

  function loadScript(src, type = 'text/javascript') {
    if (hasScript(src)) return;

    const script = document.createElement('script');
    script.src = `${src}?v=202606-realtime-clean`;
    script.type = type;
    script.defer = true;
    document.body.appendChild(script);
  }

  function loadBaseModules() {
    loadScript('./navigation-history.js');
    loadScript('./profile-clean.js', 'module');
    loadScript('./realtime-sync.js', 'module');
  }

  function loadAdminOnlyModules() {
    if (!isRealAdmin()) return;
    loadScript('./admin-clean.js', 'module');
  }

  function removeAdminViewsForNonAdmin() {
    if (!isSupportOrCitizen()) return;

    document.querySelectorAll(
      '#adminCleanRoot, #adminRealtimePanel, #adminWindowsRoot, #adminMapPanel, #adminManagersWindow, .admin-window-tabs, .admin-map-panel, .admin-realtime-panel'
    ).forEach(element => element.remove());

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
    window.startProfileClean?.();
    window.startRealtimeSync?.();

    if (isRealAdmin()) {
      window.startAdminClean?.();
    } else {
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
    setInterval(runModules, 1800);
  }

  window.addEventListener('load', () => {
    loadBaseModules();
    loadAdminOnlyModules();
    disableUnimplementedSocialButtons();
    watchNavigation();
    keepCleanByRole();

    setTimeout(runModules, 1000);
  });
})();
