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
// 8. En cada página de asignatura, añade el <div id="firebase-apuntes"
//    data-asignatura="..."> y este mismo script (ver ejemplo HTML).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
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
   MÓDULO DE APUNTES  (archivos en Cloudinary + metadatos en Firestore)

   Uso en cualquier página de asignatura:
     <div id="firebase-apuntes" class="fbap" data-asignatura="Programacion"></div>
     <script type="module" src=".../firebase-init.js"></script>

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

/** Error devuelto por Cloudinary (para distinguirlo de fallos de Firestore o de red). */
class ErrorCloudinary extends Error {}

/* ---------- Utilidades ---------- */

function extensionDe(nombre) {
  const m = /\.([^.]+)$/.exec(nombre);
  return m ? m[1].toLowerCase() : "";
}

/** ID determinista: volver a subir el mismo nombre sustituye el registro de la lista. */
function idApunte(asignatura, nombre) {
  return `${encodeURIComponent(asignatura)}__${encodeURIComponent(nombre)}`;
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

/* ---------- Cloudinary + Firestore: subir y escuchar ---------- */

/**
 * 1) Sube el archivo a Cloudinary (subida sin firma, con fetch + FormData).
 * 2) Con la secure_url devuelta, guarda los metadatos en Firestore.
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

  await setDoc(doc(db, APUNTES_COLECCION, idApunte(asignatura, nombre)), {
    nombre,
    url: data.secure_url,
    tipo,
    asignatura,
    fecha: serverTimestamp(),
  });
  return nombre;
}

/**
 * Escucha en tiempo real los apuntes de una asignatura.
 * Ordenamos aquí (más recientes primero) y no con orderBy: combinar where + orderBy
 * en campos distintos obligaría a crear un índice compuesto en la consola.
 */
function escucharApuntes(asignatura, onData, onError) {
  const q = query(collection(db, APUNTES_COLECCION), where("asignatura", "==", asignatura));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data({ serverTimestamps: "estimate" }),
      }));
      items.sort((a, b) => (b.fecha?.toMillis?.() ?? 0) - (a.fecha?.toMillis?.() ?? 0));
      onData(items);
    },
    onError
  );
}

/* ---------- Interfaz ---------- */

function initApuntes(root) {
  const asignatura = (root.dataset.asignatura || "").trim();
  root.classList.add("fbap");

  root.innerHTML = `
    <div class="fbap-head">
      <h2 class="fbap-title" data-fbap="titulo"></h2>
      <button type="button" class="fbap-btn fbap-btn-quiet" data-fbap="auth" hidden>Iniciar sesión</button>
    </div>
    <p class="fbap-hint">Archivos PDF y HTML de esta asignatura.</p>

    <form class="fbap-panel" data-fbap="login" hidden>
      <div class="fbap-row">
        <input class="fbap-input" type="email" name="email" placeholder="Email" autocomplete="username" required aria-label="Email">
        <input class="fbap-input" type="password" name="password" placeholder="Contraseña" autocomplete="current-password" required aria-label="Contraseña">
        <button type="submit" class="fbap-btn fbap-btn-primary">Entrar</button>
      </div>
      <p class="fbap-status" data-fbap="login-msg" role="status"></p>
    </form>

    <p class="fbap-panel fbap-noperm" data-fbap="noperm" hidden>Esta cuenta no tiene permiso para subir archivos.</p>

    <form class="fbap-panel" data-fbap="upload" hidden>
      <div class="fbap-row">
        <input class="fbap-input fbap-file" type="file" name="archivo" accept=".pdf,.html,application/pdf,text/html" required aria-label="Archivo PDF o HTML">
        <button type="submit" class="fbap-btn fbap-btn-primary" data-fbap="upload-btn">Subir archivo</button>
      </div>
      <div class="fbap-progress" data-fbap="progress" role="progressbar" aria-label="Subiendo archivo" hidden>
        <div class="fbap-progress-bar"></div>
      </div>
      <p class="fbap-status" data-fbap="upload-msg" role="status">Máximo ${MAX_MB} MB. Si subes un archivo con el mismo nombre, sustituye al anterior en la lista.</p>
    </form>

    <p class="fbap-empty" data-fbap="vacio">Cargando archivos…</p>
    <ul class="fbap-list" data-fbap="lista"></ul>
  `;

  const $ = (name) => root.querySelector(`[data-fbap="${name}"]`);
  const titulo = $("titulo");
  const btnAuth = $("auth");
  const formLogin = $("login");
  const msgLogin = $("login-msg");
  const avisoSinPermiso = $("noperm");
  const formSubida = $("upload");
  const btnSubir = $("upload-btn");
  const msgSubida = $("upload-msg");
  const progreso = $("progress");
  const vacio = $("vacio");
  const lista = $("lista");

  const setMsg = (node, texto, tipo = "") => {
    node.textContent = texto;
    node.dataset.tipo = tipo; // "", "ok" o "err"
  };

  // Sin asignatura válida no tiene sentido continuar.
  if (!asignatura || asignatura.includes("/")) {
    titulo.textContent = "Archivos";
    vacio.textContent =
      'Falta el atributo data-asignatura (sin barras "/") en el contenedor #firebase-apuntes.';
    return;
  }
  titulo.textContent = `Archivos de ${asignatura}`;

  /* --- Sesión --- */
  let user = null;
  let loginAbierto = false;

  function pintarSesion() {
    const autorizado = isAuthorized(user);
    btnAuth.hidden = false;
    btnAuth.textContent = user ? "Cerrar sesión" : "Iniciar sesión";
    formLogin.hidden = !!user || !loginAbierto;
    avisoSinPermiso.hidden = !(user && !autorizado);
    formSubida.hidden = !autorizado;
  }

  watchAuth((u) => {
    user = u;
    pintarSesion();
  });

  btnAuth.addEventListener("click", async () => {
    if (user) {
      await logout();
    } else {
      loginAbierto = !loginAbierto;
      pintarSesion();
      if (loginAbierto) formLogin.elements.email.focus();
    }
  });

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg(msgLogin, "Entrando…");
    try {
      await login(formLogin.elements.email.value.trim(), formLogin.elements.password.value);
      formLogin.reset();
      setMsg(msgLogin, "");
      loginAbierto = false;
      pintarSesion();
    } catch (err) {
      console.warn("Login fallido:", err);
      setMsg(msgLogin, "Email o contraseña incorrectos.", "err");
    }
  });

  /* --- Subida --- */
  formSubida.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = formSubida.elements.archivo.files[0];
    if (!file) return setMsg(msgSubida, "Elige un archivo.", "err");

    if (!TIPOS_PERMITIDOS.includes(extensionDe(file.name))) {
      return setMsg(msgSubida, "Solo se admiten archivos .pdf y .html.", "err");
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return setMsg(msgSubida, `El archivo supera el límite de ${MAX_MB} MB.`, "err");
    }

    btnSubir.disabled = true;
    progreso.hidden = false; // fetch no informa del porcentaje: barra indeterminada
    setMsg(msgSubida, "Subiendo…");

    try {
      const nombre = await subirApunte(asignatura, file);
      formSubida.reset();
      setMsg(msgSubida, `Archivo subido: ${nombre}`, "ok");
    } catch (err) {
      console.error("Error al subir el apunte:", err);
      let texto = "No se pudo subir el archivo. Revisa la consola del navegador.";
      if (err instanceof ErrorCloudinary) {
        texto = `Cloudinary rechazó el archivo: ${err.message}`;
      } else if (err?.code === "permission-denied") {
        texto = "Cloudinary lo aceptó, pero Firestore denegó el registro. Revisa la sesión y las reglas.";
      } else if (err?.name === "TimeoutError") {
        texto = "La subida tardó demasiado. Inténtalo de nuevo.";
      } else if (err instanceof TypeError) {
        texto = "No se pudo conectar con Cloudinary. Revisa tu conexión.";
      }
      setMsg(msgSubida, texto, "err");
    } finally {
      btnSubir.disabled = false;
      progreso.hidden = true;
    }
  });

  /* --- Listado en tiempo real --- */
  function pintarLista(items) {
    lista.replaceChildren();
    vacio.hidden = items.length > 0;
    vacio.textContent = "Aún no hay archivos para esta asignatura.";

    for (const it of items) {
      if (!urlSegura(it.url)) continue;
      const tipo = it.tipo === "pdf" ? "pdf" : "html";

      const li = el("li", `fbap-item fbap-item--${tipo}`);
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
      lista.append(li);
    }
    if (items.length && !lista.children.length) {
      vacio.hidden = false;
      vacio.textContent = "No hay archivos válidos que mostrar.";
    }
  }

  /**
   * "Descargar": el atributo `download` lo ignoran los navegadores con URLs de otro
   * origen, así que intentamos bajar el archivo como blob (así conserva su nombre
   * original). Si la petición falla, abrimos el archivo en otra pestaña.
   */
  lista.addEventListener("click", async (e) => {
    const enlace = e.target.closest("a[data-descargar]");
    if (!enlace) return;
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
  });

  escucharApuntes(asignatura, pintarLista, (err) => {
    console.error("Error al leer los apuntes:", err);
    vacio.hidden = false;
    vacio.textContent = "No se pudo cargar la lista de archivos.";
  });
}

const contenedorApuntes = document.getElementById("firebase-apuntes");
if (contenedorApuntes) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initApuntes(contenedorApuntes));
  } else {
    initApuntes(contenedorApuntes);
  }
}
