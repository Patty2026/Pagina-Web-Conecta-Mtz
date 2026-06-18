/* =========================================================
   ConectaMartínez - Control ligero de acceso administrativo
   ---------------------------------------------------------
   No carga paneles pesados desde localStorage al abrir la app.
   El Admin/Superadmin se activa después del login real.
   ========================================================= */

const SUPERADMIN_EMAILS = ['adminp@gmail.com'];
const ADMIN_EMAILS = ['adminb@gmail.com'];
const ALL_ADMIN_EMAILS = [...SUPERADMIN_EMAILS, ...ADMIN_EMAILS];

let adminSessionClosing = false;
let adminAutoRedirectEnabled = false;
let retryAdminModulesTimer = null;
let lastForcedPanelAt = 0;

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
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
  if (resolveAdminRole(loginEmail)) return loginEmail;

  const stored = getStoredProfile();
  const storedEmail = normalizeEmail(stored.correo || stored.email || '');

  // Solo usar sesión guardada cuando fue marcada como administrativa activa.
  if (stored.adminSessionActive === true && stored.accesoAdministrativo === true && resolveAdminRole(storedEmail)) {
    return storedEmail;
  }

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
    adminSessionActive: true,
    estado: 'Activo'
  }));
}

function clearAdminProfile() {
  adminSessionClosing = true;
  adminAutoRedirectEnabled = false;
  localStorage.removeItem('conectaPerfil');
  sessionStorage.removeItem('conectaPerfil');

  if (retryAdminModulesTimer) {
    clearTimeout(retryAdminModulesTimer);
    retryAdminModulesTimer = null;
  }

  window.stopSuperadminEnhancements?.();
  window.stopAdminClean?.();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
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

function loadAdminModules(options = {}) {
  if (!isAdminUser()) return;

  window.maybeStartAdminModules?.();

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

  if (!started && options.retry !== false) {
    clearTimeout(retryAdminModulesTimer);
    retryAdminModulesTimer = setTimeout(() => loadAdminModules({ retry: false }), 1200);
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

  const now = Date.now();
  if (now - lastForcedPanelAt < 900) return true;
  lastForcedPanelAt = now;

  saveAdminProfile(email, role);
  adminAutoRedirectEnabled = true;
  goAdminPanel();
  return true;
}

function activateAdminAfterLogin() {
  adminSessionClosing = false;

  const loginEmail = normalizeEmail(getLoginEmail());
  const loginRole = resolveAdminRole(loginEmail);

  if (!loginRole) {
    adminAutoRedirectEnabled = false;
    return;
  }

  adminAutoRedirectEnabled = true;
  saveAdminProfile(loginEmail, loginRole);

  [900, 1800, 3000].forEach(delay => setTimeout(forceAdminPanel, delay));
}

async function handleAdminLogout(event) {
  const logoutButton = event.target.closest('#logoutBtn, .logout, [data-admin-logout]');
  if (!logoutButton) return;
  if (!isAdminUser()) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  clearAdminProfile();

  try {
    if (window.firebaseSignOut) await window.firebaseSignOut();
  } catch (error) {
    console.warn('No se pudo cerrar sesión desde Firebase:', error);
  }

  goLoginScreen();
}

function protectAdminActions() {
  if (window.__adminRoleActionsReady) return;
  window.__adminRoleActionsReady = true;

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
    if (!nav || !isAdminUser() || !adminAutoRedirectEnabled) return;

    const destination = nav.dataset.go;
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

function installAdminLoginWatcher() {
  const loginForm = document.getElementById('loginForm');
  const registerBtn = document.getElementById('registerBtn');

  if (loginForm && loginForm.dataset.adminRoleReady !== 'true') {
    loginForm.dataset.adminRoleReady = 'true';
    loginForm.addEventListener('submit', activateAdminAfterLogin);
  }

  if (registerBtn && registerBtn.dataset.adminRoleReady !== 'true') {
    registerBtn.dataset.adminRoleReady = 'true';
    registerBtn.addEventListener('click', activateAdminAfterLogin);
  }
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
  installAdminLoginWatcher();
  protectAdminActions();

  // No redirigir automáticamente desde localStorage al abrir la página.
  // Esto evita que una sesión vieja con Superadmin congele el arranque.
});
