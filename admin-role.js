const SUPERADMIN_EMAILS = ['adminp@gmail.com'];
const ADMIN_EMAILS = ['adminb@gmail.com'];

let adminGuardInterval = null;
let adminSessionClosing = false;
let adminModulesLoaded = false;

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function resolveAdminRole(email = '') {
  const normalized = normalizeEmail(email);

  if (SUPERADMIN_EMAILS.includes(normalized)) return 'Superadmin';
  if (ADMIN_EMAILS.includes(normalized)) return 'Administrador';

  return null;
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function getLoginEmail() {
  return document.getElementById('loginEmail')?.value || '';
}

function getAdminEmailCandidate() {
  const stored = getStoredProfile();
  return stored.correo || stored.email || getLoginEmail();
}

function isAdminUser() {
  if (adminSessionClosing) return false;
  return resolveAdminRole(getAdminEmailCandidate()) !== null;
}

function getCurrentAdminRole() {
  if (adminSessionClosing) return null;
  return resolveAdminRole(getAdminEmailCandidate());
}

function saveAdminProfile(email, role) {
  const stored = getStoredProfile();
  const safeEmail = normalizeEmail(email || stored.correo || stored.email || getLoginEmail());

  localStorage.setItem('conectaPerfil', JSON.stringify({
    ...stored,
    correo: safeEmail,
    email: safeEmail,
    nombre: stored.nombre || safeEmail.split('@')[0] || role,
    rol: role
  }));
}

function clearAdminProfile() {
  adminSessionClosing = true;
  localStorage.removeItem('conectaPerfil');
  sessionStorage.removeItem('conectaPerfil');

  if (adminGuardInterval) {
    clearInterval(adminGuardInterval);
    adminGuardInterval = null;
  }

  window.stopAdminRealtimePanel?.();
  window.stopAdminMap?.();
}

function goLoginScreen() {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  document.getElementById('loginScreen')?.classList.add('active');
  window.scrollTo(0, 0);
}

function applyAdminPanelInfo() {
  const role = getCurrentAdminRole();
  const title = document.getElementById('adminRoleTitle');
  const description = document.getElementById('adminRoleDescription');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');

  if (title) title.textContent = role || 'Administrador';

  if (description) {
    description.textContent = role === 'Superadmin'
      ? 'Panel central: incidentes, ubicaciones, estadísticas y gestión de administradores.'
      : 'Panel operativo: incidentes, mapa y seguimiento en tiempo real.';
  }

  if (profileName && role) profileName.textContent = role;
  if (profileRole && role) profileRole.textContent = `${role} activo`;

  document.querySelectorAll('[data-superadmin-only]').forEach(item => {
    item.style.display = role === 'Superadmin' ? '' : 'none';
  });
}

async function loadAdminModules() {
  if (adminModulesLoaded || !isAdminUser()) return;

  adminModulesLoaded = true;

  try {
    const dashboard = await import('./admin-dashboard.js');
    dashboard.startAdminRealtimePanel?.();
  } catch (error) {
    console.warn('No se pudo cargar admin-dashboard.js:', error);
  }

  try {
    const superadmin = await import('./superadmin-module.js');
    superadmin.startSuperadminModule?.();
  } catch (error) {
    console.warn('No se pudo cargar superadmin-module.js:', error);
  }

  try {
    await import('./admin-map.js');
  } catch (error) {
    console.warn('No se pudo cargar admin-map.js:', error);
  }

  try {
    await import('./admin-navigation-clean.js');
    window.setupAdminNavigation?.();
  } catch (error) {
    console.warn('No se pudo cargar admin-navigation-clean.js:', error);
  }
}

function goAdminPanel() {
  const role = getCurrentAdminRole();
  if (!role) return;

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const adminScreen = document.getElementById('adminScreen');
  if (adminScreen) {
    adminScreen.classList.add('active');
    applyAdminPanelInfo();
    loadAdminModules();
    window.refreshCleanAdminNav?.();
    window.scrollTo(0, 0);
  }
}

function forceAdminPanel() {
  if (adminSessionClosing) return false;

  const email = getAdminEmailCandidate();
  const role = resolveAdminRole(email);

  if (!role) return false;

  saveAdminProfile(email, role);
  goAdminPanel();
  return true;
}

function activateAdminAfterLogin() {
  adminSessionClosing = false;
  adminModulesLoaded = false;

  [250, 800, 1600, 2800, 4200].forEach(delay => {
    setTimeout(forceAdminPanel, delay);
  });
}

async function handleAdminLogout(event) {
  const logoutButton = event.target.closest('#logoutBtn, .logout, [data-admin-logout]');
  if (!logoutButton) return;

  if (!isAdminUser()) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  clearAdminProfile();

  try {
    if (window.firebaseSignOut) {
      await window.firebaseSignOut();
    }
  } catch (error) {
    console.warn('No se pudo cerrar sesión desde Firebase:', error);
  }

  goLoginScreen();
}

function protectAdminActions() {
  document.addEventListener('click', handleAdminLogout, true);

  document.addEventListener('click', event => {
    const adminOnly = event.target.closest('[data-superadmin-only]');
    if (adminOnly && getCurrentAdminRole() !== 'Superadmin') {
      event.preventDefault();
      event.stopPropagation();
      alert('Esta opción solo está disponible para Superadmin.');
      return;
    }

    const nav = event.target.closest('[data-go]');
    if (!nav || !isAdminUser()) return;

    const destination = nav.dataset.go;
    const blockedForAdmin = [
      'homeScreen',
      'categoriesScreen',
      'reportInfoScreen',
      'locationScreen',
      'evidenceScreen',
      'confirmScreen',
      'supportScreen',
      'trackingScreen',
      'notificationsScreen'
    ];

    if (blockedForAdmin.includes(destination)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goAdminPanel();
    }
  }, true);
}

function keepAdminOnAdminPanel() {
  if (adminGuardInterval) clearInterval(adminGuardInterval);

  adminGuardInterval = setInterval(() => {
    if (!isAdminUser()) return;

    const active = document.querySelector('.screen.active');
    const allowed = [
      'adminScreen',
      'mapScreen',
      'profileScreen'
    ];

    if (active && !allowed.includes(active.id)) {
      goAdminPanel();
    }
  }, 1200);
}

window.resolveAdminRole = resolveAdminRole;
window.isAdminUser = isAdminUser;
window.getCurrentAdminRole = getCurrentAdminRole;
window.goAdminPanel = goAdminPanel;
window.applyAdminPanelInfo = applyAdminPanelInfo;
window.forceAdminPanel = forceAdminPanel;
window.clearAdminProfile = clearAdminProfile;
window.loadAdminModules = loadAdminModules;

window.addEventListener('load', () => {
  const loginForm = document.getElementById('loginForm');
  const registerBtn = document.getElementById('registerBtn');

  loginForm?.addEventListener('submit', activateAdminAfterLogin);
  registerBtn?.addEventListener('click', activateAdminAfterLogin);

  protectAdminActions();
  keepAdminOnAdminPanel();

  if (isAdminUser()) {
    forceAdminPanel();
  }
});
