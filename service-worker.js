// service-worker.js
// Hace que la web se pueda instalar y abrir sin conexión, SIN quedarse con versiones viejas.
//
// Reglas (solo para peticiones GET del propio sitio; todo lo demás —Firebase, Google, GitHub,
// Cloudinary— pasa directo a la red y este archivo no lo toca):
//   1. Páginas (index.html) y manifest.json / search-index.json: RED PRIMERO. Si hay conexión,
//      siempre ves lo último que hayas subido a GitHub; si no, se usa la copia guardada.
//   2. Archivos con «?v=…» (js, css y apuntes con huella): CACHÉ PRIMERO. La URL cambia cuando
//      cambia el contenido, así que la copia guardada nunca está desfasada.
//   3. Resto (librerías de vendor/, iconos…): usa la copia y la renueva en segundo plano.
//
// Al cambiar ESTE archivo, sube VERSION para que los móviles descarten la caché anterior.

const VERSION = 'v1';
const CACHE = `apuntes-dam-${VERSION}`;
const ESPERA_RED_MS = 4000; // con mala cobertura, tras 4 s se usa la copia guardada

// Lo mínimo para que la app abra sin conexión la primera vez tras instalarla.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'css/vendor/vs2015.min.css',
  'js/vendor/marked.min.js',
  'js/vendor/purify.min.js',
  'js/vendor/highlight.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Si un archivo de la lista falla, la instalación no debe romperse entera.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k.startsWith('apuntes-dam-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const esRedPrimero = (req, url) =>
  req.mode === 'navigate'
  || url.pathname.endsWith('/manifest.json')
  || url.pathname.endsWith('/search-index.json')
  || url.pathname.endsWith('/index.html');

async function guardar(req, res) {
  // Solo respuestas correctas y completas (no 404, no opacas, no parciales).
  if (res && res.ok && res.status === 200 && res.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone());
  }
  return res;
}

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req, { ignoreSearch: false });
  const red = fetch(req).then((res) => guardar(req, res));
  if (!copia) return red; // primera vez: no hay alternativa
  const limite = new Promise((resolve) => setTimeout(() => resolve(copia), ESPERA_RED_MS));
  // Gana la red si responde a tiempo; si falla o tarda demasiado, la copia.
  return Promise.race([red.catch(() => copia), limite]);
}

async function cachePrimero(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req);
  if (copia) return copia;
  const res = await fetch(req);
  return guardar(req, res);
}

async function renovarEnSegundoPlano(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req);
  const red = fetch(req).then((res) => guardar(req, res)).catch(() => copia);
  return copia || red;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, GitHub API, Cloudinary…: sin tocar

  if (esRedPrimero(req, url)) {
    event.respondWith(redPrimero(req));
  } else if (url.searchParams.has('v')) {
    event.respondWith(cachePrimero(req));
  } else {
    event.respondWith(renovarEnSegundoPlano(req));
  }
});
