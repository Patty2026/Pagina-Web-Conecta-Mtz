const SUPERADMIN_EMAILS = ['adminp@gmail.com'];
const ADMIN_EMAILS = ['adminb@gmail.com'];

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function resolveAdminRole(email = '') {
  const normalized = normalizeEmail(email);

  if (SUPERADMIN_EMAILS.includes(normalized)) {
    return 'Superadmin';
  }

  if (ADMIN_EMAILS.includes(normalized)) {
    return 'Administrador';
  }

  return null;
}

window.resolveAdminRole = resolveAdminRole;
function isAdminUser() {
  const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  return resolveAdminRole(stored.correo || stored.email || '') !== null;
}

function getCurrentAdminRole() {
  const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  return resolveAdminRole(stored.correo || stored.email || '');
}

function applyAdminPanelInfo() {
  const role = getCurrentAdminRole();

  const title = document.getElementById('adminRoleTitle');
  const description = document.getElementById('adminRoleDescription');

  if (title) title.textContent = role || 'Administrador';

  if (description) {
    description.textContent =
      role === 'Superadmin'
        ? 'Acceso total: usuarios, administradores, reportes, estadísticas y configuración general.'
        : 'Acceso operativo: gestión de reportes, mapa, notificaciones y estadísticas básicas.';
  }

  document.querySelectorAll('[data-superadmin-only]').forEach(item => {
    item.style.display = role === 'Superadmin' ? '' : 'none';
  });
}

function goAdminPanel() {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const adminScreen = document.getElementById('adminScreen');
  if (adminScreen) {
    adminScreen.classList.add('active');
    applyAdminPanelInfo();
    window.scrollTo(0, 0);
  }
}

window.isAdminUser = isAdminUser;
window.getCurrentAdminRole = getCurrentAdminRole;
window.goAdminPanel = goAdminPanel;
window.applyAdminPanelInfo = applyAdminPanelInfo;
function activateAdminAfterLogin() {
  setTimeout(() => {
    const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
    const emailInput = document.getElementById('loginEmail')?.value || '';
    const detectedRole = resolveAdminRole(stored.correo || emailInput);

    if (!detectedRole) return;

    localStorage.setItem('conectaPerfil', JSON.stringify({
      ...stored,
      correo: stored.correo || emailInput,
      rol: detectedRole
    }));

    goAdminPanel();
  }, 700);
}

function protectAdminActions() {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-superadmin-only]');
    if (!button) return;

    const role = getCurrentAdminRole();

    if (role !== 'Superadmin') {
      event.preventDefault();
      alert('Esta opción solo está disponible para Superadmin.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerBtn = document.getElementById('registerBtn');

  loginForm?.addEventListener('submit', activateAdminAfterLogin);
  registerBtn?.addEventListener('click', activateAdminAfterLogin);

  protectAdminActions();

  if (isAdminUser()) {
    applyAdminPanelInfo();
  }
});
