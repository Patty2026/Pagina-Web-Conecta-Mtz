function isAdminActive() {
  return Boolean(window.isAdminUser?.());
}

function isSuperadmin() {
  return window.getCurrentAdminRole?.() === 'Superadmin';
}

function goToScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  document.querySelectorAll('.screen').forEach(item => item.classList.remove('active'));
  screen.classList.add('active');
  window.scrollTo(0, 0);
}

function setActiveNav(screenId) {
  document.querySelectorAll('#adminScreen .bottom-nav button, #mapScreen .bottom-nav button, #profileScreen .bottom-nav button').forEach(button => {
    const target = button.dataset.adminTarget || button.dataset.go;
    button.classList.toggle('active', target === screenId);
  });
}

function buildCleanAdminNav() {
  const navHtml = `
    <button class="active" type="button" data-admin-target="adminScreen">Panel</button>
    <button type="button" data-admin-target="mapScreen">Mapa</button>
    <button type="button" data-admin-target="profileScreen">Perfil</button>
  `;

  ['adminScreen', 'mapScreen', 'profileScreen'].forEach(screenId => {
    const screen = document.getElementById(screenId);
    if (!screen) return;

    let nav = screen.querySelector('.bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      screen.appendChild(nav);
    }

    nav.innerHTML = navHtml;
  });
}

function setupAdminNavigation() {
  if (!isAdminActive()) return;

  buildCleanAdminNav();

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-target]');
    if (!button || !isAdminActive()) return;

    event.preventDefault();
    event.stopPropagation();

    const screenId = button.dataset.adminTarget;

    goToScreen(screenId);
    setActiveNav(screenId);

    if (screenId === 'adminScreen') {
      window.startSuperadminModule?.();
      window.startAdminRealtimePanel?.();
    }

    if (screenId === 'mapScreen') {
      window.startAdminMap?.();
    }
  }, true);

  if (!isSuperadmin()) {
    document.querySelectorAll('[data-superadmin-only]').forEach(item => {
      item.style.display = 'none';
    });
  }
}

function refreshCleanAdminNav() {
  if (!isAdminActive()) return;
  buildCleanAdminNav();

  const active = document.querySelector('.screen.active');
  setActiveNav(active?.id || 'adminScreen');
}

window.setupAdminNavigation = setupAdminNavigation;
window.refreshCleanAdminNav = refreshCleanAdminNav;

window.addEventListener('load', () => {
  setTimeout(setupAdminNavigation, 1500);
  setInterval(refreshCleanAdminNav, 2000);
});
