// firebase-core.js
// NOTA: el nombre es histórico. Desde la migración este archivo es el núcleo de SUPABASE
// (conexión, sesión, perfiles, roles, orden del árbol y favoritos). Mantiene el nombre y la API
// pública de siempre para no tocar los demás módulos; se renombrará a supabase-core.js en la fase E.
// No toca el DOM (salvo un evento). Lo usan acceso-ui.js, apuntes.js y, a través de
// firebase-init.js, el resto de la web.
//
// DIFERENCIAS CON LA VERSIÓN DE FIREBASE
//  - No hay UID fijo del propietario: el Admin Principal es quien tiene rol «propietario» en la
//    tabla `roles` (el Admin inferior, «admin_inferior»). La seguridad real la imponen las
//    políticas RLS de Supabase, no este archivo.
//  - El perfil vive en la tabla `perfiles` (id, nombre, email). «Es admin» ya no se guarda en el
//    perfil: se deduce siempre de `roles`.
//  - Hay que tener DESACTIVADA la confirmación de correo (Authentication → Providers → Email →
//    «Confirm email»): las cuentas «por usuario» tienen un correo ficticio que no recibe mensajes.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";

const SUPABASE_URL = "https://ywiprpasiafezfaajnfl.supabase.co";
// Clave PÚBLICA (publishable): está pensada para ir en el código del navegador.
const SUPABASE_CLAVE_PUBLICA = "sb_publishable_vkMJHKoUCiaTGnSpycU7Bg_0-qlhKJc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Ya no existe un UID fijo (se queda vacío para no romper las importaciones antiguas).
export const AUTHORIZED_UID = "";

// TEMPORAL: los módulos que todavía usan Firestore (apuntes, calendario, chat, horario) importan
// `db`. Con `null` la web carga y solo fallan esas funciones concretas hasta migrarlas (fases B-D).
export const db = null;

/* ==========================================================================
   SESIÓN
   ========================================================================== */

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
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 60;
export const MAX_FAVORITOS = 300; // mismo tope que la tabla `favoritos`

const cacheRol = new Map(); // uid -> ROL.*  (se vacía al cerrar sesión)
const oyentes = new Set();
let usuario = null; // { uid, email, displayName } | null  (misma forma que el usuario de Firebase)
let sesionResuelta = false;
let registrando = false; // evita que el observador cree el perfil antes de tener el nombre
let cola = Promise.resolve(); // procesa los cambios de sesión de uno en uno

/** Equivale al `auth` de Firebase: solo se usa `auth.currentUser`. */
export const auth = {
  get currentUser() {
    return usuario;
  },
};

export function isAuthorized(user) {
  return !!user && cacheRol.get(user.uid) === ROL.PRINCIPAL;
}

export function watchAuth(callback) {
  oyentes.add(callback);
  if (sesionResuelta) queueMicrotask(() => callback(usuario));
}

function avisar() {
  for (const cb of oyentes) {
    try {
      cb(usuario);
    } catch (e) {
      console.error("Error en un observador de sesión:", e);
    }
  }
}

/* ---------- Acceso: «usuario o correo» ---------- */
// Supabase Auth exige un correo. Los alumnos que se registraron con un simple nombre de usuario
// tienen internamente un correo ficticio <usuario>@alumnos.dam-notes.local que nunca se muestra.
// Si lo escrito lleva «@» se usa tal cual (correo real); si no, se convierte igual que siempre.
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
    "auth/operation-not-allowed": "El registro con correo y contraseña no está activado.",
    "auth/email-not-confirmed": "La cuenta se ha creado pero hace falta confirmarla. Avisa al administrador.",
  };
  return m[code] || "Algo ha fallado. Inténtalo de nuevo.";
}

function errorAuth(code) {
  return Object.assign(new Error(code), { code });
}

// Traduce los errores de Supabase a los códigos «auth/…» que ya entiende mensajeErrorAuth().
function traducirError(e) {
  const c = e?.code || "";
  let code = "auth/error";
  if (c === "invalid_credentials") code = "auth/invalid-credential";
  else if (c === "user_already_exists" || c === "email_exists") code = "auth/email-already-in-use";
  else if (c === "weak_password") code = "auth/weak-password";
  else if (c === "over_request_rate_limit" || c === "over_email_send_rate_limit" || e?.status === 429) code = "auth/too-many-requests";
  else if (c === "user_banned") code = "auth/user-disabled";
  else if (c === "signup_disabled" || c === "email_provider_disabled") code = "auth/operation-not-allowed";
  else if (c === "email_not_confirmed") code = "auth/email-not-confirmed";
  else if (c === "validation_failed" || c === "email_address_invalid") code = "auth/invalid-email";
  else if (e?.name === "AuthRetryableFetchError" || e instanceof TypeError) code = "auth/network-request-failed";
  const err = errorAuth(code);
  err.original = e;
  return err;
}

const limpiarNombre = (n) => (n || "").replace(/\s+/g, " ").trim();

/* ---------- Perfil y rol de la sesión ---------- */

/** Rol del usuario: Admin Principal («propietario»), Admin inferior o Estudiante. */
async function consultarRol(uid) {
  const { data, error } = await supabase.from("roles").select("rol").eq("user_id", uid).maybeSingle();
  if (error) {
    console.warn("No se pudo leer el rol:", error);
    return ROL.USUARIO;
  }
  if (data?.rol === "propietario") return ROL.PRINCIPAL;
  if (data?.rol === "admin_inferior") return ROL.INFERIOR;
  return ROL.USUARIO;
}

export async function getRol(user, { forzar = false } = {}) {
  if (!user) return ROL.USUARIO;
  if (!forzar && cacheRol.has(user.uid)) return cacheRol.get(user.uid);
  const rol = await consultarRol(user.uid);
  cacheRol.set(user.uid, rol);
  return rol;
}

/**
 * Crea o completa la fila de `perfiles` del usuario. Si ya existe no pisa un nombre guardado.
 * Devuelve { id, nombre }.
 */
async function asegurarPerfil(u) {
  const { data, error } = await supabase.from("perfiles").select("id, nombre").eq("id", u.id).maybeSingle();
  if (error) throw error;
  const email = (u.email || "").toLowerCase();
  const nombreInicial =
    limpiarNombre(u.user_metadata?.nombre || (email.endsWith(`@${DOMINIO_USUARIO}`) ? email.split("@")[0] : email))
      .slice(0, NOMBRE_MAX) || "Sin nombre";
  if (data) {
    if (limpiarNombre(data.nombre)) return data;
    const { error: e2 } = await supabase
      .from("perfiles")
      .update({ nombre: nombreInicial, actualizado: new Date().toISOString() })
      .eq("id", u.id);
    if (e2) throw e2;
    return { id: u.id, nombre: nombreInicial };
  }
  const { error: e3 } = await supabase.from("perfiles").insert({ id: u.id, nombre: nombreInicial, email });
  if (e3) throw e3;
  return { id: u.id, nombre: nombreInicial };
}

// Deja `usuario` y la caché de rol al día para esta sesión y avisa a los observadores si cambió algo.
async function resolverSesion(sesion) {
  const u = sesion?.user || null;
  if (!u) {
    const habia = !!usuario || !sesionResuelta;
    usuario = null;
    cacheRol.clear();
    sesionResuelta = true;
    if (habia) avisar();
    return;
  }
  if (registrando) return; // register() lo hace cuando ya tiene el nombre
  const previo = usuario;
  let perfil = null;
  try {
    perfil = await asegurarPerfil(u);
  } catch (e) {
    console.warn("No se pudo sincronizar el perfil:", e); // no debe impedir el acceso
  }
  const rol = await consultarRol(u.id);
  cacheRol.set(u.id, rol);
  usuario = {
    uid: u.id,
    email: (u.email || "").toLowerCase(),
    displayName: perfil?.nombre || null,
  };
  sesionResuelta = true;
  if (!previo || previo.uid !== usuario.uid || previo.displayName !== usuario.displayName) avisar();
}

function procesarSesion(sesion) {
  cola = cola.then(() => resolverSesion(sesion)).catch((e) => console.warn("Error de sesión:", e));
  return cola;
}

// Importante: no se llama a Supabase DENTRO del callback (podría bloquearse); se difiere un tick.
supabase.auth.onAuthStateChange((evento, sesion) => {
  if (evento === "TOKEN_REFRESHED") return;
  setTimeout(() => procesarSesion(sesion), 0);
});

/** Inicia sesión. `identificador` es un correo o un nombre de usuario. */
export async function login(identificador, password) {
  const email = identificadorAEmail(identificador);
  if (!email) throw errorAuth("auth/invalid-email");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw traducirError(error);
  await procesarSesion(data.session);
}

/** Crea una cuenta (abierta a cualquiera) y deja la sesión iniciada. */
export async function register(identificador, password) {
  const bruto = (identificador || "").trim();
  const email = identificadorAEmail(bruto);
  if (!email) throw errorAuth("auth/invalid-email");
  registrando = true;
  try {
    // Con nombre de usuario (sin «@») se guarda tal cual lo escribió el alumno.
    const datos = bruto.includes("@") ? {} : { nombre: bruto };
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: datos } });
    if (error) throw traducirError(error);
    if (!data.session) throw errorAuth("auth/email-not-confirmed"); // «Confirm email» está activado
    registrando = false;
    await procesarSesion(data.session);
    return usuario;
  } finally {
    registrando = false;
  }
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw traducirError(error);
}

/** Guarda el nombre del perfil. Devuelve el nombre limpio. */
export async function guardarNombrePerfil(nombreBruto) {
  const user = auth.currentUser;
  if (!user) throw errorAuth("auth/requires-recent-login");
  const nombre = limpiarNombre(nombreBruto);
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    throw errorAuth("perfil/nombre-invalido");
  }
  const { error } = await supabase
    .from("perfiles")
    .update({ nombre, actualizado: new Date().toISOString() })
    .eq("id", user.uid);
  if (error) throw error;
  usuario = { ...usuario, displayName: nombre };
  document.dispatchEvent(new CustomEvent("auth:perfil-actualizado"));
  return nombre;
}

/**
 * ¿Puede publicar/editar exámenes y tareas GLOBALES del calendario?
 * Admin Principal o Admin inferior. Es lo único para lo que sirve el Admin inferior.
 */
export async function puedeGestionarCalendarioGlobal(user) {
  return (await getRol(user)) !== ROL.USUARIO;
}

/* ==========================================================================
   ORDEN DEL ÁRBOL  (tabla sitio_orden, una sola fila con id = 'order')
   ========================================================================== */

/** Devuelve el mapa { pathKey: [nombres en orden] } guardado, o {} si no hay nada. */
export async function loadOrder() {
  try {
    const { data, error } = await supabase.from("sitio_orden").select("datos").eq("id", "order").maybeSingle();
    if (error) throw error;
    return data?.datos && typeof data.datos === "object" ? data.datos : {};
  } catch (e) {
    console.warn("No se pudo leer el orden guardado:", e);
    return {};
  }
}

/** Fusiona el nuevo orden de una carpeta concreta con el que ya había. Solo el Admin Principal. */
export async function saveOrderForPath(pathKey, orderedNames) {
  const actual = await loadOrder();
  const datos = { ...actual, [pathKey]: orderedNames };
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from("sitio_orden")
    .update({ datos, actualizado: ahora })
    .eq("id", "order")
    .select("id");
  if (error) throw error;
  if (data && data.length) return;
  const { error: e2 } = await supabase.from("sitio_orden").insert({ id: "order", datos, actualizado: ahora });
  if (e2) throw e2;
}

/* ==========================================================================
   ADMINISTRACIÓN DE USUARIOS (solo Admin Principal)
   ========================================================================== */

/** Todos los perfiles salvo el del propio Admin Principal, con su estado de Admin inferior. */
export async function listarUsuarios() {
  const yo = auth.currentUser;
  if (!isAuthorized(yo)) throw errorAuth("permission-denied");
  const [perfiles, roles] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email"),
    supabase.from("roles").select("user_id, rol"),
  ]);
  if (perfiles.error) throw perfiles.error;
  if (roles.error) throw roles.error;
  const inferiores = new Set(roles.data.filter((r) => r.rol === "admin_inferior").map((r) => r.user_id));
  const lista = perfiles.data
    .filter((p) => p.id !== yo.uid)
    .map((p) => ({
      uid: p.id,
      nombre: typeof p.nombre === "string" ? p.nombre : "",
      email: typeof p.email === "string" ? p.email : "",
      adminInferior: inferiores.has(p.id),
    }));
  return lista.sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, "es"));
}

/** Concede (true) o revoca (false) el rol de Admin inferior. Solo el Admin Principal. */
export async function fijarAdminInferior(uid, activo) {
  const yo = auth.currentUser;
  if (!isAuthorized(yo) || !uid || uid === yo.uid) throw errorAuth("permission-denied");
  if (!activo) {
    const { error } = await supabase.from("roles").delete().eq("user_id", uid).eq("rol", "admin_inferior");
    if (error) throw error;
    return;
  }
  const ya = await supabase.from("roles").select("user_id").eq("user_id", uid).maybeSingle();
  if (ya.error) throw ya.error;
  const { error } = ya.data
    ? await supabase
        .from("roles")
        .update({ rol: "admin_inferior", asignado_por: yo.uid, actualizado: new Date().toISOString() })
        .eq("user_id", uid)
    : await supabase.from("roles").insert({ user_id: uid, rol: "admin_inferior", asignado_por: yo.uid });
  if (error) throw error;
}

/* ==========================================================================
   FAVORITOS  (tabla favoritos: user_id, rutas[], ts)
   Solo el propio usuario puede leerlos y escribirlos (políticas RLS).
   ========================================================================== */

/** Rutas favoritas de la cuenta, o null si todavía no hay fila. */
export async function cargarFavoritosNube(user) {
  const { data, error } = await supabase.from("favoritos").select("rutas").eq("user_id", user.uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rutas = data.rutas;
  return Array.isArray(rutas) ? [...new Set(rutas.filter((r) => typeof r === "string"))] : [];
}

export async function guardarFavoritosNube(user, rutas) {
  if (rutas.length > MAX_FAVORITOS) {
    throw new Error(`Solo se pueden guardar ${MAX_FAVORITOS} favoritos en la cuenta.`);
  }
  const { error } = await supabase.from("favoritos").upsert({ user_id: user.uid, rutas, ts: Date.now() });
  if (error) throw error;
}
