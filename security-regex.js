/* =========================================================
   ConectaMartínez - Validaciones Regex de seguridad
   ---------------------------------------------------------
   Validaciones ligeras sin bloquear el inicio de sesión real.
   Firebase Auth valida las credenciales; este archivo solo evita
   formatos claramente inválidos o texto peligroso.
   ========================================================= */

(function () {
  const SECURITY_REGEX = {
    email: /^[a-zA-Z0-9._%+-]{3,64}@[a-zA-Z0-9.-]{2,120}\.[a-zA-Z]{2,24}$/,
    // Firebase permite contraseñas desde 6 caracteres. No exigir números/letras aquí
    // porque bloquearía cuentas ya creadas con contraseñas válidas para Firebase.
    password: /^.{6,128}$/,
    name: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]{1,59}$/,
    phone: /^(\+?52\s?)?\d{10}$|^(\+?52\s?)?(\d{3}[\s-]?\d{3}[\s-]?\d{4})$/,
    role: /^(Ciudadano|Apoyo comunitario|Administrador|Administrador básico|Superadmin)$/,
    occupation: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.,#/+()-]{0,80}$/,
    safeText: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.,;:¿?¡!#/+()\-_\'"%\n]{0,500}$/,
    noScript: /<\s*script|javascript:|on\w+\s*=|<\s*iframe|<\s*object|<\s*embed/i
  };

  const ROLE_EMAILS = {
    superadmin: ['adminp@gmail.com'],
    admin: ['adminb@gmail.com']
  };

  function normalize(value = '') {
    return String(value).trim();
  }

  function normalizeEmail(value = '') {
    return normalize(value).toLowerCase();
  }

  function cleanPhone(value = '') {
    return String(value).replace(/[^0-9+]/g, '').trim();
  }

  function hasUnsafeText(value = '') {
    return SECURITY_REGEX.noScript.test(String(value));
  }

  function sanitizeText(value = '') {
    return String(value)
      .replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gis, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  }

  function showMessage(message, type = 'error') {
    const authMessage = document.getElementById('authMessage');
    if (authMessage) {
      authMessage.textContent = message;
      authMessage.className = `auth-message ${type}`;
      authMessage.dataset.type = type;
      return;
    }

    alert(message);
  }

  function validateEmail(email) {
    return SECURITY_REGEX.email.test(normalizeEmail(email));
  }

  function validatePassword(password) {
    return SECURITY_REGEX.password.test(String(password || ''));
  }

  function validateName(name) {
    const value = normalize(name);
    return value === '' || SECURITY_REGEX.name.test(value);
  }

  function validatePhone(phone) {
    const value = normalize(phone);
    return value === '' || SECURITY_REGEX.phone.test(value);
  }

  function validateOccupation(value) {
    const text = normalize(value);
    return text === '' || SECURITY_REGEX.occupation.test(text);
  }

  function validateSafeText(value) {
    const text = normalize(value);
    return !hasUnsafeText(text) && SECURITY_REGEX.safeText.test(text);
  }

  function isSuperadminEmail(email) {
    return ROLE_EMAILS.superadmin.includes(normalizeEmail(email));
  }

  function isBasicAdminEmail(email) {
    return ROLE_EMAILS.admin.includes(normalizeEmail(email));
  }

  function validateRoleAccess(email, role) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = normalize(role);

    if (!SECURITY_REGEX.role.test(normalizedRole)) {
      return { ok: false, message: 'Rol no válido.' };
    }

    if (normalizedRole === 'Superadmin' && !isSuperadminEmail(normalizedEmail)) {
      return { ok: false, message: 'Este correo no tiene permiso de Superadmin.' };
    }

    if ((normalizedRole === 'Administrador' || normalizedRole === 'Administrador básico')
      && !isBasicAdminEmail(normalizedEmail)
      && !isSuperadminEmail(normalizedEmail)) {
      return { ok: false, message: 'Este correo no tiene permiso de Administrador.' };
    }

    return { ok: true, message: '' };
  }

  function validateLoginForm(event) {
    const form = event.target;
    if (!form || form.id !== 'loginForm') return;

    const email = document.getElementById('loginEmail')?.value || '';
    const password = document.getElementById('loginPassword')?.value || '';

    if (!validateEmail(email)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showMessage('Ingresa un correo válido.');
      return;
    }

    if (!validatePassword(password)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showMessage('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    // No validar rol público en login. Admin/Superadmin se detectan por correo
    // en admin-role.js y en las reglas de Firestore.
  }

  function validateProfileForm(event) {
    const form = event.target;
    if (!form || (form.id !== 'profileDataForm' && form.id !== 'profileCleanForm')) return;

    const name = document.getElementById('profileNameInput')?.value || document.getElementById('profileCleanName')?.value || '';
    const phone = document.getElementById('profilePhoneInput')?.value || document.getElementById('profileCleanPhone')?.value || '';
    const occupation = document.getElementById('profileOccupationInput')?.value || document.getElementById('profileCleanOccupation')?.value || '';
    const support = document.getElementById('profileSupportInput')?.value || document.getElementById('profileCleanSupport')?.value || '';

    if (!validateName(name)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('El nombre solo debe contener letras, espacios y algunos signos básicos.');
      return;
    }

    if (!validatePhone(phone)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Ingresa un número de teléfono válido de 10 dígitos.');
      return;
    }

    if (!validateOccupation(occupation)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('La ocupación contiene caracteres no permitidos.');
      return;
    }

    if (!validateSafeText(support)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('La descripción contiene caracteres o código no permitido.');
    }
  }

  function validateAdminManagerForm(event) {
    const form = event.target;
    if (!form || (form.id !== 'adminManagerForm' && form.id !== 'adminCleanForm')) return;

    const email = document.getElementById('managerEmailInput')?.value || document.getElementById('adminCleanEmail')?.value || '';
    const name = document.getElementById('managerNameInput')?.value || document.getElementById('adminCleanName')?.value || '';
    const phone = document.getElementById('managerPhoneInput')?.value || document.getElementById('adminCleanPhone')?.value || '';
    const role = document.getElementById('managerRoleInput')?.value || document.getElementById('adminCleanRole')?.value || 'Administrador';
    const area = document.getElementById('managerAreaInput')?.value || document.getElementById('adminCleanArea')?.value || '';
    const notes = document.getElementById('managerNotesInput')?.value || document.getElementById('adminCleanNotes')?.value || '';

    if (!validateEmail(email)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Correo de administrador no válido.');
      return;
    }

    if (!validateName(name)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Nombre de administrador no válido.');
      return;
    }

    if (!validatePhone(phone)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Teléfono de administrador no válido.');
      return;
    }

    const access = validateRoleAccess(email, role);
    if (!access.ok) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(access.message);
      return;
    }

    if (!validateSafeText(area) || !validateSafeText(notes)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Área u observaciones contienen caracteres no permitidos.');
    }
  }

  function sanitizeInputs() {
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
      if (input.dataset.securityReady === 'true') return;
      input.dataset.securityReady = 'true';
      input.addEventListener('blur', () => {
        input.value = sanitizeText(input.value);
      });
    });

    document.querySelectorAll('input[type="email"]').forEach(input => {
      if (input.dataset.securityReady === 'true') return;
      input.dataset.securityReady = 'true';
      input.addEventListener('blur', () => {
        input.value = normalizeEmail(input.value);
      });
    });

    document.querySelectorAll('input[type="tel"]').forEach(input => {
      if (input.dataset.securityReady === 'true') return;
      input.dataset.securityReady = 'true';
      input.addEventListener('blur', () => {
        input.value = cleanPhone(input.value);
      });
    });
  }

  function installSecurityRegex() {
    if (window.__conectaSecurityInstalled) {
      sanitizeInputs();
      return;
    }

    window.__conectaSecurityInstalled = true;
    document.addEventListener('submit', validateLoginForm, true);
    document.addEventListener('submit', validateProfileForm, true);
    document.addEventListener('submit', validateAdminManagerForm, true);
    sanitizeInputs();
  }

  window.CONSECURITY_REGEX = SECURITY_REGEX;
  window.validateConectaEmail = validateEmail;
  window.validateConectaRoleAccess = validateRoleAccess;
  window.sanitizeConectaText = sanitizeText;
  window.installSecurityRegex = installSecurityRegex;

  window.addEventListener('load', () => {
    setTimeout(installSecurityRegex, 500);
  });
})();