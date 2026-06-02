import firebaseConfig from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  setDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function fechaMillis(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (valor.seconds) return valor.seconds * 1000;
  return 0;
}

function ordenarPorFechaDesc(a, b) {
  return fechaMillis(b.fechaRegistro) - fechaMillis(a.fechaRegistro);
}

export async function registrarUsuario(correo, password, rol = 'Ciudadano') {
  const credencial = await createUserWithEmailAndPassword(auth, correo, password);
  await crearPerfilUsuario(credencial.user.uid, {
    correo,
    rol,
    nombre: correo.split('@')[0],
    estado: 'Activo'
  });
  return credencial;
}

export async function iniciarSesion(correo, password) {
  return signInWithEmailAndPassword(auth, correo, password);
}

export async function cerrarSesion() {
  return signOut(auth);
}

export function escucharSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function crearPerfilUsuario(userId, data) {
  const usuarioRef = doc(db, 'usuarios', userId);
  return setDoc(usuarioRef, {
    ...data,
    uid: userId,
    fechaRegistro: serverTimestamp(),
    fechaActualizacion: serverTimestamp()
  }, { merge: true });
}

export async function obtenerPerfilUsuario(userId) {
  const usuarioRef = doc(db, 'usuarios', userId);
  const snapshot = await getDoc(usuarioRef);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function crearIncidencia(data) {
  return addDoc(collection(db, 'incidencias'), {
    ...data,
    estado: data.estado || 'Pendiente',
    fechaRegistro: serverTimestamp(),
    fechaActualizacion: serverTimestamp()
  });
}

export async function obtenerIncidenciasPorUsuario(userId) {
  const q = query(
    collection(db, 'incidencias'),
    where('idCiudadano', '==', userId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(documento => ({ id: documento.id, ...documento.data() }))
    .sort(ordenarPorFechaDesc);
}

export async function obtenerTodasLasIncidencias() {
  const snapshot = await getDocs(collection(db, 'incidencias'));
  return snapshot.docs
    .map(documento => ({ id: documento.id, ...documento.data() }))
    .sort(ordenarPorFechaDesc);
}

export async function obtenerIncidenciasAsignadas(nombreInstitucion = 'Apoyo comunitario') {
  const q = query(
    collection(db, 'incidencias'),
    where('asignadoA', '==', nombreInstitucion)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(documento => ({ id: documento.id, ...documento.data() }))
    .sort(ordenarPorFechaDesc);
}

export async function actualizarEstadoIncidencia(idIncidencia, estado, comentario = '') {
  const incidenciaRef = doc(db, 'incidencias', idIncidencia);
  return updateDoc(incidenciaRef, {
    estado,
    ultimoComentario: comentario,
    fechaActualizacion: serverTimestamp()
  });
}

export async function actualizarAtencionIncidencia(idIncidencia, data = {}) {
  const incidenciaRef = doc(db, 'incidencias', idIncidencia);
  return updateDoc(incidenciaRef, {
    ...data,
    fechaActualizacion: serverTimestamp()
  });
}

export async function subirImagenIncidencia(file) {
  return file ? file.name : null;
}

export { auth, db };
