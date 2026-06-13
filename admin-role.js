const SUPERADMIN_EMAILS = ['adminp@gmail.com'];
const ADMIN_EMAILS = ['adminb@gmail.com'];
const ALL_ADMIN_EMAILS = [...SUPERADMIN_EMAILS, ...ADMIN_EMAILS];

let adminGuardInterval = null;
let adminSessionClosing = false;
let adminAutoRedirectEnabled = false;
let retryAdminModulesTimer = null;

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
  const loginEmail = normalizeEmail(getLoginEmail());

  // Si se está escribiendo un correo admin, siempre tiene prioridad.
  // Esto evita que una sesión anterior de ciudadano/apoyo bloquee el acceso.
  if (resolveAdminRole(loginEmail)) return loginEmail;

  const stored = getStoredProfile();
  const storedEmail = normalizeEmail(stored.correo || stored.email || '');

  if (resolveAdminRole(storedEmail)) return storedEmail;

  return loginEmail || storedEmail;
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
  const currentStoredEmail = normalizeEmail(stored.correo || stored.email || '');
  const keepStoredName = currentStoredEmail === safeEmail && stored.nombre;

  localStorage.setItem('conectaPerfil', JSON.stringify({
    ...stored,
    uid: stored.uid || window.conectaCurrentUser?.uid || '',
    correo: safeEmail,
    email: safeEmail,
    nombre: keepStoredName ? stored.nombre : (safeEmail.split('@')[0] || role),
    rol: role,
    accesoAdministrativo: true,
    estado: 'Activo'
  }));
}

function clearAdminProfile() {
  adminSessionClosing = true;
  adminAutoRedirectEnabled = false;
  localStorage.removeItem('conectaPerfil');
  sessionStorage.removeItem('conectaPerfil');

  if (adminGuardInterval) {
    clearInterval(adminGuardInterval);
    adminGuardInterval = null;
  }

  if (retryAdminModulesTimer) {
    clearTimeout(retryAdminModulesTimer);
    retryAdminModulesTimer = null;
  }

  window.stopSuperadminEnhancements?.();
  window.stopAdminClean?.();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  document.getElementById(screenId)?.classList.add('active');
  window.scrollTo(0, 0);
}

function goLoginScreen() {
  showScreen('loginScreen');
}

function goSplashScreen() {
  showScreen('splashScreen');
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
      ? 'Panel central: incidentes, reportes, ubicaciones, estadísticas y gestión de administradores.'
      : 'Panel operativo: incidentes, mapa, reportes y seguimiento en tiempo real.';
  }

  if (profileName && role) profileName.textContent = role;
  if (profileRole && role) profileRole.textContent = `${role} activo`;

  document.querySelectorAll('[data-superadmin-only]').forEach(item => {
    item.style.display = role === 'Superadmin' ? '' : 'none';
  });
}

function loadAdminModules() {
  if (!isAdminUser()) return;

  let started = false;

  try {
    if (typeof window.startAdminClean === 'function') {
      window.startAdminClean();
      started = true;
    }

    if (getCurrentAdminRole() === 'Superadmin' && typeof window.startSuperadminEnhancements === 'function') {
      window.startSuperadminEnhancements();
      started = true;
    }
  } catch (error) {
    console.warn('No se pudo iniciar el panel administrativo:', error);
  }

  // app-stability.js es el único encargado de cargar los módulos.
  // Si todavía no han llegado, se reintenta sin importarlos otra vez.
  if (!started) {
    clearTimeout(retryAdminModulesTimer);
    retryAdminModulesTimer = setTimeout(loadAdminModules, 600);
  }
}

function goAdminPanel() {
  const role = getCurrentAdminRole();
  if (!role) return;

  showScreen('adminScreen');
  applyAdminPanelInfo();
  loadAdminModules();
}

function forceAdminPanel() {
  if (adminSessionClosing) return false;

  const email = getAdminEmailCandidate();
  const role = resolveAdminRole(email);

  if (!role) return false;

  saveAdminProfile(email, role);
  adminAutoRedirectEnabled = true;
  goAdminPanel();
  return true;
}

function activateAdminAfterLogin() {
  adminSessionClosing = false;

  const loginRole = resolveAdminRole(getLoginEmail());
  if (!loginRole) {
    adminAutoRedirectEnabled = false;
    return;
  }

  adminAutoRedirectEnabled = true;
  saveAdminProfile(getLoginEmail(), loginRole);

  [300, 900, 1800, 3200, 5000].forEach(delay => {
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

    if (destination === 'splashScreen' || destination === 'onboardingScreen' || destination === 'loginScreen') {
      adminAutoRedirectEnabled = false;
      return;
    }

    const blockedForAdmin = [
      'homeScreen',
      'categoriesScreen',
      'reportInfoScreen',
      'locationScreen',
      'evidenceScreen',
      'confirmScreen',
      'supportScreen',
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
    if (!adminAutoRedirectEnabled || !isAdminUser()) return;

    const active = document.querySelector('.screen.active');
    const allowed = [
      'adminScreen',
      'mapScreen',
      'trackingScreen',
      'profileScreen',
      'splashScreen',
      'onboardingScreen',
      'loginScreen'
    ];

    if (active && !allowed.includes(active.id)) {
      goAdminPanel();
    }

    if (active && allowed.includes(active.id)) {
      loadAdminModules();
    }
  }, 1400);
}

window.resolveAdminRole = resolveAdminRole;
window.isAdminUser = isAdminUser;
window.getCurrentAdminRole = getCurrentAdminRole;
window.goAdminPanel = goAdminPanel;
window.applyAdminPanelInfo = applyAdminPanelInfo;
window.forceAdminPanel = forceAdminPanel;
window.clearAdminProfile = clearAdminProfile;
window.saveAdminProfile = saveAdminProfile;
window.loadAdminModules = loadAdminModules;
window.goSplashScreen = goSplashScreen;
window.goLoginScreen = goLoginScreen;

window.addEventListener('load', () => {
  const loginForm = document.getElementById('loginForm');
  const registerBtn = document.getElementById('registerBtn');

  loginForm?.addEventListener('submit', activateAdminAfterLogin);
  registerBtn?.addEventListener('click', activateAdminAfterLogin);

  protectAdminActions();
  keepAdminOnAdminPanel();

  if (isAdminUser()) {
    adminAutoRedirectEnabled = true;
    setTimeout(forceAdminPanel, 900);
  }
});