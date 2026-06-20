/* Conecta Martínez - estructura uniforme de usuarios 2026 */
import firebaseConfig from './firebase-config.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
const BASIC_ADMIN_EMAIL = 'adminb@gmail.com';
const STRUCTURE_VERSION = 'conecta-mtz-users-2026-v1';

let alreadyNormalizedAll = false;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function adminDocId(email) {
  return normalizeEmail(email).replace(/[^a-z0-9]/g, '_');
}

function resolveRole(email, existingRole = 'Ciudadano') {
  const cleanEmail = normalizeEmail(email);
  const rawRole = cleanText(existingRole || 'Ciudadano');
  const lowerRole = rawRole.toLowerCase();

  if (cleanEmail === SUPERADMIN_EMAIL) return 'Superadmin';
  if (cleanEmail === BASIC_ADMIN_EMAIL) return 'Administrador básico';
  if (lowerRole.includes('superadmin') || lowerRole.includes('administrador principal')) return 'Superadmin';
  if (lowerRole.includes('administrador')) return 'Administrador básico';
  if (lowerRole.includes('apoyo') || lowerRole.includes('comunitario')) return 'Apoyo comunitario';
  return 'Ciudadano';
}

function roleKey(role) {
  const lower = cleanText(role).toLowerCase();
  if (lower.includes('superadmin')) return 'superadmin';
  if (lower.includes('administrador')) return 'administrador_basico';
  if (lower.includes('apoyo')) return 'apoyo_comunitario';
  return 'ciudadano';
}

function permissionsForRole(role) {
  const key = roleKey(role);
  const base = {
    editarPerfil: true,
    comentarIncidencias: true,
    verMapa: true,
    verIncidenciasPublicas: true,
    reportarIncidencias: key === 'ciudadano' || key === 'apoyo_comunitario',
    adjuntarEvidencia: key === 'ciudadano' || key === 'apoyo_comunitario',
    usarGPS: true,
    cambiarEstadoIncidencias: false,
    asignarDepartamentos: false,
    verTodosUsuarios: false,
    gestionarUsuarios: false,
    gestionarAdministradores: false,
    verHistorial: false,
    exportarReportes: false,
    verEstadisticasGlobales: false
  };

  if (key === 'apoyo_comunitario') {
    return {
      ...base,
      reportarIncidencias: true,
      cambiarEstadoIncidencias: true,
      asignarDepartamentos: true,
      exportarReportes: true,
      verEstadisticasGlobales: true
    };
  }

  if (key === 'administrador_basico') {
    return {
      ...base,
      reportarIncidencias: false,
      adjuntarEvidencia: false,
      cambiarEstadoIncidencias: true,
      asignarDepartamentos: true,
      verTodosUsuarios: true,
      gestionarUsuarios: true,
      exportarReportes: true,
      verEstadisticasGlobales: true
    };
  }

  if (key === 'superadmin') {
    return {
      ...base,
      reportarIncidencias: false,
      adjuntarEvidencia: false,
      cambiarEstadoIncidencias: true,
      asignarDepartamentos: true,
      verTodosUsuarios: true,
      gestionarUsuarios: true,
      gestionarAdministradores: true,
      verHistorial: true,
      exportarReportes: true,
      verEstadisticasGlobales: true
    };
  }

  return base;
}

function panelForRole(role) {
  const key = roleKey(role);
  if (key === 'superadmin') return ['panel', 'mapa', 'reportes', 'perfil', 'usuarios', 'administradores', 'historial'];
  if (key === 'administrador_basico') return ['panel', 'mapa', 'reportes', 'perfil', 'usuarios'];
  if (key === 'apoyo_comunitario') return ['panel', 'mapa', 'reportes', 'perfil'];
  return ['panel', 'mapa', 'reportes', 'perfil'];
}

function buildUserStructure(userLike, existing = {}, selectedRole = 'Ciudadano') {
  const uid = userLike.uid || existing.uid || '';
  const email = normalizeEmail(userLike.email || existing.correo || existing.email);
  const role = resolveRole(email, existing.rol || selectedRole);
  const key = roleKey(role);
  const nombre = cleanText(
    existing.nombre || userLike.displayName || existing.perfil?.nombre || email.split('@')[0],
    'Usuario'
  );
  const telefono = cleanText(existing.numeroTelefono || existing.telefono || existing.perfil?.telefono);
  const ocupacion = cleanText(existing.ocupacion || existing.perfil?.ocupacion);
  const descripcionApoyo = cleanText(existing.descripcionApoyo || existing.perfil?.descripcionApoyo);
  const permisos = permissionsForRole(role);
  const fechaRegistro = existing.fechaRegistro || existing.metadata?.fechaRegistro || serverTimestamp();

  return {
    uid,
    correo: email,
    email,
    nombre,
    rol: role,
    tipoUsuario: key,
    estado: existing.estado || 'activo',
    telefono,
    numeroTelefono: telefono,
    ocupacion,
    descripcionApoyo,

    perfil: {
      nombre,
      correo: email,
      telefono,
      ocupacion,
      descripcionApoyo,
      avatarInicial: nombre.charAt(0).toUpperCase() || 'U',
      municipio: existing.perfil?.municipio || 'Martínez de la Torre',
      estadoMexico: existing.perfil?.estadoMexico || 'Veracruz'
    },

    contacto: {
      correo: email,
      telefono,
      telefonoAlternativo: existing.contacto?.telefonoAlternativo || ''
    },

    permisos,

    navegacion: {
      menuPrincipal: panelForRole(role),
      panelInicial: 'panel'
    },

    preferencias: {
      tema: existing.preferencias?.tema || 'oscuro',
      idioma: existing.preferencias?.idioma || 'es-MX',
      notificaciones: existing.preferencias?.notificaciones ?? true,
      mapaPreferido: existing.preferencias?.mapaPreferido || 'google_maps'
    },

    estadisticasUsuario: {
      incidenciasReportadas: existing.estadisticasUsuario?.incidenciasReportadas ?? existing.estadisticas?.incidenciasReportadas ?? 0,
      incidenciasAtendidas: existing.estadisticasUsuario?.incidenciasAtendidas ?? existing.estadisticas?.incidenciasAtendidas ?? 0,
      comentariosRealizados: existing.estadisticasUsuario?.comentariosRealizados ?? 0,
      ultimaActividad: serverTimestamp()
    },

    asignacion: {
      departamento: existing.asignacion?.departamento || existing.departamentoAsignado || '',
      zona: existing.asignacion?.zona || existing.zonaAsignada || '',
      areaResponsable: existing.asignacion?.areaResponsable || existing.areaResponsable || ''
    },

    seguridad: {
      proveedor: existing.seguridad?.proveedor || 'firebase-auth',
      emailVerificado: Boolean(userLike.emailVerified || existing.seguridad?.emailVerificado),
      ultimoAcceso: serverTimestamp(),
      accesoActivo: true
    },

    metadata: {
      versionEstructura: STRUCTURE_VERSION,
      fechaRegistro,
      fechaActualizacion: serverTimestamp(),
      ultimaConexion: serverTimestamp(),
      normalizadoPor: 'user-structure.js'
    },

    fechaRegistro,
    fechaActualizacion: serverTimestamp(),
    ultimaConexion: serverTimestamp()
  };
}

function buildAdminStructure(userLike, profile) {
  const email = normalizeEmail(profile.correo || userLike.email);
  const role = resolveRole(email, profile.rol);
  const key = roleKey(role);

  return {
    uid: profile.uid || userLike.uid,
    correo: email,
    nombre: profile.nombre || email.split('@')[0],
    telefono: profile.numeroTelefono || profile.telefono || '',
    rol: role,
    nivel: key === 'superadmin' ? 'principal' : 'basico',
    estado: profile.estado || 'activo',
    areaResponsable: profile.asignacion?.areaResponsable || profile.asignacion?.departamento || '',
    permisos: permissionsForRole(role),
    ultimoAcceso: serverTimestamp(),
    fechaActualizacion: serverTimestamp(),
    metadata: {
      versionEstructura: STRUCTURE_VERSION,
      origen: 'usuarios/' + (profile.uid || userLike.uid)
    }
  };
}

async function ensureCurrentUserStructure(user) {
  const userRef = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(userRef).catch(() => null);
  const existing = snap?.exists() ? snap.data() : {};
  const profile = buildUserStructure(user, existing, existing.rol || 'Ciudadano');

  await setDoc(userRef, profile, { merge: true });

  if (['superadmin', 'administrador_basico'].includes(profile.tipoUsuario)) {
    await setDoc(doc(db, 'administradores', adminDocId(profile.correo)), buildAdminStructure(user, profile), { merge: true });
  }

  return profile;
}

function userNeedsNormalization(data = {}) {
  return data.metadata?.versionEstructura !== STRUCTURE_VERSION
    || !data.perfil
    || !data.permisos
    || !data.navegacion
    || !data.seguridad
    || !data.estadisticasUsuario;
}

async function normalizeAllUsersAsSuperadmin(currentUser) {
  if (alreadyNormalizedAll || normalizeEmail(currentUser.email) !== SUPERADMIN_EMAIL) return;
  alreadyNormalizedAll = true;

  const snapshot = await getDocs(collection(db, 'usuarios')).catch((error) => {
    console.warn('No se pudieron normalizar usuarios:', error?.code || error);
    return null;
  });

  if (!snapshot) return;

  const tasks = [];
  snapshot.forEach((item) => {
    const data = item.data();
    if (!userNeedsNormalization(data)) return;
    const userLike = {
      uid: data.uid || item.id,
      email: data.correo || data.email,
      displayName: data.nombre,
      emailVerified: data.seguridad?.emailVerificado || false
    };
    const profile = buildUserStructure(userLike, data, data.rol || 'Ciudadano');
    tasks.push(setDoc(doc(db, 'usuarios', item.id), profile, { merge: true }));

    if (['superadmin', 'administrador_basico'].includes(profile.tipoUsuario)) {
      tasks.push(setDoc(doc(db, 'administradores', adminDocId(profile.correo)), buildAdminStructure(userLike, profile), { merge: true }));
    }
  });

  if (tasks.length) {
    await Promise.allSettled(tasks);
    console.info(`Estructura de usuarios normalizada: ${tasks.length} actualizaciones.`);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await ensureCurrentUserStructure(user);
    await normalizeAllUsersAsSuperadmin(user);
  } catch (error) {
    console.error('No se pudo asegurar la estructura del usuario:', error?.code || error);
  }
});

window.ConectaUserStructure = {
  version: STRUCTURE_VERSION,
  buildUserStructure,
  permissionsForRole
};
