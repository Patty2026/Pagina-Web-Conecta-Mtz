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
