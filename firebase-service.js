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

function fechaMillis(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (valor.seconds) return valor.seconds * 1000;
  return 0;
}

function ordenarPorFechaDesc(a, b) {
  return fechaMillis(b.fechaRegistro) - fechaMillis(a.fechaRegistro);
}

function limpiarNombreArchivo(nombre = 'evidencia.jpg') {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();
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

export async function crearIncidenciaConEvidencia(data, file) {
  const docRef = await crearIncidencia({
    ...data,
    evidenciaNombre: file ? file.name : data.evidenciaNombre || 'Sin archivo',
    evidenciaUrl: null,
    evidenciaRuta: null
  });

  if (file) {
    const evidencia = await subirImagenIncidencia(file, docRef.id, 'ciudadano');
    await actualizarAtencionIncidencia(docRef.id, {
      evidenciaNombre: evidencia.nombre,
      evidenciaUrl: evidencia.url,
      evidenciaRuta: evidencia.ruta,
      evidenciaTipo: evidencia.tipo,
      evidenciaTamano: evidencia.tamano
    });
  }

  return docRef;
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

export async function subirImagenIncidencia(file, idIncidencia = 'sin-id', carpeta = 'general') {
  if (!file) return null;

  const userId = auth.currentUser?.uid || 'anonimo';
  const timestamp = Date.now();
  const nombreSeguro = limpiarNombreArchivo(file.name);
  const ruta = `evidencias/${idIncidencia}/${carpeta}/${userId}_${timestamp}_${nombreSeguro}`;
  const storageRef = ref(storage, ruta);

  const uploadResult = await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg',
    customMetadata: {
      idIncidencia,
      carpeta,
      userId
    }
  });

  const url = await getDownloadURL(uploadResult.ref);

  return {
    nombre: file.name,
    ruta,
    url,
    tipo: file.type || 'image/jpeg',
    tamano: file.size || 0
  };
}

export async function subirEvidenciaAtencion(idIncidencia, file, extraData = {}) {
  const evidencia = await subirImagenIncidencia(file, idIncidencia, 'atencion');

  await actualizarAtencionIncidencia(idIncidencia, {
    evidenciaAtencionNombre: evidencia.nombre,
    evidenciaAtencionRuta: evidencia.ruta,
    evidenciaAtencionUrl: evidencia.url,
    evidenciaAtencionTipo: evidencia.tipo,
    evidenciaAtencionTamano: evidencia.tamano,
    evidenciaAtencionFecha: new Date().toISOString(),
    evidenciaAtencionValidada: true,
    ...extraData
  });

  return evidencia;
}

export { auth, db, storage };
