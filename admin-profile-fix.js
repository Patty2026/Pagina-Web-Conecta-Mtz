import { auth, db } from './firebase-service.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const ADMIN_EMAILS = ['adminp@gmail.com', 'adminb@gmail.com'];
let restoring = false;

function normalize(value = '') {
  return String(value).trim().toLowerCase();
}

function safeEmailId(email = '') {
  return normalize(email).replaceAll('.', '_');
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function saveStoredProfile(data = {}) {
  const stored = getStoredProfile();
  localStorage.setItem('conectaPerfil', JSON.stringify({ ...stored, ...data }));
}

function isAdminEmail(email = '') {
  return ADMIN_EMAILS.includes(normalize(email));
}

function getAdminRole(email = '') {
  const normalized = normalize(email);
  if (normalized === 'adminp@gmail.com') return 'Superadmin';
  if (normalized === 'adminb@gmail.com') return 'Administrador';
  return getStoredProfile().rol || 'Administrador';
}

function getCurrentUserData() {
  const stored = getStoredProfile();
  const user = auth.currentUser || window.conectaCurrentUser || null;

  const email = normalize(user?.email || stored.correo || stored.email || '');
  const uid = user?.uid || stored.uid || '';

  return { user, email, uid, stored };
}

function isValidDisplayName(name = '') {
  const value = String(name).trim();
  if (value.length < 2 || value.length > 60) return false;
  if (/adminp|adminb|gmail\.com/i.test(value)) return false;
  if (/<\s*script|javascript:|onerror\s*=|onclick\s*=/i.test(value)) return false;
  return true;
}

async function getPreferredName(uid, storedName, email) {
  let firestoreName = '';

  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'usuarios', uid));
      firestoreName = snap.exists() ? String(snap.data().nombre || '').trim() : '';
    } catch (error) {
      console.warn('No se pudo revisar el nombre en Firestore:', error);
    }
  }

  if (isValidDisplayName(storedName)) return storedName.trim();
  if (isValidDisplayName(firestoreName)) return firestoreName.trim();

  return email.split('@')[0] || 'Administrador';
}

export async function restoreAdminProfileName() {
  if (restoring) return;

  const { email, uid, stored } = getCurrentUserData();
  if (!uid || !email || !isAdminEmail(email)) return;

  try {
    restoring = true;

    const preferredName = await getPreferredName(uid, stored.nombre, email);
    const role = getAdminRole(email);

    await setDoc(doc(db, 'usuarios', uid), {
      uid,
      correo: email,
      email,
      nombre: preferredName,
      rol: role,
      estado: stored.estado || 'Activo',
      accesoAdministrativo: true,
      fechaActualizacion: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'administradores', safeEmailId(email)), {
      correo: email,
      nombre: preferredName,
      rol: role,
      estado: 'Activo',
      fechaActualizacion: serverTimestamp()
    }, { merge: true });

    saveStoredProfile({
      uid,
      correo: email,
      email,
      nombre: preferredName,
      rol: role,
      estado: stored.estado || 'Activo'
    });

    const profileName = document.getElementById('profileName');
    const profileRole = document.getElementById('profileRole');
    const avatar = document.querySelector('#profileScreen .avatar');

    if (profileName) profileName.textContent = preferredName;
    if (profileRole) profileRole.textContent = `${role} activo`;
    if (avatar) avatar.textContent = preferredName.slice(0, 1).toUpperCase();
  } catch (error) {
    console.warn('No se pudo conservar el nombre administrativo:', error);
  } finally {
    restoring = false;
  }
}

function patchAdminCleanStart() {
  const originalStart = window.startAdminClean;
  if (!originalStart || originalStart.__nameFixPatched) return;

  window.startAdminClean = function patchedStartAdminClean(...args) {
    const result = originalStart.apply(this, args);
    setTimeout(restoreAdminProfileName, 300);
    setTimeout(restoreAdminProfileName, 1200);
    return result;
  };

  window.startAdminClean.__nameFixPatched = true;
}

window.restoreAdminProfileName = restoreAdminProfileName;

window.addEventListener('load', () => {
  setTimeout(() => {
    patchAdminCleanStart();
    restoreAdminProfileName();
  }, 1600);
});

document.addEventListener('click', event => {
  if (event.target.closest('#profileCleanSaveBtn, [data-go="profileScreen"], [data-go="adminScreen"]')) {
    setTimeout(restoreAdminProfileName, 900);
    setTimeout(restoreAdminProfileName, 2200);
  }
});

setInterval(() => {
  patchAdminCleanStart();
  restoreAdminProfileName();
}, 6000);
