// pwa.js — registra el service worker (instalación y uso sin conexión).
// Ruta relativa: en GitHub Pages queda con alcance /DAM/ y no afecta a otros sitios.
if ('serviceWorker' in navigator) {
  const registrar = () => navigator.serviceWorker.register('service-worker.js')
    .catch((err) => console.warn('No se pudo registrar el service worker:', err));
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar);
}
