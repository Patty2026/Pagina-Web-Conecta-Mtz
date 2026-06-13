import { auth, db } from './firebase-service.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

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

function ensureProfileForm() {
  const profileScreen = document.getElementById('profileScreen');
  if (!profileScreen || document.getElementById('profileCleanForm')) return;

  const container = document.createElement('section');
  container.className = 'profile-editor-card';
  container.innerHTML = `
    <div class="section-title">
      <h3>Editar perfil</h3>
      <small>Actualiza tus datos de contacto y apoyo.</small>
    </div>

    <form id="profileCleanForm" class="app-form">
      <label>Nombre</label>
      <input id="profileCleanName" type="text" placeholder="Tu nombre" />

      <label>Num. de teléfono</label>
      <input id="profileCleanPhone" type="tel" placeholder="Ej. 232 000 0000" />

      <label>Ocupación</label>
      <input id="profileCleanOccupation" type="text" placeholder="Ej. Electricista, plomero, docente" />

      <label>Descripción del Apoyo</label>
      <textarea id="profileCleanSupport" placeholder="Describe cómo puedes apoyar o qué servicio/oficio brindas."></textarea>

      <button class="main-btn" type="submit">Guardar cambios</button>
      <small id="profileCleanMessage"></small>
    </form>
  `;

  const menu = profileScreen.querySelector('.menu-list');
  profileScreen.insertBefore(container, menu || profileScreen.querySelector('.bottom-nav'));
  document.getElementById('profileCleanForm')?.addEventListener('submit', saveProfile);
}

async function loadProfile() {
  const user = auth.currentUser;
  if (!user) return;

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

  const nameInput = document.getElementById('profileCleanName');
  const phoneInput = document.getElementById('profileCleanPhone');
  const occupationInput = document.getElementById('profileCleanOccupation');
  const supportInput = document.getElementById('profileCleanSupport');

  if (nameInput) nameInput.value = data.nombre || '';
  if (phoneInput) phoneInput.value = data.numeroTelefono || data.telefono || '';
  if (occupationInput) occupationInput.value = data.ocupacion || '';
  if (supportInput) supportInput.value = data.descripcionApoyo || '';

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
  await loadProfile();
  setText('profileCleanMessage', 'Perfil actualizado correctamente.');
}

export function startProfileClean() {
  ensureProfileForm();
  loadProfile();
}

window.startProfileClean = startProfileClean;
window.addEventListener('load', () => setTimeout(startProfileClean, 900));
document.addEventListener('click', event => {
  if (event.target.closest('[data-go="profileScreen"]')) setTimeout(startProfileClean, 250);
});
