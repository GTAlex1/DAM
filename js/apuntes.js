// apuntes.js
// Módulo de apuntes: subida a Cloudinary + metadatos en Firestore + panel de la interfaz.

import {
  collection, query, where, onSnapshot, addDoc, getDocs, updateDoc, deleteDoc, writeBatch, serverTimestamp, doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  auth, db, watchAuth, isAuthorized,
} from "./firebase-core.js?v=c4e3345d";
import { el } from "./dom.js?v=fab76259";
import { planReordenPropio } from "./utils.js?v=87294434";

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
  "Bases-de-Datos",
  "Entornos-de-Desarrollo",
  "Lenguajes-de-Marcas",
  "Sistemas-Informaticos",
  "Digitalizacion",
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

/** Reordenar para el AUTOR de los archivos (no admin): solo escribe en documentos suyos. */
async function reordenarPropio(grupo, id, delta, uid) {
  const cambios = planReordenPropio(grupo, id, delta, uid);
  if (!cambios.length) return;
  const batch = writeBatch(db);
  for (const c of cambios) batch.update(doc(db, APUNTES_COLECCION, c.id), { orden: c.orden });
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
  let autorizado = false; // Admin Principal (AUTHORIZED_UID): gestiona TODOS los archivos
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
  // Gestionar un archivo (mover, reordenar, quitar): el Admin Principal o quien lo subió.
  const esMio = (it) => !!user && it.creado_por === user.uid;
  const puedeGestionar = (it) => autorizado || esMio(it);

  function crearControles(it, posicion, total) {
    // El autor (no admin) solo reordena entre SUS archivos: los extremos se miden entre ellos.
    const propios = autorizado ? null : grupoDe(it.asignatura || SIN_CLASIFICAR).filter(esMio);
    const lugar = propios ? propios.findIndex((x) => x.id === it.id) : posicion;
    const cuantos = propios ? propios.length : total;
    const gestion = el("div", "fbap-manage");

    const btnSubirPos = el("button", "fbap-btn fbap-icon-btn");
    btnSubirPos.type = "button";
    btnSubirPos.dataset.accion = "subir";
    btnSubirPos.title = "Subir posición";
    btnSubirPos.setAttribute("aria-label", "Subir posición");
    btnSubirPos.innerHTML = ICONO_SUBIR;
    btnSubirPos.disabled = lugar === 0;

    const btnBajarPos = el("button", "fbap-btn fbap-icon-btn");
    btnBajarPos.type = "button";
    btnBajarPos.dataset.accion = "bajar";
    btnBajarPos.title = "Bajar posición";
    btnBajarPos.setAttribute("aria-label", "Bajar posición");
    btnBajarPos.innerHTML = ICONO_BAJAR;
    btnBajarPos.disabled = lugar === cuantos - 1;

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

    if (puedeGestionar(it)) li.append(crearControles(it, posicion, total));
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
    if (!boton || ocupado) return;
    const it = items.find((x) => x.id === boton.closest("li")?.dataset.id);
    if (!it || !puedeGestionar(it)) return;
    if (boton.dataset.accion === "eliminar") {
      if (!confirm(`¿Quitar «${it.nombre}» de la lista?\n\nEl archivo seguirá en Cloudinary; solo desaparece de la web.`)) return;
      foco = null;
      await ejecutar(() => eliminarApunte(it.id), "Archivo eliminado de la lista.");
      return;
    }
    foco = { id: it.id, accion: boton.dataset.accion };
    const grupo = grupoDe(it.asignatura || SIN_CLASIFICAR);
    const delta = boton.dataset.accion === "subir" ? -1 : 1;
    await ejecutar(
      () => (autorizado ? reordenarApunte(grupo, it.id, delta) : reordenarPropio(grupo, it.id, delta, user.uid)),
      "Posición actualizada."
    );
  });

  // Mover a otra asignatura
  grupos.addEventListener("change", async (e) => {
    const select = e.target.closest("select[data-accion='mover']");
    if (!select || !select.value || ocupado) return;
    const destino = select.value;
    const it = items.find((x) => x.id === select.closest("li")?.dataset.id);
    if (!it || !DESTINOS.includes(destino) || !puedeGestionar(it)) return;
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