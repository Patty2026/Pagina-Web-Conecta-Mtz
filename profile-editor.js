import {
  auth,
  db,
  obtenerPerfilUsuario,
  crearPerfilUsuario
} from './firebase-service.js';

import {
  doc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let profileEditorReady = false;
let lastLoadedUid = null;
let lastLoadedAt = 0;

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function saveStoredProfile(profile = {}) {
  const current = getStoredProfile();
  localStorage.setItem('conectaPerfil', JSON.stringify({
    ...current,
    ...profile
  }));
}

function currentRole() {
  return window.getCurrentAdminRole?.() || getStoredProfile().rol || 'Ciudadano';
}

function isSupportRole(role = '') {
  return String(role).toLowerCase().includes('apoyo');
}

function ensureProfileEditor() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen || document.getElementById('profileEditorCard')) return;

  const card = document.createElement('section');
  card.id = 'profileEditorCard';
  card.className = 'profile-editor-card admin-data-card';
  card.innerHTML = `
    <h3>Datos del perfil</h3>
    <form id="profileEditorForm" class="app-form">
      <label>Nombre</label>
      <input id="profileEditName" type="text" placeholder="Nombre completo" maxlength="80">

      <label>Correo electrónico</label>
      <input id="profileEditEmail" type="email" disabled>

      <label>Rol</label>
      <input id="profileEditRole" type="text" disabled>

      <label>Num. de teléfono</label>
      <input id="profileEditPhone" type="tel" placeholder="Ej. 232 123 4567" maxlength="20">

      <label>Ocupación</label>
      <input id="profileEditOccupation" type="text" placeholder="Ej. Electricista, plomero, estudiante, comerciante" maxlength="90">

      <label id="profileSupportDescriptionLabel">Descripción del Apoyo</label>
      <textarea id="profileEditSupportDescription" placeholder="Describe brevemente cómo puedes apoyar o qué servicio/oficio puedes brindar." maxlength="280"></textarea>
      <small id="profileSupportDescriptionHelp">Esta información ayuda a otros usuarios a conocer quién atiende o apoya sus incidencias.</small>

      <label>Estado</label>
      <input id="profileEditStatus" type="text" disabled>

      <button class="main-btn" type="submit">Guardar cambios</button>
      <small id="profileEditMessage"></small>
    </form>
  `;

  const menuList = profileScreen.querySelector('.menu-list') || profileScreen.querySelector('.profile-accordion');
  if (menuList) {
    profileScreen.insertBefore(card, menuList);
  } else {
    const nav = profileScreen.querySelector('.bottom-nav');
    profileScreen.insertBefore(card, nav || null);
  }

  document.getElementById('profileEditorForm')?.addEventListener('submit', saveProfileChanges);
}

function setField(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value || '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

function setAvatar(name = 'U') {
  const avatar = document.querySelector('#profileScreen .avatar');
  if (avatar) avatar.textContent = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function updateSupportDescriptionHelp(role = '') {
  const help = document.getElementById('profileSupportDescriptionHelp');
  const field = document.getElementById('profileEditSupportDescription');

  if (!help || !field) return;

  if (isSupportRole(role)) {
    field.placeholder = 'Ej. Puedo apoyar con alumbrado, fugas de agua, limpieza, áreas verdes o gestión vecinal.';
    help.textContent = 'Esta descripción podrá orientar a los usuarios cuando atiendas sus incidentes.';
  } else {
    field.placeholder = 'Describe brevemente tu apoyo comunitario, experiencia u oficio.';
    help.textContent = 'Este campo es opcional. Ayuda a conocer mejor tu perfil dentro de la comunidad.';
  }
}

async function loadProfileData(force = false) {
  ensureProfileEditor();

  const user = auth.currentUser;
  const stored = getStoredProfile();
  const role = currentRole();
  const now = Date.now();

  if (!force && user?.uid && lastLoadedUid === user.uid && now - lastLoadedAt < 2500) {
    return;
  }

  let profile = stored;

  if (user?.uid) {
    const firestoreProfile = await obtenerPerfilUsuario(user.uid).catch(() => null);

    if (firestoreProfile) {
      profile = {
        ...stored,
        ...firestoreProfile,
        correo: firestoreProfile.correo || user.email || stored.correo,
        rol: role || firestoreProfile.rol || stored.rol
      };
    } else {
      profile = {
        ...stored,
        correo: user.email || stored.correo,
        nombre: stored.nombre || user.email?.split('@')[0] || 'Usuario',
        numeroTelefono: stored.numeroTelefono || '',
        ocupacion: stored.ocupacion || '',
        descripcionApoyo: stored.descripcionApoyo || '',
        rol: role,
        estado: 'Activo'
      };

      await crearPerfilUsuario(user.uid, profile).catch(error => {
        console.warn('No se pudo crear perfil faltante:', error);
      });
    }
  }

  const displayName = profile.nombre || profile.correo?.split('@')[0] || 'Usuario';
  const email = profile.correo || profile.email || user?.email || '';
  const status = profile.estado || 'Activo';
  const phone = profile.numeroTelefono || profile.telefono || '';
  const occupation = profile.ocupacion || profile.oficio || '';
  const supportDescription = profile.descripcionApoyo || '';
  const resolvedRole = role || profile.rol || 'Usuario';

  setText('profileName', displayName);
  setText('profileRole', `${resolvedRole} activo`);
  setAvatar(displayName);

  setField('profileEditName', displayName);
  setField('profileEditEmail', email);
  setField('profileEditRole', resolvedRole);
  setField('profileEditPhone', phone);
  setField('profileEditOccupation', occupation);
  setField('profileEditSupportDescription', supportDescription);
  setField('profileEditStatus', status);
  updateSupportDescriptionHelp(resolvedRole);

  saveStoredProfile({
    ...profile,
    nombre: displayName,
    correo: email,
    numeroTelefono: phone,
    ocupacion: occupation,
    descripcionApoyo: supportDescription,
    rol: resolvedRole,
    estado: status
  });

  if (user?.uid) {
    lastLoadedUid = user.uid;
    lastLoadedAt = now;
  }
}

async function saveProfileChanges(event) {
  event.preventDefault();

  const user = auth.currentUser;
  const message = document.getElementById('profileEditMessage');
  const name = document.getElementById('profileEditName')?.value?.trim();
  const phone = document.getElementById('profileEditPhone')?.value?.trim() || '';
  const occupation = document.getElementById('profileEditOccupation')?.value?.trim() || '';
  const supportDescription = document.getElementById('profileEditSupportDescription')?.value?.trim() || '';

  if (!name) {
    if (message) message.textContent = 'Escribe un nombre válido.';
    return;
  }

  const stored = getStoredProfile();
  const email = stored.correo || stored.email || user?.email || '';
  const role = currentRole();
  const status = stored.estado || 'Activo';

  const profileData = {
    nombre: name,
    correo: email,
    rol: role,
    estado: status,
    numeroTelefono: phone,
    ocupacion: occupation,
    descripcionApoyo: supportDescription
  };

  if (!user?.uid) {
    saveStoredProfile(profileData);
    setText('profileName', name);
    setText('profileRole', `${role} activo`);
    setAvatar(name);
    if (message) message.textContent = 'Perfil actualizado localmente.';
    return;
  }

  const profileRef = doc(db, 'usuarios', user.uid);

  await updateDoc(profileRef, {
    ...profileData,
    fechaActualizacion: serverTimestamp()
  });

  saveStoredProfile(profileData);

  setText('profileName', name);
  setText('profileRole', `${role} activo`);
  setAvatar(name);
  updateSupportDescriptionHelp(role);

  if (message) message.textContent = 'Perfil actualizado correctamente.';

  lastLoadedAt = 0;
  setTimeout(() => loadProfileData(true), 400);
}

function watchProfileScreen() {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-go="profileScreen"]')) {
      setTimeout(() => loadProfileData(true), 250);
    }
  });

  setInterval(() => {
    const profileScreen = document.getElementById('profileScreen');
    if (profileScreen?.classList.contains('active')) {
      loadProfileData();
    }
  }, 5000);
}

export function startProfileEditor() {
  if (profileEditorReady) return;
  profileEditorReady = true;

  ensureProfileEditor();
  watchProfileScreen();
  setTimeout(() => loadProfileData(true), 500);
}

window.startProfileEditor = startProfileEditor;

window.addEventListener('load', () => {
  setTimeout(startProfileEditor, 1000);
});
