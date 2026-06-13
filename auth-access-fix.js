import { cerrarSesion } from './firebase-service.js';

// Puente seguro para scripts no modulares como admin-role.js.
// Permite que el cierre de sesión administrativo también cierre Firebase Auth.
window.firebaseSignOut = cerrarSesion;

window.clearConectaAccessCache = function clearConectaAccessCache() {
  localStorage.removeItem('conectaPerfil');
  sessionStorage.removeItem('conectaPerfil');
};
