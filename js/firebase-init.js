// firebase-init.js
// Punto de entrada ÚNICO para el resto de la web (app.js, calendario.js, horario-cuenta.js y las notas
// importan este archivo). Aquí no hay lógica: solo reexporta y activa los módulos.
//
//   firebase-core.js   conexión, sesión, perfiles, roles, orden del árbol (sin DOM)
//   modal.js           comportamiento común de los modales
//   acceso-ui.js       modal de acceso, «Mi cuenta» y gestión de usuarios
//   apuntes.js         subida de archivos (Cloudinary) y panel de apuntes
//
// Al subir la versión de cualquiera de ellos, sube también el «?v=» en estos imports.

// Lista explícita: es la API pública de siempre. Lo demás de firebase-core.js es interno.
export {
  AUTHORIZED_UID, auth, isAuthorized, watchAuth, nombreVisible, correoVisible,
  login, register, logout, loadOrder, saveOrderForPath,
  ROL, getRol, guardarNombrePerfil, puedeGestionarCalendarioGlobal, listarUsuarios, fijarAdminInferior,
  cargarFavoritosNube, guardarFavoritosNube,
} from "./firebase-core.js?v=c4e3345d";
export { crearControlModal } from "./modal.js?v=f80c8666";
export { crearPanelSubida } from "./apuntes.js?v=9d6204bb";
import "./acceso-ui.js?v=615a42e9"; // solo efectos: pinta y activa la interfaz de cuenta
