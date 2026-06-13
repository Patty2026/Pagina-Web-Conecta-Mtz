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

function ensureProfileEditor() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen || document.getElementById('profileEditorCard')) return;

  const card = document.createElement('section');
  card.id = 'profileEditorCard';
  card.className = 'profile-editor-card admin-data-card';
  card.innerHTML = `
    <h3>Datos del perfil</h3>
    <form id="profileEditorForm" class="app-form">
      <label>Nombre para mostrar</label>
      <input id="profileEditName" type="text" placeholder="Tu nombre">

      <label>Correo electrónico</label>
      <input id="profileEditEmail" type="email" disabled>

      <label>Rol</label>
      <input id="profileEditRole" type="text" disabled>

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

async function loadProfileData() {
  ensureProfileEditor();

  const user = auth.currentUser;
  const stored = getStoredProfile();
  const role = currentRole();

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

  setText('profileName', displayName);
  setText('profileRole', `${role || profile.rol || 'Usuario'} activo`);
  setAvatar(displayName);

  setField('profileEditName', displayName);
  setField('profileEditEmail', email);
  setField('profileEditRole', role || profile.rol || 'Usuario');
  setField('profileEditStatus', status);

  saveStoredProfile({
    ...profile,
    nombre: displayName,
    correo: email,
    rol: role || profile.rol,
    estado: status
  });
}

async function saveProfileChanges(event) {
  event.preventDefault();

  const user = auth.currentUser;
  const message = document.getElementById('profileEditMessage');
  const name = document.getElementById('profileEditName')?.value?.trim();

  if (!name) {
    if (message) message.textContent = 'Escribe un nombre válido.';
    return;
  }

  const stored = getStoredProfile();
  const email = stored.correo || stored.email || user?.email || '';
  const role = currentRole();

  if (!user?.uid) {
    saveStoredProfile({ nombre: name, correo: email, rol: role });
    setText('profileName', name);
    setText('profileRole', `${role} activo`);
    setAvatar(name);
    if (message) message.textContent = 'Nombre actualizado localmente.';
    return;
  }

  const profileRef = doc(db, 'usuarios', user.uid);

  await updateDoc(profileRef, {
    nombre: name,
    correo: email,
    rol: role,
    estado: stored.estado || 'Activo',
    fechaActualizacion: serverTimestamp()
  });

  saveStoredProfile({
    nombre: name,
    correo: email,
    rol: role,
    estado: stored.estado || 'Activo'
  });

  setText('profileName', name);
  setText('profileRole', `${role} activo`);
  setAvatar(name);

  if (message) message.textContent = 'Perfil actualizado correctamente.';
}

function watchProfileScreen() {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-go="profileScreen"]')) {
      setTimeout(loadProfileData, 250);
    }
  });

  setInterval(() => {
    const profileScreen = document.getElementById('profileScreen');
    if (profileScreen?.classList.contains('active')) {
      loadProfileData();
    }
  }, 3000);
}

export function startProfileEditor() {
  if (profileEditorReady) return;
  profileEditorReady = true;

  ensureProfileEditor();
  watchProfileScreen();
  setTimeout(loadProfileData, 500);
}

window.startProfileEditor = startProfileEditor;

window.addEventListener('load', () => {
  setTimeout(startProfileEditor, 1000);
});
