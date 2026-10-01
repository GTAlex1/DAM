// firebase-core.js
// Núcleo de Firebase: conexión, sesión (login/registro/logout), orden del árbol, perfiles y roles.
// No toca el DOM. Lo usan acceso-ui.js, apuntes.js y, a través de firebase-init.js, el resto de la web.
//
// ANTES DE PUBLICAR (resumen; la guía completa irá en el README):
//  - AUTHORIZED_UID debe ser el UID del propietario (Firebase Console → Authentication → Users).
//  - Authentication → Sign-in method: activar «Email/Password».
//  - Publicar rules.firestore en Firestore → Rules.
//
// PERFILES Y ROLES (sección «CUENTA»):
//  - Cada usuario tiene usuarios/{uid} {uid, nombre, email, esAdmin, ...}, que se crea/actualiza al
//    registrarse y en cada inicio de sesión. Es lo que lista el panel de administración (el SDK web
//    no puede listar Firebase Auth). `esAdmin` es un reflejo de solo lectura de roles/{uid}.
//  - El «Admin inferior» es un documento roles/{uid} {adminInferior: true} que solo el Admin Principal
//    puede crear o borrar. Su único efecto es publicar/editar exámenes y tareas GLOBALES del calendario
//    (ver rules.firestore). calendario.js usa puedeGestionarCalendarioGlobal(user).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOU5RrEN0LA_cvnOXexBUJAxC8Md2NvE8",
  authDomain: "damm-29df1.firebaseapp.com",
  projectId: "damm-29df1",
  storageBucket: "damm-29df1.firebasestorage.app",
  messagingSenderId: "44798070440",
  appId: "1:44798070440:web:e6a1ff169820c4a9ff3c9d",
};

// 👇 CAMBIA ESTO por tu UID real (ver instrucciones arriba).
export const AUTHORIZED_UID = "KxbZfGljpRdTIQlnOPDqjUs61v73";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const ORDER_DOC = doc(db, "site", "order");

export function isAuthorized(user) {
  return !!user && user.uid === AUTHORIZED_UID;
}

export function watchAuth(callback) {
  onAuthStateChanged(auth, callback);
}

/* ---------- Acceso: «usuario o correo» ---------- */
// Firebase Auth exige un email. Los alumnos que se registraron con un simple
// nombre de usuario (Entornos de Desarrollo, horario) tienen internamente un
// correo ficticio <usuario>@alumnos.dam-notes.local que nunca se muestra.
// Si lo escrito lleva «@» se usa tal cual (correo real, p. ej. el admin); si no,
// se convierte igual que antes, para no romper las cuentas ya creadas.
const DOMINIO_USUARIO = "alumnos.dam-notes.local";

function identificadorAEmail(bruto) {
  const v = (bruto || "").trim();
  if (v.includes("@")) return v.toLowerCase();
  const u = v.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return u ? `${u}@${DOMINIO_USUARIO}` : null;
}

/** Nombre que se enseña en el header: displayName, o el correo real, o el usuario. */
export function nombreVisible(user) {
  if (!user) return "";
  if (user.displayName) return user.displayName;
  const email = user.email || "";
  return email.endsWith(`@${DOMINIO_USUARIO}`) ? email.split("@")[0] : email;
}

export function mensajeErrorAuth(code) {
  const m = {
    "auth/invalid-email": "Usuario o correo no válido (un usuario solo admite letras, números, puntos, guiones y guiones bajos).",
    "auth/user-not-found": "No existe ninguna cuenta con esos datos.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Usuario o contraseña incorrectos.",
    "auth/email-already-in-use": "Ese usuario o correo ya tiene cuenta. Prueba a iniciar sesión.",
    "auth/weak-password": "La contraseña necesita al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a probar.",
    "auth/network-request-failed": "Sin conexión. Revisa tu red e inténtalo de nuevo.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/operation-not-allowed": "El acceso con correo y contraseña no está activado en Firebase.",
  };
  return m[code] || "Algo ha fallado. Inténtalo de nuevo.";
}

function errorAuth(code) {
  return Object.assign(new Error(code), { code });
}

/** Inicia sesión. `identificador` es un correo o un nombre de usuario. */
export async function login(identificador, password) {
  const email = identificadorAEmail(identificador);
  if (!email) throw errorAuth("auth/invalid-email");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // Crea/actualiza usuarios/{uid}: así las cuentas anteriores a esta versión quedan
  // registradas en cuanto vuelven a entrar. Un fallo aquí no debe impedir el acceso.
  try {
    await sincronizarPerfil(cred.user);
  } catch (e) {
    console.warn("No se pudo sincronizar el perfil en Firestore:", e);
  }
}

/** Crea una cuenta (abierta a cualquiera) y deja la sesión iniciada. */
let registrando = false; // evita que el observador de sesión cree el perfil antes de tener el nombre
export async function register(identificador, password) {
  const bruto = (identificador || "").trim();
  const email = identificadorAEmail(bruto);
  if (!email) throw errorAuth("auth/invalid-email");
  registrando = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Con nombre de usuario (sin «@») se guarda tal cual lo escribió el alumno.
    if (!bruto.includes("@")) {
      try {
        await updateProfile(cred.user, { displayName: bruto });
      } catch (e) {
        console.warn("No se pudo guardar el nombre de usuario:", e);
      }
    }
    try {
      await sincronizarPerfil(cred.user);
    } catch (e) {
      console.warn("No se pudo crear el perfil en Firestore:", e);
    }
    return cred.user;
  } finally {
    registrando = false;
  }
}

export async function logout() {
  await signOut(auth);
}

/** Devuelve el mapa { pathKey: [nombres en orden] } guardado, o {} si no hay nada. */
export async function loadOrder() {
  try {
    const snap = await getDoc(ORDER_DOC);
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.warn("No se pudo leer el orden guardado:", e);
    return {};
  }
}

/** Fusiona (merge) el nuevo orden de una carpeta concreta con el documento existente. */
export async function saveOrderForPath(pathKey, orderedNames) {
  await setDoc(ORDER_DOC, { [pathKey]: orderedNames }, { merge: true });
}


/* ==========================================================================
   CUENTA: perfil (Firestore) y roles
   - usuarios/{uid}  → { uid, nombre, email, esAdmin, creado, actualizado }. Lo escribe cada
                       usuario sobre SU documento; lo lee él y el Admin Principal (que además
                       puede actualizar `esAdmin` en cualquiera). `esAdmin` refleja roles/{uid}.
   - roles/{uid}     → { adminInferior: true }. Solo lo escribe el Admin Principal.
   ========================================================================== */
const USUARIOS_COLECCION = "usuarios";
const ROLES_COLECCION = "roles";
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 60;

export const ROL = Object.freeze({
  PRINCIPAL: "principal",
  INFERIOR: "admin-inferior",
  USUARIO: "usuario",
});
export const ETIQUETA_ROL = {
  [ROL.PRINCIPAL]: "Admin Principal",
  [ROL.INFERIOR]: "Admin inferior",
  [ROL.USUARIO]: "Estudiante",
};

const cacheRol = new Map(); // uid -> ROL.* (se vacía al cerrar sesión)

/** Correo tal como se enseña: las cuentas «por usuario» no tienen correo real. */
export function correoVisible(user) {
  return formatearCorreo(user?.email || "");
}
export function formatearCorreo(email) {
  if (!email) return "—";
  return email.endsWith(`@${DOMINIO_USUARIO}`)
    ? `${email.split("@")[0]} (cuenta por usuario, sin correo)`
    : email;
}

const limpiarNombre = (n) => (n || "").replace(/\s+/g, " ").trim();

/** ¿Es admin (principal o inferior)? Valor real, calculado desde roles/{uid}. */
async function calcularEsAdmin(user) {
  return (await getRol(user, { forzar: true })) !== ROL.USUARIO;
}

// Evita carreras: login() y onAuthStateChanged disparan la sincronización casi a la vez;
// si las dos vieran «no existe» y crearan, la segunda sería un update inválido.
const perfilesEnCurso = new Map(); // uid -> Promise

/**
 * Crea o actualiza usuarios/{uid} con { uid, nombre, email, esAdmin }.
 * - Si no existe: lo crea (con `creado`).
 * - Si existe: solo escribe lo que falta o ha cambiado (uid/email/esAdmin de cuentas
 *   antiguas, nombre vacío). No pisa un nombre ya guardado.
 */
function sincronizarPerfil(user, nombre) {
  if (!user) return Promise.resolve();
  const enCurso = perfilesEnCurso.get(user.uid);
  if (enCurso) return enCurso;
  const p = escribirPerfil(user, nombre).finally(() => perfilesEnCurso.delete(user.uid));
  perfilesEnCurso.set(user.uid, p);
  return p;
}

async function escribirPerfil(user, nombre) {
  const ref = doc(db, USUARIOS_COLECCION, user.uid);
  const email = (user.email || "").toLowerCase();
  const esAdmin = await calcularEsAdmin(user);
  const nombreLimpio =
    limpiarNombre(nombre || nombreVisible(user)).slice(0, NOMBRE_MAX) || "Sin nombre";

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      nombre: nombreLimpio,
      email,
      esAdmin,
      creado: serverTimestamp(),
      actualizado: serverTimestamp(),
    });
    return;
  }

  const actual = snap.data();
  const parche = {};
  if (actual.uid !== user.uid) parche.uid = user.uid;
  if (actual.email !== email) parche.email = email;
  if (typeof actual.nombre !== "string" || !limpiarNombre(actual.nombre)) parche.nombre = nombreLimpio;
  if (actual.esAdmin !== esAdmin) parche.esAdmin = esAdmin;
  if (!Object.keys(parche).length) return; // ya está al día: sin escrituras innecesarias
  await updateDoc(ref, { ...parche, actualizado: serverTimestamp() });
}

// Cada inicio de sesión (y cada recarga con la sesión ya guardada) deja el perfil al día.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cacheRol.clear();
    return;
  }
  if (registrando) return; // register() lo hace cuando ya tiene el nombre
  sincronizarPerfil(user).catch((e) => console.warn("No se pudo sincronizar el perfil:", e));
});

/** Guarda el nombre en Firestore y en Firebase Auth (displayName). Devuelve el nombre limpio. */
export async function guardarNombrePerfil(nombreBruto) {
  const user = auth.currentUser;
  if (!user) throw errorAuth("auth/requires-recent-login");
  const nombre = limpiarNombre(nombreBruto);
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    throw errorAuth("perfil/nombre-invalido");
  }
  const ref = doc(db, USUARIOS_COLECCION, user.uid);
  const email = (user.email || "").toLowerCase();
  const esAdmin = await calcularEsAdmin(user);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    // uid/email/esAdmin también se rellenan aquí por si el documento es de una cuenta antigua.
    await updateDoc(ref, { nombre, uid: user.uid, email, esAdmin, actualizado: serverTimestamp() });
  } else {
    await setDoc(ref, {
      uid: user.uid,
      nombre,
      email,
      esAdmin,
      creado: serverTimestamp(),
      actualizado: serverTimestamp(),
    });
  }
  await updateProfile(user, { displayName: nombre });
  document.dispatchEvent(new CustomEvent("auth:perfil-actualizado"));
  return nombre;
}

/** Rol del usuario: Admin Principal (UID fijo), Admin inferior (roles/{uid}) o Estudiante. */
export async function getRol(user, { forzar = false } = {}) {
  if (!user) return ROL.USUARIO;
  if (isAuthorized(user)) return ROL.PRINCIPAL;
  if (!forzar && cacheRol.has(user.uid)) return cacheRol.get(user.uid);
  let rol = ROL.USUARIO;
  try {
    const snap = await getDoc(doc(db, ROLES_COLECCION, user.uid));
    if (snap.exists() && snap.data().adminInferior === true) rol = ROL.INFERIOR;
  } catch (e) {
    console.warn("No se pudo leer el rol:", e);
  }
  cacheRol.set(user.uid, rol);
  return rol;
}

/**
 * ¿Puede publicar/editar exámenes y tareas GLOBALES del calendario?
 * Admin Principal o Admin inferior. Es lo único para lo que sirve el Admin inferior.
 */
export async function puedeGestionarCalendarioGlobal(user) {
  return (await getRol(user)) !== ROL.USUARIO;
}

/**
 * Todos los usuarios de la colección `usuarios` salvo el Admin Principal (no se lista a sí
 * mismo), con su estado de Admin inferior (roles/{uid}, que es la fuente de verdad).
 */
export async function listarUsuarios() {
  const yo = auth.currentUser;
  if (!isAuthorized(yo)) throw errorAuth("permission-denied");
  const [usuarios, roles] = await Promise.all([
    getDocs(collection(db, USUARIOS_COLECCION)),
    getDocs(collection(db, ROLES_COLECCION)),
  ]);
  const inferiores = new Set();
  roles.forEach((d) => {
    if (d.data().adminInferior === true) inferiores.add(d.id);
  });
  const lista = [];
  usuarios.forEach((d) => {
    if (d.id === AUTHORIZED_UID || d.id === yo.uid) return; // el Admin Principal no se lista
    const x = d.data();
    lista.push({
      uid: d.id, // el id del documento es el uid (no nos fiamos del campo, que puede faltar)
      nombre: typeof x.nombre === "string" ? x.nombre : "",
      email: typeof x.email === "string" ? x.email : "",
      adminInferior: inferiores.has(d.id),
    });
  });
  return lista.sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, "es"));
}

/**
 * Concede (true) o revoca (false) el rol de Admin inferior. Solo el Admin Principal.
 * En un único batch: roles/{uid} (fuente de verdad que usan las reglas) y el reflejo
 * usuarios/{uid}.esAdmin, para que ambos no puedan quedar desincronizados.
 */
export async function fijarAdminInferior(uid, activo) {
  const yo = auth.currentUser;
  if (!isAuthorized(yo) || !uid || uid === AUTHORIZED_UID) throw errorAuth("permission-denied");
  const refRol = doc(db, ROLES_COLECCION, uid);
  const refUsuario = doc(db, USUARIOS_COLECCION, uid);
  const batch = writeBatch(db);
  if (activo) {
    batch.set(refRol, { adminInferior: true, asignado_por: yo.uid, actualizado: serverTimestamp() });
  } else {
    batch.delete(refRol);
  }
  batch.update(refUsuario, { esAdmin: !!activo, actualizado: serverTimestamp() });
  await batch.commit();
}

/* ==========================================================================
   FAVORITOS  (favoritos/{uid} = { rutas: [rutas de apuntes], ts })
   Solo el propio usuario puede leerlos y escribirlos (ver rules.firestore).
   ========================================================================== */

const FAVORITOS_COLECCION = "favoritos";
export const MAX_FAVORITOS = 300; // mismo tope que en rules.firestore

/** Rutas favoritas de la cuenta, o null si todavía no hay documento. */
export async function cargarFavoritosNube(user) {
  const snap = await getDoc(doc(db, FAVORITOS_COLECCION, user.uid));
  if (!snap.exists()) return null;
  const rutas = snap.data().rutas;
  return Array.isArray(rutas) ? [...new Set(rutas.filter((r) => typeof r === "string"))] : [];
}

export async function guardarFavoritosNube(user, rutas) {
  if (rutas.length > MAX_FAVORITOS) {
    throw new Error(`Solo se pueden guardar ${MAX_FAVORITOS} favoritos en la cuenta.`);
  }
  await setDoc(doc(db, FAVORITOS_COLECCION, user.uid), { rutas, ts: Date.now() });
}
