// mobile-cuenta.js
// Pantalla «Cuenta» de la UI móvil. No reimplementa la autenticación: pinta el estado de la sesión y
// abre los modales que ya existen (#modal-auth y #modal-perfil, controlados por acceso-ui.js).
//
//   · Sin sesión → botón que abre el modal de acceso (que ya trae las pestañas Entrar / Crear cuenta).
//   · Con sesión → nombre, rol y dos acciones: «Editar perfil» (abre «Mi cuenta», donde además está la
//     gestión de usuarios del Admin Principal) y «Cerrar sesión».
//   · Siempre → fila «Instalar app», que refleja el botón #btn-instalar de pwa.js (aparece y desaparece
//     con él) y lo pulsa: así la lógica de instalación vive en un único sitio.
//
// Seguridad: texto siempre con textContent (el nombre lo escribe el propio usuario); las acciones salen
// de una lista blanca; solo se «pulsan» dos botones del DOM con ID fijo; la sesión no se toca salvo vía logout().

import { el } from './dom.js';
import {
  auth, watchAuth, isAuthorized, nombreVisible, correoVisible, logout, ROL, getRol,
} from './firebase-init.js?v=aaf9a4ae'; // misma URL que app.js: comparte instancia

const ACCIONES = Object.freeze(['acceder', 'perfil', 'salir', 'instalar']);
const ETIQUETA_ROL = Object.freeze({
  [ROL.PRINCIPAL]: 'Admin Principal',
  [ROL.INFERIOR]: 'Admin inferior',
  [ROL.USUARIO]: 'Estudiante',
});

// Los disparadores originales viven en la barra de actividad (oculta en móvil), pero siguen en el DOM
// y conservan sus listeners: pulsarlos por código abre el modal correspondiente (o el instalador).
const DISPARADOR = Object.freeze({ acceder: 'btn-auth-trigger', perfil: 'btn-perfil-trigger', instalar: 'btn-instalar' });

function pulsarDisparador(accion) {
  const boton = document.getElementById(DISPARADOR[accion]);
  if (boton instanceof HTMLButtonElement) boton.click();
}

const inicial = (nombre) => (Array.from(nombre.trim())[0] ?? '?').toUpperCase();

function vistaAnonima() {
  const tarjeta = el('div', 'm-cuenta-card');
  const boton = el('button', 'm-btn-primario', 'Iniciar sesión o crear cuenta');
  boton.type = 'button';
  boton.dataset.mCuenta = 'acceder';
  tarjeta.append(
    el('h2', 'm-cuenta-titulo', 'Accede a tu cuenta'),
    el('p', 'm-cuenta-texto',
      'Con una cuenta, tus favoritos, tus tareas hechas y tus eventos personales se guardan también en tu cuenta.'),
    boton,
  );
  return [tarjeta];
}

function vistaConSesion(user, refs) {
  const nombre = nombreVisible(user);

  const avatar = el('span', 'm-avatar', inicial(nombre));
  avatar.setAttribute('aria-hidden', 'true');
  const rol = el('span', 'm-rol', ETIQUETA_ROL[isAuthorized(user) ? ROL.PRINCIPAL : ROL.USUARIO]);
  refs.rol = rol; // se actualiza cuando llega el rol real desde Firestore
  const datos = el('div', 'm-perfil-datos');
  datos.append(el('span', 'm-perfil-nombre', nombre), el('span', 'm-perfil-correo', correoVisible(user)), rol);
  const perfil = el('div', 'm-perfil');
  perfil.append(avatar, datos);

  const editar = el('button', 'm-fila', 'Editar perfil');
  editar.type = 'button';
  editar.dataset.mCuenta = 'perfil';
  const salir = el('button', 'm-fila m-fila--peligro', 'Cerrar sesión');
  salir.type = 'button';
  salir.dataset.mCuenta = 'salir';
  const lista = el('div', 'm-lista');
  lista.append(editar, salir);

  const error = el('p', 'm-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  refs.error = error;

  return [perfil, lista, error];
}

export function iniciarCuenta(raiz) {
  const slot = raiz.querySelector('[data-m-slot="cuenta"]');
  const estado = raiz.querySelector('#m-cuenta-estado');
  if (!slot) return;

  let refs = {};

  // Dos zonas: la de sesión se repinta con cada cambio; la de «Instalar app» es fija.
  const zonaSesion = el('div');
  const zonaApp = el('div', 'm-cuenta-app');
  const instalar = el('button', 'm-fila', 'Instalar app');
  instalar.type = 'button';
  instalar.dataset.mCuenta = 'instalar';
  const listaApp = el('div', 'm-lista');
  listaApp.append(instalar);
  zonaApp.append(listaApp);
  slot.replaceChildren(zonaSesion, zonaApp);

  // Refleja el estado del botón original: si pwa.js lo oculta (app ya instalada), la fila también desaparece.
  const botonInstalar = document.getElementById(DISPARADOR.instalar);
  const sincronizarInstalar = () => { zonaApp.hidden = !botonInstalar || botonInstalar.hidden; };
  sincronizarInstalar();
  if (botonInstalar) {
    new MutationObserver(sincronizarInstalar).observe(botonInstalar, { attributes: true, attributeFilter: ['hidden'] });
  }

  const pintar = (user) => {
    refs = {};
    if (estado) estado.textContent = user ? 'Sesión iniciada' : 'Sin sesión';
    zonaSesion.replaceChildren(...(user ? vistaConSesion(user, refs) : vistaAnonima()));
    if (user && !isAuthorized(user)) {
      getRol(user).then((rolReal) => {
        if (auth.currentUser?.uid !== user.uid || !refs.rol) return; // la sesión cambió mientras tanto
        refs.rol.textContent = ETIQUETA_ROL[rolReal] ?? ETIQUETA_ROL[ROL.USUARIO];
      });
    }
  };

  slot.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    const origen = e.target instanceof Element ? e.target : null;
    const boton = origen?.closest('[data-m-cuenta]');
    if (!boton || !slot.contains(boton)) return;
    const accion = boton.dataset.mCuenta;
    if (!ACCIONES.includes(accion)) return;

    if (accion === 'salir') {
      boton.disabled = true;
      try {
        await logout();                       // watchAuth repinta la pantalla
      } catch (err) {
        console.warn('No se pudo cerrar sesión:', err);
        boton.disabled = false;
        if (refs.error) { refs.error.textContent = 'No se pudo cerrar sesión. Inténtalo de nuevo.'; refs.error.hidden = false; }
      }
      return;
    }
    pulsarDisparador(accion);
  });

  watchAuth(pintar);
  // «Mi cuenta» avisa con este evento cuando cambia el nombre.
  document.addEventListener('auth:perfil-actualizado', () => pintar(auth.currentUser));
}
