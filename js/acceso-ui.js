// acceso-ui.js
// Interfaz de cuenta: modal de acceso, «Mi cuenta» y gestión de usuarios (solo Admin Principal).
// No exporta nada: al importarlo se activa solo si la página incluye el marcado correspondiente.

import {
  auth, ROL, ETIQUETA_ROL, NOMBRE_MIN, NOMBRE_MAX, AUTHORIZED_UID,
  watchAuth, isAuthorized, nombreVisible, correoVisible, formatearCorreo, mensajeErrorAuth,
  login, register, logout, guardarNombrePerfil, getRol, listarUsuarios, fijarAdminInferior,
} from "./firebase-core.js?v=1";
import { crearControlModal } from "./modal.js?v=1";
import { el } from "./dom.js?v=1";

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
