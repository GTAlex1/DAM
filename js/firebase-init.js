// firebase-init.js
// Conexión con Firebase: autenticación (para saber quién puede editar el
// orden de carpetas/archivos) y Firestore (donde se guarda ese orden).
//
// IMPORTANTE — antes de publicar:
// 1. Sustituye AUTHORIZED_UID más abajo por el UID real de tu usuario
//    (Firebase Console → Authentication → Users → columna "User UID").
// 2. Crea ese usuario en Firebase Console → Authentication → Users → Add user
//    (con email + contraseña) si todavía no existe.
// 3. Activa el proveedor "Email/Password" en Authentication → Sign-in method.
// 4. Crea una base Firestore (modo producción) y sube las reglas de
//    firestore.rules que te he preparado junto a este archivo.
//
// MÓDULO DE APUNTES (al final de este archivo). Los archivos se guardan en
// Cloudinary (plan gratuito, sin tarjeta) y sus metadatos en Firestore:
// 5. Cloudinary → Settings → Upload → Upload presets: el preset debe estar en
//    modo "Unsigned". Recomendado: limitar formatos a pdf y html.
// 6. Cloudinary → Settings → Security: activa "Allow delivery of PDF and ZIP
//    files". Sin eso, las cuentas gratuitas devuelven error 401 al abrir PDF.
// 7. Pega firestore.rules en Firebase Console → Firestore → Rules.
// 8. Edita la lista ASIGNATURAS del módulo (más abajo) con tus asignaturas.
// 9. El módulo tiene dos modos según los atributos de #firebase-apuntes
//    (ver el comentario del módulo): página de asignatura y vista general.
// 10. El registro es abierto: cualquiera puede crear cuenta desde el modal de
//    acceso (#modal-auth). Eso NO da permisos de gestión: solo AUTHORIZED_UID
//    (aquí) y esPropietario() (firestore.rules) pueden escribir el orden del
//    árbol y mover/reordenar/eliminar apuntes.
//
// PERFILES Y ROLES (módulos «CUENTA» y «GESTIÓN DE USUARIOS», más abajo):
// 11. Cada usuario tiene un documento usuarios/{uid} {uid, nombre, email, esAdmin, ...}
//    que se crea/actualiza al registrarse Y en cada inicio de sesión (login() y
//    onAuthStateChanged). Así las cuentas antiguas quedan registradas en cuanto vuelven
//    a entrar. Es lo que lista el panel de administración (el SDK web no puede listar
//    Firebase Auth). `esAdmin` es un reflejo de solo lectura de roles/{uid}: las reglas
//    solo dejan escribirlo con el valor real.
// 12. El «Admin inferior» es un documento roles/{uid} {adminInferior: true} que
//    solo el Admin Principal (AUTHORIZED_UID) puede crear o borrar. Su ÚNICO efecto
//    es publicar/editar exámenes y tareas GLOBALES del calendario (ver rules).
//    calendario.js debe usar puedeGestionarCalendarioGlobal(user), exportada aquí.

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
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
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
const db = getFirestore(app);

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

function mensajeErrorAuth(code) {
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
const NOMBRE_MIN = 2;
const NOMBRE_MAX = 60;

export const ROL = Object.freeze({
  PRINCIPAL: "principal",
  INFERIOR: "admin-inferior",
  USUARIO: "usuario",
});
const ETIQUETA_ROL = {
  [ROL.PRINCIPAL]: "Admin Principal",
  [ROL.INFERIOR]: "Admin inferior",
  [ROL.USUARIO]: "Estudiante",
};

const cacheRol = new Map(); // uid -> ROL.* (se vacía al cerrar sesión)

/** Correo tal como se enseña: las cuentas «por usuario» no tienen correo real. */
export function correoVisible(user) {
  return formatearCorreo(user?.email || "");
}
function formatearCorreo(email) {
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
   MÓDULO DE ACCESO  (modal unificado de inicio de sesión / registro)

   Único punto de entrada a la cuenta en todas las páginas. Cada página incluye
   el mismo marcado:

     #auth-header       contenedor del header (data-estado: cargando|anonimo|sesion)
     #btn-auth-trigger  botón «Acceder» (visible solo SIN sesión)
     #auth-user         icono + nombre + #btn-auth-logout (visible solo CON sesión)
     #modal-auth        diálogo con las pestañas «Iniciar sesión» / «Crear cuenta»

   Si una página no incluye ese marcado, este bloque no hace nada.
   ========================================================================== */

/**
 * Comportamiento común de los modales (.auth-modal): abrir/cerrar, Esc, clic en el fondo
 * (elementos con data-auth-cerrar) y foco atrapado. Exportado: app.js lo reutiliza.
 */
export function crearControlModal(modal, { focoInicial, alCerrar } = {}) {
  const enfocables = () =>
    [...modal.querySelectorAll("button, input, select, a[href]")].filter(
      (n) => !n.disabled && n.getClientRects().length > 0
    );

  function abrir() {
    modal.hidden = false;
    document.documentElement.classList.add("auth-bloqueo");
    const destino = typeof focoInicial === "function" ? focoInicial() : null;
    (destino || enfocables()[0])?.focus();
  }

  function cerrar() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (!document.querySelector(".auth-modal:not([hidden])")) {
      document.documentElement.classList.remove("auth-bloqueo");
    }
    if (typeof alCerrar === "function") alCerrar();
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-auth-cerrar]")) cerrar();
  });

  // En fase de captura y con stopPropagation: así el Esc que cierra el modal no
  // llega también a los atajos globales de la página (p. ej. «cerrar pestaña»).
  document.addEventListener(
    "keydown",
    (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cerrar();
      } else if (e.key === "Tab") {
        const f = enfocables();
        if (!f.length) return;
        const primero = f[0];
        const ultimo = f[f.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    },
    true
  );

  return { abrir, cerrar, estaAbierto: () => !modal.hidden };
}

function initAuthUI() {
  const modal = document.getElementById("modal-auth");
  const trigger = document.getElementById("btn-auth-trigger");
  if (!modal || !trigger || modal.dataset.authInit) return;
  modal.dataset.authInit = "1";

  // Dentro de un iframe (p. ej. una nota cargada por la app) manda el header de
  // la página contenedora: aquí no se duplica el acceso.
  if (window.self !== window.top) {
    document.documentElement.classList.add("auth-embebido");
    return;
  }

  const header = document.getElementById("auth-header");
  const boxUser = document.getElementById("auth-user");
  const nombreEl = document.getElementById("auth-user-name");
  const rolEl = document.getElementById("auth-user-rol");
  // index.html: icono de perfil (abre «Mi cuenta»). Otras páginas: botón «Cerrar sesión» suelto.
  const btnPerfil = document.getElementById("btn-perfil-trigger");
  const btnLogout = document.getElementById("btn-auth-logout");
  const form = modal.querySelector("#form-auth");
  const campoUsuario = modal.querySelector("#auth-email");
  const campoPass = modal.querySelector("#auth-password");
  const campoPass2 = modal.querySelector("#auth-password2");
  const errorEl = modal.querySelector("#auth-error");
  const submit = modal.querySelector("#auth-submit");
  const tabs = [...modal.querySelectorAll("[data-auth-tab]")];
  const soloRegistro = [...modal.querySelectorAll('[data-auth-solo="registro"]')];

  let modo = "login"; // "login" | "registro"
  let enviando = false;

  const mostrarError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  function setModo(nuevo) {
    modo = nuevo;
    const reg = modo === "registro";
    for (const t of tabs) {
      const activa = t.dataset.authTab === modo;
      t.classList.toggle("is-active", activa);
      t.setAttribute("aria-selected", String(activa));
    }
    form.setAttribute("aria-labelledby", reg ? "tab-registro" : "tab-login");
    for (const n of soloRegistro) n.hidden = !reg;
    campoPass2.required = reg;
    campoPass.autocomplete = reg ? "new-password" : "current-password";
    submit.textContent = reg ? "Crear cuenta" : "Entrar";
    mostrarError("");
  }

  const control = crearControlModal(modal, {
    focoInicial: () => campoUsuario,
    alCerrar: () => {
      form.reset();
      mostrarError("");
      (trigger.hidden ? btnPerfil || btnLogout || trigger : trigger).focus();
    },
  });
  const cerrar = control.cerrar;

  function abrir(modoInicial = "login") {
    setModo(modoInicial);
    control.abrir();
  }

  trigger.addEventListener("click", () => abrir("login"));
  for (const t of tabs) {
    t.addEventListener("click", () => {
      setModo(t.dataset.authTab);
      campoUsuario.focus();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;
    const usuario = campoUsuario.value.trim();
    const pass = campoPass.value;
    if (!usuario) return mostrarError("Escribe tu usuario o correo.");
    if (!pass) return mostrarError("Escribe la contraseña.");
    if (modo === "registro") {
      if (pass.length < 6) return mostrarError("La contraseña necesita al menos 6 caracteres.");
      if (pass !== campoPass2.value) return mostrarError("Las contraseñas no coinciden.");
    }

    enviando = true;
    submit.disabled = true;
    mostrarError("");
    try {
      if (modo === "registro") await register(usuario, pass);
      else await login(usuario, pass);
      cerrar();
      pintar(auth.currentUser); // refresca el nombre tras updateProfile()
    } catch (err) {
      console.warn("Acceso fallido:", err?.code || err);
      mostrarError(mensajeErrorAuth(err?.code));
    } finally {
      enviando = false;
      submit.disabled = false;
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await logout();
      } catch (err) {
        console.warn("No se pudo cerrar sesión:", err);
      }
    });
  }

  /** Sin sesión: botón «Acceder». Con sesión: icono/nombre de usuario. */
  function pintar(user) {
    trigger.hidden = !!user;
    boxUser.hidden = !user;
    if (header) header.dataset.estado = user ? "sesion" : "anonimo";
    if (!user) {
      nombreEl.textContent = "";
      rolEl.hidden = true;
      boxUser.removeAttribute("title");
      if (btnPerfil) btnPerfil.title = "Mi cuenta";
      return;
    }
    const nombre = nombreVisible(user);
    nombreEl.textContent = nombre;
    if (btnPerfil) btnPerfil.title = `Mi cuenta · ${nombre}`;
    else boxUser.title = nombre;

    rolEl.hidden = !isAuthorized(user);
    rolEl.textContent = "admin";
    getRol(user).then((rol) => {
      if (auth.currentUser?.uid !== user.uid) return;
      rolEl.hidden = rol === ROL.USUARIO;
      rolEl.textContent = rol === ROL.PRINCIPAL ? "admin" : "admin inf.";
      rolEl.title = rol === ROL.PRINCIPAL ? "Administrador principal" : "Admin inferior";
    });
  }

  document.addEventListener("auth:perfil-actualizado", () => pintar(auth.currentUser));

  watchAuth((user) => {
    pintar(user);
    if (user && !modal.hidden) cerrar(); // p. ej. sesión iniciada desde otra pestaña
  });
}

/* ==========================================================================
   MÓDULO «MI CUENTA»  (#modal-perfil, solo index.html)

   Se abre con el icono de usuario de la barra de actividad (#btn-perfil-trigger).
   Cambiar el nombre y «Cerrar sesión» viven aquí dentro; si el usuario es el Admin
   Principal también aparece el botón que abre la gestión de usuarios.
   ========================================================================== */

let abrirPanelUsuarios = null; // lo define initUsuariosUI()

function initPerfilUI() {
  const modal = document.getElementById("modal-perfil");
  const trigger = document.getElementById("btn-perfil-trigger");
  if (!modal || !trigger || modal.dataset.perfilInit) return;
  modal.dataset.perfilInit = "1";
  if (window.self !== window.top) return;

  const $ = (id) => modal.querySelector(`#${id}`);
  const form = $("perfil-form");
  const campo = $("perfil-nombre");
  const errEl = $("perfil-error");
  const okEl = $("perfil-ok");
  const guardar = $("perfil-guardar");
  const emailEl = $("perfil-email");
  const rolEl = $("perfil-rol");
  const btnUsuarios = $("btn-perfil-usuarios");
  const btnLogout = $("btn-perfil-logout");
  let guardando = false;

  const msg = (tipo, texto = "") => {
    errEl.hidden = !(tipo === "err" && texto);
    okEl.hidden = !(tipo === "ok" && texto);
    if (tipo === "err") errEl.textContent = texto;
    if (tipo === "ok") okEl.textContent = texto;
  };

  const control = crearControlModal(modal, {
    focoInicial: () => campo,
    alCerrar: () => {
      msg("");
      trigger.focus();
    },
  });

  function rellenar() {
    const user = auth.currentUser;
    if (!user) return;
    campo.value = user.displayName || nombreVisible(user);
    emailEl.textContent = correoVisible(user);
    btnUsuarios.hidden = !isAuthorized(user);
    const rolInicial = isAuthorized(user) ? ROL.PRINCIPAL : ROL.USUARIO;
    rolEl.dataset.rol = rolInicial;
    rolEl.textContent = ETIQUETA_ROL[rolInicial];
    getRol(user).then((rol) => {
      if (auth.currentUser?.uid !== user.uid) return;
      rolEl.dataset.rol = rol;
      rolEl.textContent = ETIQUETA_ROL[rol];
    });
  }

  trigger.addEventListener("click", () => {
    if (!auth.currentUser) return;
    msg("");
    rellenar();
    control.abrir();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (guardando) return;
    guardando = true;
    guardar.disabled = true;
    msg("");
    try {
      campo.value = await guardarNombrePerfil(campo.value);
      msg("ok", "Nombre guardado.");
    } catch (err) {
      console.warn("No se pudo guardar el nombre:", err?.code || err);
      const texto =
        err?.code === "perfil/nombre-invalido"
          ? `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`
          : err?.code === "permission-denied"
            ? "Firestore denegó el cambio. Comprueba que las reglas nuevas están publicadas."
            : err?.code === "auth/network-request-failed" || err?.code === "unavailable"
              ? "Sin conexión. Revisa tu red e inténtalo de nuevo."
              : "No se pudo guardar el nombre. Inténtalo de nuevo.";
      msg("err", texto);
    } finally {
      guardando = false;
      guardar.disabled = false;
    }
  });

  btnLogout.addEventListener("click", async () => {
    btnLogout.disabled = true;
    try {
      await logout();
      control.cerrar();
    } catch (err) {
      console.warn("No se pudo cerrar sesión:", err);
      msg("err", "No se pudo cerrar sesión. Inténtalo de nuevo.");
    } finally {
      btnLogout.disabled = false;
    }
  });

  btnUsuarios.addEventListener("click", () => {
    if (!isAuthorized(auth.currentUser)) return;
    control.cerrar();
    if (abrirPanelUsuarios) abrirPanelUsuarios();
  });

  watchAuth((user) => {
    if (!user && !modal.hidden) control.cerrar();
    btnUsuarios.hidden = !isAuthorized(user);
  });
}

/* ==========================================================================
   MÓDULO «GESTIÓN DE USUARIOS»  (#modal-usuarios, solo Admin Principal)

   Lista los usuarios de Firestore (colección usuarios, sin el Admin Principal) con un
   conmutador para conceder/revocar «Admin inferior». Los nombres y correos los escribe
   cada usuario: se pintan siempre con textContent, nunca como HTML.
   ========================================================================== */

function initUsuariosUI() {
  const modal = document.getElementById("modal-usuarios");
  if (!modal || modal.dataset.usuariosInit) return;
  modal.dataset.usuariosInit = "1";
  if (window.self !== window.top) return;

  const filtro = modal.querySelector("#usuarios-filtro");
  const errEl = modal.querySelector("#usuarios-error");
  const cuentaEl = modal.querySelector("#usuarios-cuenta");
  const lista = modal.querySelector("#usuarios-lista");
  const btnRecargar = modal.querySelector("#usuarios-recargar");

  let usuarios = [];
  let cargando = false;

  const control = crearControlModal(modal, { focoInicial: () => filtro });

  const mostrarError = (texto = "") => {
    errEl.textContent = texto;
    errEl.hidden = !texto;
  };

  function pintarCuenta(visibles) {
    const conRol = usuarios.filter((u) => u.adminInferior).length;
    cuentaEl.textContent = `${visibles} de ${usuarios.length} usuarios · ${conRol} con Admin inferior`;
  }

  function crearFila(u) {
    const li = el("li", "usr-item");

    const info = el("div", "usr-info");
    info.append(
      el("span", "usr-nombre", u.nombre || "(sin nombre)"),
      el("span", "usr-email", formatearCorreo(u.email))
    );

    const etiqueta = el("label", "usr-switch");
    const input = el("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("aria-label", `Admin inferior: ${u.nombre || u.email}`);
    input.checked = u.adminInferior;
    etiqueta.append(input, el("span", "usr-switch-ui"), el("span", "usr-switch-txt", "Admin inferior"));

    input.addEventListener("change", async () => {
      const activo = input.checked;
      input.disabled = true;
      mostrarError("");
      try {
        await fijarAdminInferior(u.uid, activo);
        u.adminInferior = activo;
        pintarCuenta(lista.children.length);
      } catch (err) {
        console.error("No se pudo cambiar el rol:", err);
        input.checked = !activo;
        mostrarError(
          err?.code === "permission-denied"
            ? "Firestore denegó el cambio. Comprueba que las reglas nuevas están publicadas."
            : "No se pudo cambiar el rol. Inténtalo de nuevo."
        );
      } finally {
        input.disabled = false;
      }
    });

    li.append(info, etiqueta);
    return li;
  }

  function pintar() {
    const q = filtro.value.trim().toLowerCase();
    const yo = auth.currentUser?.uid;
    const visibles = usuarios.filter(
      (u) =>
        u.uid !== yo && // el Admin Principal no se lista a sí mismo
        u.uid !== AUTHORIZED_UID &&
        (!q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
    lista.replaceChildren();
    if (!visibles.length) {
      lista.append(
        el(
          "li",
          "usr-vacio",
          usuarios.length
            ? "Ningún usuario coincide con el filtro."
            : "Aún no hay otros usuarios registrados. Cada usuario aparece aquí al crear su cuenta o la próxima vez que inicie sesión."
        )
      );
    } else {
      for (const u of visibles) lista.append(crearFila(u));
    }
    pintarCuenta(visibles.length);
  }

  async function cargar() {
    if (cargando) return;
    cargando = true;
    btnRecargar.disabled = true;
    mostrarError("");
    cuentaEl.textContent = "Cargando usuarios…";
    lista.replaceChildren();
    try {
      usuarios = await listarUsuarios();
      pintar();
    } catch (err) {
      console.error("No se pudo cargar la lista de usuarios:", err);
      cuentaEl.textContent = "";
      mostrarError(
        err?.code === "permission-denied"
          ? "Firestore denegó la lectura. Publica las reglas nuevas (firestore.rules) y comprueba que AUTHORIZED_UID es tu UID."
          : `No se pudo cargar la lista de usuarios${err?.code ? ` (${err.code})` : ""}.`
      );
    } finally {
      cargando = false;
      btnRecargar.disabled = false;
    }
  }

  filtro.addEventListener("input", pintar);
  btnRecargar.addEventListener("click", cargar);

  abrirPanelUsuarios = () => {
    if (!isAuthorized(auth.currentUser)) return;
    filtro.value = "";
    control.abrir();
    cargar();
  };

  watchAuth((user) => {
    if (!isAuthorized(user) && !modal.hidden) control.cerrar();
  });
}

function iniciarUIs() {
  initAuthUI();
  initPerfilUI();
  initUsuariosUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarUIs);
} else {
  iniciarUIs();
}

/* ==========================================================================
   MÓDULO DE APUNTES  (archivos en Cloudinary + metadatos en Firestore)

   El contenedor #firebase-apuntes admite dos modos:

   1) Página de una asignatura: lista solo los archivos de esa asignatura.
        <div id="firebase-apuntes" class="fbap" data-asignatura="Programacion"></div>

   2) Vista general de DAM: sube archivos (eligiendo asignatura o dejándolos en
      "Sin clasificar") y muestra todas las asignaturas agrupadas.
        <div id="firebase-apuntes" class="fbap" data-modo="general"></div>

   En AMBOS modos, cualquier usuario con sesión ve el panel «Subir archivo» (en el modo de
   asignatura el destino queda fijado a esa asignatura); sin sesión se muestra un aviso
   con botón para iniciar sesión. Solo el Admin Principal ve además los controles para
   mover un archivo a otra asignatura, cambiar su posición o eliminarlo de la lista.
   Los visitantes solo ven la lista.

   Cada documento de la colección "apuntes" guarda:
     nombre, url (secure_url de Cloudinary), tipo ("pdf" | "html"),
     asignatura, orden (entero, posición dentro de su asignatura),
     creado_por (UID de quien lo subió) y fecha.

   Si en la página no existe #firebase-apuntes, este bloque no hace nada, así
   que el resto de páginas que importan este archivo no se ven afectadas.
   ========================================================================== */

const CLOUDINARY_CLOUD_NAME = "vagm1bzj";
const CLOUDINARY_UPLOAD_PRESET = "ygqvroyh"; // preset en modo Unsigned
// La API Key es un identificador público (como un usuario). El API Secret NUNCA
// debe aparecer en código que se sirve al navegador.
const CLOUDINARY_API_KEY = "942938883181668";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const APUNTES_COLECCION = "apuntes";
const MAX_MB = 10; // límite del plan gratuito de Cloudinary (PDF y archivos raw)
const TIPOS_PERMITIDOS = ["pdf", "html"];

/** Bandeja por defecto para lo que aún no está en ninguna asignatura. */
const SIN_CLASIFICAR = "Sin clasificar";

// ⚠️ EDITA ESTA LISTA con tus asignaturas. Cada valor debe ser IDÉNTICO al
// data-asignatura de su página (mayúsculas y tildes incluidas). Es el catálogo
// que se ofrece al subir y en "Mover a…". Los archivos de una asignatura que
// no esté aquí siguen apareciendo en la vista general.
const ASIGNATURAS = [
  "Programacion",
  "Bases de Datos",
  "Entornos de Desarrollo",
  "Lenguajes de Marcas",
  "Sistemas Informaticos",
  "FOL",
];

/** Error devuelto por Cloudinary (para distinguirlo de fallos de Firestore o de red). */
class ErrorCloudinary extends Error {}

/* ---------- Utilidades ---------- */

function extensionDe(nombre) {
  const m = /\.([^.]+)$/.exec(nombre);
  return m ? m[1].toLowerCase() : "";
}

/** Solo enlazamos URLs https de TU cuenta de Cloudinary. */
function urlSegura(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      u.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/`)
    );
  } catch {
    return false;
  }
}

function formatearFecha(ts) {
  if (!ts || typeof ts.toDate !== "function") return "";
  return ts.toDate().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Orden de la lista: por `orden` ascendente. Los documentos antiguos que aún no
 * tienen `orden` van al final (se numeran solos la primera vez que se reordena).
 * Si hay empate, primero el más reciente.
 */
function compararApuntes(a, b) {
  const oa = Number.isInteger(a.orden) ? a.orden : Number.MAX_SAFE_INTEGER;
  const ob = Number.isInteger(b.orden) ? b.orden : Number.MAX_SAFE_INTEGER;
  return oa - ob || (b.fecha?.toMillis?.() ?? 0) - (a.fecha?.toMillis?.() ?? 0);
}

/* ---------- Cloudinary + Firestore ---------- */

/** Siguiente posición libre al final de una asignatura (máximo `orden` + 1). */
async function siguienteOrden(asignatura) {
  const snap = await getDocs(
    query(collection(db, APUNTES_COLECCION), where("asignatura", "==", asignatura))
  );
  let max = -1;
  snap.forEach((d) => {
    const o = d.data().orden;
    if (Number.isInteger(o) && o > max) max = o;
  });
  return max + 1;
}

/**
 * 1) Sube el archivo a Cloudinary (subida sin firma, con fetch + FormData).
 * 2) Con la secure_url devuelta, registra el documento en Firestore al final de
 *    la asignatura elegida, vinculado al usuario que lo sube.
 * Devuelve el nombre del archivo subido.
 */
async function subirApunte(asignatura, file) {
  const nombre = file.name.trim();
  const tipo = extensionDe(nombre); // "pdf" | "html" (ya validado antes)

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  form.append("api_key", CLOUDINARY_API_KEY);
  // Carpeta en la Media Library de Cloudinary (solo organización).
  form.append("folder", `apuntes/${asignatura.replace(/[&?%#\\<>]/g, "_")}`);

  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.secure_url) {
    throw new ErrorCloudinary(data?.error?.message || `Respuesta HTTP ${res.status}`);
  }

  await addDoc(collection(db, APUNTES_COLECCION), {
    nombre,
    url: data.secure_url,
    tipo,
    asignatura,
    orden: await siguienteOrden(asignatura),
    // UID y no email: la colección es de lectura pública y un email quedaría expuesto.
    creado_por: auth.currentUser.uid,
    fecha: serverTimestamp(),
  });
  return nombre;
}

/**
 * Escucha en tiempo real los apuntes de una asignatura (o todos si asignatura es null).
 * No ordenamos en la consulta: combinar where + orderBy en campos distintos
 * obligaría a crear un índice compuesto en la consola. Se ordena en el cliente.
 */
function escucharApuntes(asignatura, onData, onError) {
  const ref = collection(db, APUNTES_COLECCION);
  const q = asignatura ? query(ref, where("asignatura", "==", asignatura)) : ref;
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
      ),
    onError
  );
}

/**
 * Mueve un archivo una posición arriba (-1) o abajo (+1) dentro de su asignatura.
 * `grupo` es la lista tal como se ve en pantalla. Tras el intercambio se renumera
 * todo el grupo (0, 1, 2…) en un único batch: es atómico y además corrige huecos,
 * empates y documentos antiguos sin `orden`.
 */
async function reordenarApunte(grupo, id, delta) {
  const ids = grupo.map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];

  const batch = writeBatch(db);
  const porId = new Map(grupo.map((x) => [x.id, x]));
  ids.forEach((docId, posicion) => {
    if (porId.get(docId).orden !== posicion) {
      batch.update(doc(db, APUNTES_COLECCION, docId), { orden: posicion });
    }
  });
  await batch.commit();
}

/** Cambia un archivo de asignatura y lo deja al final de la nueva. */
async function moverApunte(id, destino) {
  await updateDoc(doc(db, APUNTES_COLECCION, id), {
    asignatura: destino,
    orden: await siguienteOrden(destino),
  });
}

/** Elimina el registro de un apunte (el archivo sigue en Cloudinary: no se puede borrar sin firma). */
async function eliminarApunte(id) {
  await deleteDoc(doc(db, APUNTES_COLECCION, id));
}

/* ---------- Interfaz ---------- */

const ICONO_SUBIR =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.5 10 8 5.5 12.5 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICONO_BAJAR =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Panel «Subir archivo» a Cloudinary, reutilizable: lo usa initApuntes() en las páginas
 * de asignatura y en la vista general, y app.js dentro del modal de index.html.
 * Con sesión muestra el formulario; sin sesión, un aviso con botón para iniciar sesión.
 * @param {string|null} asignaturaFija  Si se indica, el destino queda fijado a esa asignatura.
 */
export function crearPanelSubida(asignaturaFija = null) {
  const fija = asignaturaFija && !asignaturaFija.includes("/") ? asignaturaFija : null;
  const wrap = el("div", "fbap-subida");

  // --- Sin sesión ---
  const anon = el("div", "fbap-panel");
  anon.append(
    el("p", "fbap-upload-title", "Subir archivos"),
    el("p", "fbap-status", "Inicia sesión para subir apuntes en PDF o HTML.")
  );
  const btnLogin = el("button", "fbap-btn fbap-btn-primary", "Iniciar sesión");
  btnLogin.type = "button";
  btnLogin.style.marginTop = "10px";
  btnLogin.addEventListener("click", () => document.getElementById("btn-auth-trigger")?.click());
  anon.append(btnLogin);

  // --- Con sesión ---
  const form = el("form", "fbap-panel");
  form.hidden = true;
  const titulo = el("p", "fbap-upload-title");
  titulo.innerHTML = ICONO_SUBIR;
  titulo.append(document.createTextNode("Subir archivo (PDF o HTML)"));

  const fila = el("div", "fbap-row");
  let selectDestino = null;
  if (fija) {
    const destino = el("span", "fbap-upload-dest");
    destino.append("Asignatura: ", el("strong", "", fija));
    fila.append(destino);
  } else {
    const campo = el("label", "fbap-field");
    campo.append(el("span", "fbap-label", "Subir a"));
    selectDestino = el("select", "fbap-input fbap-select");
    selectDestino.name = "asignatura";
    for (const nombre of [SIN_CLASIFICAR, ...ASIGNATURAS]) selectDestino.append(new Option(nombre, nombre));
    selectDestino.value = SIN_CLASIFICAR;
    campo.append(selectDestino);
    fila.append(campo);
  }

  const inputArchivo = el("input", "fbap-input fbap-file");
  inputArchivo.type = "file";
  inputArchivo.name = "archivo";
  inputArchivo.accept = ".pdf,.html,application/pdf,text/html";
  inputArchivo.required = true;
  inputArchivo.setAttribute("aria-label", "Archivo PDF o HTML");

  const btnSubir = el("button", "fbap-btn fbap-btn-primary", "Subir archivo");
  btnSubir.type = "submit";
  fila.append(inputArchivo, btnSubir);

  const progreso = el("div", "fbap-progress");
  progreso.hidden = true;
  progreso.setAttribute("role", "progressbar");
  progreso.setAttribute("aria-label", "Subiendo archivo");
  progreso.append(el("div", "fbap-progress-bar"));

  const textoBase = `Máximo ${MAX_MB} MB.` + (fija ? "" : ` Sin asignatura, el archivo queda en «${SIN_CLASIFICAR}».`);
  const msg = el("p", "fbap-status", textoBase);
  msg.setAttribute("role", "status");
  const setMsg = (texto, tipo = "") => {
    msg.textContent = texto;
    msg.dataset.tipo = tipo; // "", "ok" o "err"
  };

  form.append(titulo, fila, progreso, msg);
  wrap.append(anon, form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return setMsg("Inicia sesión para subir archivos.", "err");
    const file = inputArchivo.files[0];
    if (!file) return setMsg("Elige un archivo.", "err");
    if (!TIPOS_PERMITIDOS.includes(extensionDe(file.name))) {
      return setMsg("Solo se admiten archivos .pdf y .html.", "err");
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return setMsg(`El archivo supera el límite de ${MAX_MB} MB.`, "err");
    }
    const destino = fija || (selectDestino && selectDestino.value) || SIN_CLASIFICAR;

    btnSubir.disabled = true;
    progreso.hidden = false; // fetch no informa del porcentaje: barra indeterminada
    setMsg("Subiendo…");
    try {
      const nombre = await subirApunte(destino, file);
      inputArchivo.value = ""; // la asignatura elegida se conserva para subidas seguidas
      setMsg(`Archivo subido a «${destino}»: ${nombre}`, "ok");
    } catch (err) {
      console.error("Error al subir el apunte:", err);
      let texto = "No se pudo subir el archivo. Revisa la consola del navegador.";
      if (err instanceof ErrorCloudinary) {
        texto = `Cloudinary rechazó el archivo: ${err.message}`;
      } else if (err?.code === "permission-denied") {
        texto = "Cloudinary lo aceptó, pero Firestore denegó el registro. Comprueba que las reglas nuevas están publicadas.";
      } else if (err?.name === "TimeoutError") {
        texto = "La subida tardó demasiado. Inténtalo de nuevo.";
      } else if (err instanceof TypeError) {
        texto = "No se pudo conectar con Cloudinary. Revisa tu conexión.";
      }
      setMsg(texto, "err");
    } finally {
      btnSubir.disabled = false;
      progreso.hidden = true;
    }
  });

  watchAuth((user) => {
    anon.hidden = !!user;
    form.hidden = !user;
    if (!user) setMsg(textoBase);
  });

  return wrap;
}

function initApuntes(root) {
  const asignaturaFija = (root.dataset.asignatura || "").trim();
  const general = !asignaturaFija && root.dataset.modo === "general";
  root.classList.add("fbap");

  root.innerHTML = `
    <div class="fbap-head">
      <h2 class="fbap-title" data-fbap="titulo"></h2>
    </div>
    <p class="fbap-hint">${
      general ? "Archivos PDF y HTML organizados por asignatura." : "Archivos PDF y HTML de esta asignatura."
    }</p>

    <div data-fbap="subida"></div>
    <p class="fbap-status" data-fbap="gestion-msg" role="status"></p>

    <p class="fbap-empty" data-fbap="vacio">Cargando archivos…</p>
    <div class="fbap-grupos" data-fbap="grupos"></div>
  `;

  const $ = (name) => root.querySelector(`[data-fbap="${name}"]`);
  const titulo = $("titulo");
  const msgGestion = $("gestion-msg");
  const vacio = $("vacio");
  const grupos = $("grupos");

  const setMsg = (node, texto, tipo = "") => {
    node.textContent = texto;
    node.dataset.tipo = tipo; // "", "ok" o "err"
  };

  // Sin un modo válido no tiene sentido continuar.
  if (!general && (!asignaturaFija || asignaturaFija.includes("/"))) {
    titulo.textContent = "Archivos";
    vacio.textContent =
      'Configura #firebase-apuntes con data-asignatura="…" (sin barras "/") o con data-modo="general".';
    return;
  }
  titulo.textContent = general ? "Apuntes de DAM" : `Archivos de ${asignaturaFija}`;

  // Panel de subida: visible para cualquier usuario con sesión, en ambos modos.
  $("subida").replaceWith(crearPanelSubida(general ? null : asignaturaFija));

  /** Destinos posibles: la bandeja "Sin clasificar" y el catálogo de asignaturas. */
  const DESTINOS = [SIN_CLASIFICAR, ...ASIGNATURAS];

  /* --- Estado --- */
  let user = null;
  let autorizado = false; // solo el Admin Principal (AUTHORIZED_UID) gestiona archivos
  let items = [];
  let ocupado = false;
  let foco = null; // { id, accion } para devolver el foco tras repintar

  /* --- Sesión --- */
  function pintarSesion() {
    autorizado = isAuthorized(user);
    if (!autorizado) setMsg(msgGestion, "");
    pintarLista();
  }

  watchAuth((u) => {
    user = u;
    pintarSesion();
  });

  // El inicio de sesión vive en el modal global (#modal-auth): ver MÓDULO DE ACCESO.

  /* --- Listado en tiempo real --- */
  function crearControles(it, posicion, total) {
    const gestion = el("div", "fbap-manage");

    const btnSubirPos = el("button", "fbap-btn fbap-icon-btn");
    btnSubirPos.type = "button";
    btnSubirPos.dataset.accion = "subir";
    btnSubirPos.title = "Subir posición";
    btnSubirPos.setAttribute("aria-label", "Subir posición");
    btnSubirPos.innerHTML = ICONO_SUBIR;
    btnSubirPos.disabled = posicion === 0;

    const btnBajarPos = el("button", "fbap-btn fbap-icon-btn");
    btnBajarPos.type = "button";
    btnBajarPos.dataset.accion = "bajar";
    btnBajarPos.title = "Bajar posición";
    btnBajarPos.setAttribute("aria-label", "Bajar posición");
    btnBajarPos.innerHTML = ICONO_BAJAR;
    btnBajarPos.disabled = posicion === total - 1;

    const pos = el("span", "fbap-pos", `${posicion + 1}/${total}`);
    pos.title = "Posición en la asignatura";

    const mover = el("select", "fbap-input fbap-move");
    mover.dataset.accion = "mover";
    mover.setAttribute("aria-label", `Mover ${it.nombre} a otra asignatura`);
    mover.append(new Option("Mover a…", ""));
    for (const destino of DESTINOS) {
      if (destino !== (it.asignatura || SIN_CLASIFICAR)) mover.append(new Option(destino, destino));
    }
    mover.value = "";

    const btnEliminar = el("button", "fbap-btn fbap-btn--danger", "Eliminar");
    btnEliminar.type = "button";
    btnEliminar.dataset.accion = "eliminar";
    btnEliminar.title = "Quitar de la lista";
    btnEliminar.setAttribute("aria-label", `Eliminar ${it.nombre} de la lista`);

    gestion.append(btnSubirPos, btnBajarPos, pos, mover, btnEliminar);
    return gestion;
  }

  function crearItem(it, posicion, total) {
    const tipo = it.tipo === "pdf" ? "pdf" : "html";
    const li = el("li", `fbap-item fbap-item--${tipo}`);
    li.dataset.id = it.id;
    li.append(el("span", "fbap-badge", tipo.toUpperCase()));

    const info = el("div", "fbap-info");
    info.append(el("span", "fbap-name", it.nombre));
    const fecha = formatearFecha(it.fecha);
    if (fecha) info.append(el("span", "fbap-meta", `Subido el ${fecha}`));
    li.append(info);

    const acciones = el("div", "fbap-actions");
    const abrir = el("a", "fbap-btn", "Abrir");
    abrir.href = it.url;
    abrir.target = "_blank";
    abrir.rel = "noopener noreferrer";

    const descargar = el("a", "fbap-btn", "Descargar");
    descargar.href = it.url;
    descargar.target = "_blank";
    descargar.rel = "noopener noreferrer";
    descargar.dataset.descargar = it.nombre;

    acciones.append(abrir, descargar);
    li.append(acciones);

    if (autorizado) li.append(crearControles(it, posicion, total));
    return li;
  }

  /** Archivos de una asignatura, en el orden en que se muestran. */
  function grupoDe(asignatura) {
    return items
      .filter((it) => urlSegura(it.url) && (it.asignatura || SIN_CLASIFICAR) === asignatura)
      .sort(compararApuntes);
  }

  function pintarLista() {
    grupos.replaceChildren();
    const validos = items.filter((it) => urlSegura(it.url));
    vacio.hidden = validos.length > 0;
    vacio.textContent = items.length
      ? "No hay archivos válidos que mostrar."
      : general
        ? "Aún no hay archivos."
        : "Aún no hay archivos para esta asignatura.";

    // Vista general: primero la bandeja "Sin clasificar" (es lo pendiente de ordenar),
    // luego el catálogo en su orden y al final cualquier asignatura que no esté en él.
    const presentes = new Set(validos.map((it) => it.asignatura || SIN_CLASIFICAR));
    const claves = general
      ? [
          ...DESTINOS.filter((k) => presentes.has(k)),
          ...[...presentes].filter((k) => !DESTINOS.includes(k)).sort(),
        ]
      : [...presentes];

    for (const clave of claves) {
      const archivos = grupoDe(clave);
      const seccion = el("section", "fbap-group");
      if (general) {
        const h3 = el("h3", "fbap-group-title", clave);
        h3.append(el("span", "fbap-count", String(archivos.length)));
        seccion.append(h3);
      }
      const ul = el("ul", "fbap-list");
      archivos.forEach((it, i) => ul.append(crearItem(it, i, archivos.length)));
      seccion.append(ul);
      grupos.append(seccion);
    }

    // Tras repintar, devolvemos el foco al control que se estaba usando (teclado).
    if (foco) {
      const fila = grupos.querySelector(`li[data-id="${CSS.escape(foco.id)}"]`);
      const control =
        fila?.querySelector(`[data-accion="${foco.accion}"]:not(:disabled)`) ||
        fila?.querySelector("[data-accion]:not(:disabled)");
      control?.focus();
      foco = null;
    }
  }

  /** Ejecuta una operación de gestión evitando dobles clics y mostrando el resultado. */
  async function ejecutar(operacion, mensajeOk) {
    ocupado = true;
    root.classList.add("fbap-ocupado");
    setMsg(msgGestion, "");
    try {
      await operacion();
      setMsg(msgGestion, mensajeOk, "ok");
    } catch (err) {
      console.error("Error al gestionar el archivo:", err);
      foco = null;
      setMsg(
        msgGestion,
        err?.code === "permission-denied"
          ? "Firestore denegó el cambio. Comprueba la sesión y las reglas."
          : "No se pudo completar el cambio. Revisa la consola del navegador.",
        "err"
      );
    } finally {
      ocupado = false;
      root.classList.remove("fbap-ocupado");
    }
  }

  grupos.addEventListener("click", async (e) => {
    // "Descargar": el atributo `download` lo ignoran los navegadores con URLs de otro
    // origen, así que intentamos bajar el archivo como blob (conserva su nombre
    // original). Si la petición falla, abrimos el archivo en otra pestaña.
    const enlace = e.target.closest("a[data-descargar]");
    if (enlace) {
      e.preventDefault();
      try {
        const res = await fetch(enlace.href);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const objUrl = URL.createObjectURL(await res.blob());
        const tmp = el("a");
        tmp.href = objUrl;
        tmp.download = enlace.dataset.descargar;
        root.append(tmp);
        tmp.click();
        tmp.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
      } catch {
        window.open(enlace.href, "_blank", "noopener,noreferrer");
      }
      return;
    }

    // Subir / bajar posición
    const boton = e.target.closest("button[data-accion]");
    if (!boton || ocupado || !autorizado) return;
    const it = items.find((x) => x.id === boton.closest("li")?.dataset.id);
    if (!it) return;
    if (boton.dataset.accion === "eliminar") {
      if (!confirm(`¿Quitar «${it.nombre}» de la lista?\n\nEl archivo seguirá en Cloudinary; solo desaparece de la web.`)) return;
      foco = null;
      await ejecutar(() => eliminarApunte(it.id), "Archivo eliminado de la lista.");
      return;
    }
    foco = { id: it.id, accion: boton.dataset.accion };
    await ejecutar(
      () => reordenarApunte(grupoDe(it.asignatura || SIN_CLASIFICAR), it.id, boton.dataset.accion === "subir" ? -1 : 1),
      "Posición actualizada."
    );
  });

  // Mover a otra asignatura
  grupos.addEventListener("change", async (e) => {
    const select = e.target.closest("select[data-accion='mover']");
    if (!select || !select.value || ocupado || !autorizado) return;
    const destino = select.value;
    const it = items.find((x) => x.id === select.closest("li")?.dataset.id);
    if (!it || !DESTINOS.includes(destino)) return;
    foco = { id: it.id, accion: "mover" };
    await ejecutar(() => moverApunte(it.id, destino), `Movido a «${destino}».`);
    select.value = "";
  });

  escucharApuntes(
    general ? null : asignaturaFija,
    (datos) => {
      items = datos;
      pintarLista();
    },
    (err) => {
      console.error("Error al leer los apuntes:", err);
      vacio.hidden = false;
      vacio.textContent = "No se pudo cargar la lista de archivos.";
    }
  );
}

const contenedorApuntes = document.getElementById("firebase-apuntes");
if (contenedorApuntes) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initApuntes(contenedorApuntes));
  } else {
    initApuntes(contenedorApuntes);
  }
}
