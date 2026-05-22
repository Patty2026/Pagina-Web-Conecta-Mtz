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
  orderBy,
  serverTimestamp,
  updateDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export async function registrarUsuario(correo, password) {
  return createUserWithEmailAndPassword(auth, correo, password);
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

export async function subirImagenIncidencia(file, userId) {
  if (!file) return null;
  const path = `incidencias/${userId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
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
    where('idCiudadano', '==', userId),
    orderBy('fechaRegistro', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
}

export async function obtenerTodasLasIncidencias() {
  const q = query(collection(db, 'incidencias'), orderBy('fechaRegistro', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
}

export async function actualizarEstadoIncidencia(idIncidencia, estado, comentario = '') {
  const incidenciaRef = doc(db, 'incidencias', idIncidencia);
  return updateDoc(incidenciaRef, {
    estado,
    ultimoComentario: comentario,
    fechaActualizacion: serverTimestamp()
  });
}

export { auth, db, storage };
