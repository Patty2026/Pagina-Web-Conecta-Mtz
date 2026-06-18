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
  getDoc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function fechaMillis(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (typeof valor.toDate === 'function') return valor.toDate().getTime();
  if (valor.seconds) return valor.seconds * 1000;
  if (typeof valor === 'string') return Date.parse(valor) || 0;
  return 0;
}

function ordenarPorFechaDesc(a, b) {
  return fechaMillis(b.fechaRegistro || b.fecha || b.createdAt || b.fechaActualizacion)
    - fechaMillis(a.fechaRegistro || a.fecha || a.createdAt || a.fechaActualizacion);
}

async function obtenerSiguienteConsecutivo(nombreContador, prefijo) {
  const contadorRef = doc(db, 'contadores', nombreContador);

  const nuevoNumero = await runTransaction(db, async transaction => {
    const contadorSnap = await transaction.get(contadorRef);
    const ultimoId = contadorSnap.exists() ? Number(contadorSnap.data().ultimoId || 0) : 0;
    const siguienteId = ultimoId + 1;

    transaction.set(contadorRef, {
      ultimoId: siguienteId,
      fechaActualizacion: serverTimestamp()
    }, { merge: true });

    return siguienteId;
  });

  const numeroFormateado = String(nuevoNumero).padStart(4, '0');

  return {
    idIncremental: nuevoNumero,
    codigo: `${prefijo}-${numeroFormateado}`
  };
}

function limpiarNombreArchivo(nombre = 'evidencia.jpg') {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cargarImagen(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function convertirImagenABase64(file, maxWidth = 720, quality = 0.65) {
  if (!file) return null;

  const dataUrl = await leerArchivo(file);
  const img = await cargarImagen(dataUrl);

  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const base64 = canvas.toDataURL('image/jpeg', quality);

  return {
    nombre: file.name,
    nombreSeguro: limpiarNombreArchivo(file.name),
    base64,
    tipo: 'image/jpeg',
    tamanoOriginal: file.size || 0,
    tamanoBase64: base64.length,
    ancho: width,
    alto: height,
    metodo: 'firestore-base64',
    fecha: new Date().toISOString()
  };
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
  const perfilActual = await getDoc(usuarioRef);

  const consecutivo = perfilActual.exists() && perfilActual.data().codigoUsuario
    ? {
        idIncremental: perfilActual.data().idIncremental,
        codigo: perfilActual.data().codigoUsuario
      }
    : await obtenerSiguienteConsecutivo('usuarios', 'USR');

  return setDoc(usuarioRef, {
    ...data,
    uid: userId,
    idIncremental: consecutivo.idIncremental,
    codigoUsuario: consecutivo.codigo,
    fechaRegistro: perfilActual.exists() && perfilActual.data().fechaRegistro
      ? perfilActual.data().fechaRegistro
      : serverTimestamp(),
    fechaActualizacion: serverTimestamp()
  }, { merge: true });
}

export async function obtenerPerfilUsuario(userId) {
  const usuarioRef = doc(db, 'usuarios', userId);
  const snapshot = await getDoc(usuarioRef);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function crearIncidencia(data) {
  const year = new Date().getFullYear();
  const consecutivo = await obtenerSiguienteConsecutivo('incidencias', `INC-${year}`);

  return addDoc(collection(db, 'incidencias'), {
    ...data,
    idIncremental: consecutivo.idIncremental,
    folio: consecutivo.codigo,
    estado: data.estado || 'Pendiente',
    fechaRegistro: serverTimestamp(),
    fechaActualizacion: serverTimestamp()
  });
}

export async function crearIncidenciaConEvidencia(data, file) {
  const evidencia = file ? await convertirImagenABase64(file) : null;

  return crearIncidencia({
    ...data,
    evidenciaNombre: evidencia ? evidencia.nombre : data.evidenciaNombre || 'Sin archivo',
    evidenciaBase64: evidencia?.base64 || null,
    evidenciaTipo: evidencia?.tipo || null,
    evidenciaTamano: evidencia?.tamanoBase64 || 0,
    evidenciaMetodo: evidencia?.metodo || 'sin-evidencia',
    evidenciaMeta: evidencia ? {
      ancho: evidencia.ancho,
      alto: evidencia.alto,
      tamanoOriginal: evidencia.tamanoOriginal,
      tamanoBase64: evidencia.tamanoBase64,
      fecha: evidencia.fecha
    } : null
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

export { auth, db };