import { auth, db } from './firebase-service.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

let profileLoadedOnceForUid = null;
let userIsEditingProfile = false;
let profileSaving = false;
let authUserCache = null;
let authStarted = false;

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

function isUnsafeText(value = '') {
  return /<\s*script|javascript:|onerror\s*=|onclick\s*=|<\s*iframe|<\s*object|<\s*embed/i.test(String(value));
}

function validateProfileData(data) {
  const phoneRegex = /^[0-9\s()+\-.]{7,20}$/;
  const nameRegex = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]{2,60}$/;

  if (!nameRegex.test(data.nombre)) {
    return 'El nombre debe tener de 2 a 60 caracteres y solo letras.';
  }

  if (data.numeroTelefono && !phoneRegex.test(data.numeroTelefono)) {
    return 'El número de teléfono no tiene un formato válido.';
  }

  if ([data.nombre, data.numeroTelefono, data.ocupacion, data.descripcionApoyo].some(isUnsafeText)) {
    return 'El texto contiene caracteres o código no permitido.';
  }

  return '';
}

function startAuthListener() {
  if (authStarted) return;
  authStarted = true;

  onAuthStateChanged(auth, user => {
    authUserCache = user || null;
    window.conectaCurrentUser = user || null;

    if (user) {
      saveProfileToStorage({ uid: user.uid, correo: user.email, email: user.email });
      setTimeout(() => loadProfile({ forceFill: false }), 150);
    }
  });
}

function getRealUser() {
  return auth.currentUser || authUserCache || window.conectaCurrentUser || null;
}

async function recoverUserFromStorage() {
  const user = getRealUser();
  if (user) return user;

  const stored = getProfileFromStorage();
  if (stored.uid && (stored.correo || stored.email)) {
    return {
      uid: stored.uid,
      email: stored.correo || stored.email,
      fromStorage: true
    };
  }

  return null;
}

function removeDuplicateDataPanels() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen) return;

  const buttons = Array.from(profileScreen.querySelectorAll('[data-profile-panel="profileDataPanel"], [data-profile-panel="panelData"]'));
  const panels = Array.from(profileScreen.querySelectorAll('#profileDataPanel, #panelData'));

  buttons.forEach((button, index) => {
    if (index > 0) button.remove();
  });

  panels.forEach(panel => {
    if (panel.id === 'panelData') panel.remove();
  });
}

function ensureProfileDataPanel() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen) return;

  const oldEditor = document.getElementById('profileCleanForm')?.closest('.profile-editor-card');
  if (oldEditor) oldEditor.remove();

  removeDuplicateDataPanels();

  const menu = profileScreen.querySelector('.menu-list');
  let panelButton = profileScreen.querySelector('[data-profile-panel="profileDataPanel"]');
  let panel = document.getElementById('profileDataPanel');

  if (!panelButton && menu) {
    panelButton = document.createElement('button');
    panelButton.className = 'profile-toggle';
    panelButton.type = 'button';
    panelButton.dataset.profilePanel = 'profileDataPanel';
    panelButton.innerHTML = 'Mis datos <span>›</span>';
    menu.insertBefore(panelButton, menu.firstChild);
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
          <small>Actualiza tu información directamente en la base de datos.</small>
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

        <button class="main-btn" id="profileCleanSaveBtn" type="submit">Guardar cambios</button>
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
    field.oninput = () => {
      userIsEditingProfile = true;
      setText('profileCleanMessage', '');
    };
  });
}

function openProfilePanel(panelId) {
  const targetPanelId = panelId === 'panelData' ? 'profileDataPanel' : panelId;
  const panel = document.getElementById(targetPanelId);
  if (!panel) return;

  document.querySelectorAll('#profileScreen .profile-panel').forEach(item => {
    item.classList.toggle('open', item.id === targetPanelId);
    item.style.display = item.id === targetPanelId ? 'block' : 'none';
  });

  if (targetPanelId === 'profileDataPanel') {
    loadProfile({ forceFill: !userIsEditingProfile });
  }
}

async function waitForAuthUser() {
  startAuthListener();

  if (getRealUser()) return getRealUser();

  const stored = await recoverUserFromStorage();
  if (stored) return stored;

  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      authUserCache = user || null;
      window.conectaCurrentUser = user || null;
      unsubscribe();
      resolve(user || recoverUserFromStorage());
    });

    setTimeout(async () => {
      unsubscribe();
      resolve(await recoverUserFromStorage());
    }, 5000);
  });
}

async function loadProfile({ forceFill = false } = {}) {
  const user = await waitForAuthUser();
  if (!user || profileSaving) return;

  const sameUserAlreadyLoaded = profileLoadedOnceForUid === user.uid;
  const shouldFillInputs = forceFill || !sameUserAlreadyLoaded;

  const stored = getProfileFromStorage();
  let data = { ...stored, correo: user.email, email: user.email, uid: user.uid };

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (snap.exists()) data = { ...data, ...snap.data(), uid: user.uid, correo: user.email, email: user.email };
  } catch (error) {
    console.warn('No se pudo cargar perfil desde Firestore:', error);
    setText('profileCleanMessage', 'No se pudo cargar el perfil desde la base de datos.');
  }

  const name = data.nombre || user.email?.split('@')[0] || 'Usuario';
  const role = data.rol || stored.rol || 'Usuario';

  setText('profileName', name);
  setText('profileRole', `${role} activo`);

  const avatar = document.querySelector('#profileScreen .avatar');
  if (avatar) avatar.textContent = name.slice(0, 1).toUpperCase();

  if (shouldFillInputs && !userIsEditingProfile) {
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

  const user = await waitForAuthUser();
  const message = document.getElementById('profileCleanMessage');

  if (!user?.uid) {
    if (message) message.textContent = 'No se detectó la sesión activa. Cierra sesión e inicia nuevamente.';
    return;
  }

  if (profileSaving) return;

  const saveButton = document.getElementById('profileCleanSaveBtn');
  const stored = getProfileFromStorage();

  const data = {
    nombre: document.getElementById('profileCleanName')?.value?.trim() || user.email.split('@')[0],
    numeroTelefono: document.getElementById('profileCleanPhone')?.value?.trim() || '',
    ocupacion: document.getElementById('profileCleanOccupation')?.value?.trim() || '',
    descripcionApoyo: document.getElementById('profileCleanSupport')?.value?.trim() || '',
    correo: user.email,
    email: user.email,
    uid: user.uid,
    rol: stored.rol || 'Usuario',
    estado: stored.estado || 'Activo',
    fechaActualizacion: serverTimestamp()
  };

  const validationError = validateProfileData(data);
  if (validationError) {
    if (message) message.textContent = validationError;
    return;
  }

  try {
    profileSaving = true;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Guardando...';
    }
    if (message) message.textContent = 'Guardando en la base de datos...';

    await setDoc(doc(db, 'usuarios', user.uid), data, { merge: true });

    saveProfileToStorage({
      ...data,
      fechaActualizacion: new Date().toISOString()
    });

    userIsEditingProfile = false;
    profileLoadedOnceForUid = null;

    await loadProfile({ forceFill: true });

    if (message) message.textContent = 'Datos guardados correctamente en Firestore.';
  } catch (error) {
    console.error('No se pudieron guardar los datos:', error);
    if (message) message.textContent = `No se pudo guardar: ${error.code || 'revisa conexión o reglas de Firestore'}`;
  } finally {
    profileSaving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar cambios';
    }
  }
}

export async function startProfileClean() {
  startAuthListener();
  ensureProfileDataPanel();
  await loadProfile();
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
      event.stopPropagation();
      setTimeout(() => openProfilePanel('profileDataPanel'), 50);
    }
  }

  if (event.target.closest('[data-go="profileScreen"]')) {
    setTimeout(startProfileClean, 250);
  }
});
