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
//   4. SDK de Firebase (gstatic.com/firebasejs/…): caché primero (la URL lleva la versión).
//   5. Apuntes (DAM/…): según manifest.json se guardan solos los de hasta LIMITE_PRECACHE bytes
//      (con la misma URL «?v=huella» que pide la web) y se borran las versiones viejas. Los grandes
//      (los «Libro.html») se guardan la primera vez que se abren.
//
// Al cambiar ESTE archivo, sube VERSION para que los móviles descarten la caché anterior.

const VERSION = 'v2';
const CACHE = `apuntes-dam-${VERSION}`;
const ESPERA_RED_MS = 4000; // con mala cobertura, tras 4 s se usa la copia guardada
const LIMITE_PRECACHE = 300 * 1024; // bytes: los apuntes más pequeños se guardan para uso offline

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
      .then(() => Promise.all([self.skipWaiting(), sincronizarApuntes()]))
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

const HEX = /^[0-9a-f]{1,64}$/;
let sincronizando = null;

// Misma URL que construye contenidoUrl() en app.js: ruta codificada + «?v=huella».
function urlApunte(ruta, h) {
  const u = new URL(ruta.split('/').map(encodeURIComponent).join('/'), self.registration.scope);
  u.searchParams.set('v', h);
  return u;
}

async function sincronizarTarea() {
  const res = await fetch('manifest.json', { cache: 'no-cache' });
  if (!res.ok) return;
  const { files } = await res.json();
  if (!Array.isArray(files)) return;
  const cache = await caches.open(CACHE);
  const items = files
    .filter((f) => f && typeof f.path === 'string' && f.path.startsWith('DAM/') && HEX.test(f.h))
    .map((f) => ({ u: urlApunte(f.path, f.h), s: f.s }));
  const vigente = new Map(items.map(({ u }) => [u.pathname, u.href]));
  for (const req of await cache.keys()) { // fuera las huellas antiguas de un mismo apunte
    const u = new URL(req.url);
    if (vigente.has(u.pathname) && vigente.get(u.pathname) !== u.href) await cache.delete(req);
  }
  const nuevos = [];
  for (const { u, s } of items) {
    if (typeof s === 'number' && s <= LIMITE_PRECACHE && !(await cache.match(u.href))) nuevos.push(u.href);
  }
  await Promise.allSettled(nuevos.map((href) => cache.add(href)));
}

// Una sola sincronización a la vez; si falla (sin red, etc.) no pasa nada: se reintenta en la próxima carga.
function sincronizarApuntes() {
  if (!sincronizando) sincronizando = sincronizarTarea().catch(() => {}).finally(() => { sincronizando = null; });
  return sincronizando;
}

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
    const u = new URL(req.url);
    if (u.searchParams.has('v')) await podarAntiguas(cache, u);
  }
  return res;
}

// Un archivo con «?v=» nuevo hace inútiles sus versiones anteriores: se borran para que la caché no crezca sin fin.
async function podarAntiguas(cache, u) {
  for (const k of await cache.keys()) {
    const o = new URL(k.url);
    if (o.pathname === u.pathname && o.search !== u.search) await cache.delete(k);
  }
}

// SDK de Firebase (gstatic.com): la URL lleva la versión (10.13.0), así que nunca cambia: caché primero.
async function cachePrimeroSdk(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req, { ignoreVary: true });
  if (copia) return copia;
  const res = await fetch(req);
  if (res.ok && res.status === 200 && (res.type === 'cors' || res.type === 'basic')) await cache.put(req, res.clone());
  return res;
}

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req, { ignoreSearch: false });
  // Un error del servidor (404, 5xx) no sustituye a la copia guardada; las redirecciones de navegación sí pasan.
  const red = fetch(req).then((res) => (copia && !res.ok && res.type !== 'opaqueredirect' ? copia : guardar(req, res)));
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
  const esSdk = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (esSdk) { event.respondWith(cachePrimeroSdk(req)); return; }
  if (url.origin !== self.location.origin) return; // Firebase (datos), GitHub API, Cloudinary…: sin tocar

  if (esRedPrimero(req, url)) {
    if (url.pathname.endsWith('/manifest.json')) event.waitUntil(sincronizarApuntes());
    event.respondWith(redPrimero(req));
  } else if (url.searchParams.has('v')) {
    event.respondWith(cachePrimero(req));
  } else {
    event.respondWith(renovarEnSegundoPlano(req));
  }
});