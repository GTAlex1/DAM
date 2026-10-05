// pwa.js — registro del service worker y botón «Instalar app» (debajo de la estrella de favoritos).
//
// - Android / Chrome / Edge: el navegador avisa con «beforeinstallprompt»; el botón lanza el
//   cuadro de instalación nativo con un solo toque.
// - iPhone / iPad: Apple no permite instalar desde código; el botón abre una pequeña guía con
//   los pasos de «Añadir a pantalla de inicio».
// - Si la app ya está instalada (se abrió desde el icono), el botón no aparece.
import { crearControlModal } from './modal.js?v=1';

// ---------- Service worker ----------
// Ruta relativa: en GitHub Pages queda con alcance /DAM/ y no afecta a otros sitios.
if ('serviceWorker' in navigator) {
  const registrar = () => navigator.serviceWorker.register('service-worker.js')
    .catch((err) => console.warn('No se pudo registrar el service worker:', err));
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar);
}

// ---------- Botón «Instalar app» ----------
const boton = document.getElementById('btn-instalar');
const modal = document.getElementById('modal-instalar');

const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS se hace pasar por Mac
const esAndroid = () => /android/i.test(navigator.userAgent);

if (boton && modal && !yaInstalada()) {
  const control = crearControlModal(modal);
  const pasosIOS = modal.querySelector('#instalar-ios');
  const pasosOtros = modal.querySelector('#instalar-otros');
  let aviso = null; // evento «beforeinstallprompt» guardado (solo sirve para un uso)

  const mostrar = () => { boton.hidden = false; };
  const ocultar = () => { boton.hidden = true; };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // evita la mini-barra automática: el usuario decide con nuestro botón
    aviso = e;
    mostrar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    ocultar();
    control.cerrar();
  });

  if (esIOS()) {
    mostrar();
  } else if (esAndroid()) {
    // Si Chrome aún no ha mandado el aviso (o el navegador no lo soporta), ofrecemos la guía manual.
    setTimeout(mostrar, 3000);
  }

  boton.addEventListener('click', async () => {
    if (aviso) {
      const guardado = aviso;
      aviso = null;
      try {
        await guardado.prompt();
        const { outcome } = await guardado.userChoice;
        if (outcome === 'accepted') ocultar();
      } catch (err) {
        console.warn('No se pudo mostrar el instalador:', err);
        control.abrir();
      }
      return;
    }
    // Sin instalador nativo disponible: guía paso a paso según el dispositivo.
    const ios = esIOS();
    if (pasosIOS) pasosIOS.hidden = !ios;
    if (pasosOtros) pasosOtros.hidden = ios;
    control.abrir();
  });
}
