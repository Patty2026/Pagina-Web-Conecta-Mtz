import { auth, db } from './firebase-service.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let profileLoadedOnceForUid = null;
let userIsEditingProfile = false;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getProfileFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function saveProfileToStorage(profile) {
  const stored = getProfileFromStorage();
  localStorage.setItem('conectaPerfil', JSON.stringify({ ...stored, ...profile }));
}

function ensureProfileDataPanel() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen) return;

  const oldEditor = document.getElementById('profileCleanForm')?.closest('.profile-editor-card');
  if (oldEditor) oldEditor.remove();

  let panelButton = profileScreen.querySelector('[data-profile-panel="panelData"], [data-profile-panel="profileDataPanel"]');
  let panel = document.getElementById('profileDataPanel');

  if (!panelButton) {
    const menu = profileScreen.querySelector('.menu-list');
    if (menu) {
      panelButton = document.createElement('button');
      panelButton.className = 'profile-toggle';
      panelButton.type = 'button';
      panelButton.dataset.profilePanel = 'profileDataPanel';
      panelButton.innerHTML = 'Mis datos <span>›</span>';
      menu.insertBefore(panelButton, menu.firstChild);
    }
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'profileDataPanel';
    panel.className = 'profile-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <b>Mis datos</b>
          <small>Actualiza tu información personal y de apoyo.</small>
        </div>
      </div>

      <form id="profileCleanForm" class="app-form">
        <label>Nombre</label>
        <input id="profileCleanName" type="text" placeholder="Tu nombre" autocomplete="name" />

        <label>Num. de teléfono</label>
        <input id="profileCleanPhone" type="tel" placeholder="Ej. 232 000 0000" autocomplete="tel" />

        <label>Ocupación</label>
        <input id="profileCleanOccupation" type="text" placeholder="Ej. Electricista, plomero, docente" />

        <label>Descripción del Apoyo</label>
        <textarea id="profileCleanSupport" placeholder="Describe cómo puedes apoyar o qué servicio/oficio brindas."></textarea>

        <button class="main-btn" type="submit">Guardar cambios</button>
        <small id="profileCleanMessage"></small>
      </form>
    `;

    if (panelButton) {
      panelButton.insertAdjacentElement('afterend', panel);
    } else {
      const nav = profileScreen.querySelector('.bottom-nav');
      profileScreen.insertBefore(panel, nav || null);
    }
  }

  if (panelButton) {
    panelButton.innerHTML = 'Mis datos <span>›</span>';
    panelButton.dataset.profilePanel = 'profileDataPanel';
  }

  const form = document.getElementById('profileCleanForm');
  form?.removeEventListener('submit', saveProfile);
  form?.addEventListener('submit', saveProfile);

  form?.querySelectorAll('input, textarea').forEach(field => {
    field.addEventListener('input', () => {
      userIsEditingProfile = true;
    });
  });
}

function openProfilePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  document.querySelectorAll('#profileScreen .profile-panel').forEach(item => {
    item.classList.toggle('open', item.id === panelId);
    item.style.display = item.id === panelId ? 'block' : 'none';
  });
}

async function loadProfile({ forceFill = false } = {}) {
  const user = auth.currentUser;
  if (!user) return;

  const sameUserAlreadyLoaded = profileLoadedOnceForUid === user.uid;
  const shouldFillInputs = forceFill || !sameUserAlreadyLoaded || !userIsEditingProfile;

  const stored = getProfileFromStorage();
  let data = { ...stored, correo: user.email };

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (snap.exists()) data = { ...data, ...snap.data() };
  } catch (error) {
    console.warn('No se pudo cargar perfil desde Firestore:', error);
  }

  const name = data.nombre || user.email?.split('@')[0] || 'Usuario';
  const role = data.rol || stored.rol || 'Usuario';

  setText('profileName', name);
  setText('profileRole', `${role} activo`);

  const avatar = document.querySelector('#profileScreen .avatar');
  if (avatar) avatar.textContent = name.slice(0, 1).toUpperCase();

  if (shouldFillInputs) {
    const nameInput = document.getElementById('profileCleanName');
    const phoneInput = document.getElementById('profileCleanPhone');
    const occupationInput = document.getElementById('profileCleanOccupation');
    const supportInput = document.getElementById('profileCleanSupport');

    if (nameInput) nameInput.value = data.nombre || '';
    if (phoneInput) phoneInput.value = data.numeroTelefono || data.telefono || '';
    if (occupationInput) occupationInput.value = data.ocupacion || '';
    if (supportInput) supportInput.value = data.descripcionApoyo || '';
  }

  profileLoadedOnceForUid = user.uid;
  saveProfileToStorage(data);
}

async function saveProfile(event) {
  event.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

  const data = {
    nombre: document.getElementById('profileCleanName')?.value?.trim() || user.email.split('@')[0],
    numeroTelefono: document.getElementById('profileCleanPhone')?.value?.trim() || '',
    ocupacion: document.getElementById('profileCleanOccupation')?.value?.trim() || '',
    descripcionApoyo: document.getElementById('profileCleanSupport')?.value?.trim() || '',
    correo: user.email,
    fechaActualizacion: serverTimestamp()
  };

  await setDoc(doc(db, 'usuarios', user.uid), data, { merge: true });
  saveProfileToStorage(data);
  userIsEditingProfile = false;
  await loadProfile({ forceFill: true });
  setText('profileCleanMessage', 'Datos actualizados correctamente.');
}

export function startProfileClean() {
  ensureProfileDataPanel();
  loadProfile();
}

window.startProfileClean = startProfileClean;
window.openProfilePanel = openProfilePanel;

window.addEventListener('load', () => setTimeout(startProfileClean, 900));

document.addEventListener('click', event => {
  const toggle = event.target.closest('#profileScreen [data-profile-panel]');
  if (toggle) {
    const panelId = toggle.dataset.profilePanel;
    if (panelId === 'profileDataPanel' || panelId === 'panelData') {
      event.preventDefault();
      setTimeout(() => openProfilePanel('profileDataPanel'), 50);
    }
  }

  if (event.target.closest('[data-go="profileScreen"]')) {
    setTimeout(startProfileClean, 250);
  }
});
