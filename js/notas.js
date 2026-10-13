// notas.js
// Cómo se muestra una nota HTML dentro de un <iframe>: qué permisos tiene (sandbox) y cómo se prepara el srcdoc.
// Lo usan la web de escritorio (app.js) y la de móvil (mobile-apuntes.js, mobile-calendario.js), para que
// las dos apliquen EXACTAMENTE la misma lista de notas de confianza.
import { esc, localizarOcurrencia } from './utils.js?v=4733983d';

// Las notas HTML se pintan en un <iframe srcdoc>. Con `allow-same-origin` la nota comparte
// origen con la web y puede leer la sesión de Firebase (incluida la del administrador),
// así que ese permiso se reserva a las notas de esta lista, que SÍ lo necesitan:
//   - horario / calendario / entornos-desarrollo: usan la cuenta de Firebase.
//   - Lenguajes-de-Marcas/Libro.html: guarda el progreso en Firestore (cuenta de Firebase).
// Cualquier otra nota (incluida una nueva) se ejecuta sin `allow-same-origin`: puede
// mostrar contenido y ejecutar sus scripts, pero en un origen aislado sin acceso a la sesión.
// Estas rutas deben coincidir EXACTAMENTE con las del repo. Revisa cualquier cambio en
// estos archivos con el mismo cuidado que en js/ (ver .github/CODEOWNERS).
const NOTAS_CONFIABLES = new Set([
  'DAM/1-DAM/Horario.html',
  'DAM/1-DAM/Calendario.html',
  'DAM/1-DAM/Entornos-de-Desarrollo/Libro.html',
  'DAM/1-DAM/Lenguajes-de-Marcas/Libro.html',
]);

const SANDBOX_CONFIABLE = 'allow-same-origin allow-scripts allow-popups allow-forms';
const SANDBOX_AISLADA = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';

export function sandboxPara(path) {
  return NOTAS_CONFIABLES.has(path) ? SANDBOX_CONFIABLE : SANDBOX_AISLADA;
}

// Color del resaltado (CSS Custom Highlight). Se inyecta también en cada nota.
const ESTILO_RESALTADO = '<style>::highlight(busqueda-apuntes){background-color:#f5c518;color:#000;}</style>';

const SCRIPT_NOTA = `<script>
window.addEventListener('load', function () {
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    var destino = id ? document.getElementById(id) : null;
    if (destino) destino.scrollIntoView(); else if (!id) document.documentElement.scrollTop = 0;
  });
});

${localizarOcurrencia.toString()}

// Desde el buscador: la web padre pide localizar la aparición nº k del texto buscado.
// Solo se aceptan mensajes del padre. Se reintenta unas veces por si la nota pinta su contenido
// con retraso (p. ej. tras cargar datos de la cuenta).
window.addEventListener('message', function (e) {
  if (e.source !== window.parent) return;
  var d = e.data;
  if (!d || d.apuntes !== 'buscar' || typeof d.q !== 'string' || !d.q || d.q.length > 200) return;
  var k = (typeof d.k === 'number' && d.k >= 0 && d.k < 10000) ? Math.floor(d.k) : 0;
  var intentos = 0;
  (function buscar() {
    var ok = false;
    try {
      // Si esa aparición no existe (la nota cambió respecto al índice), se va a la primera.
      ok = localizarOcurrencia(document.body, d.q, k) || (k > 0 && localizarOcurrencia(document.body, d.q, 0));
    } catch (err) {}
    if (!ok && ++intentos < 6) setTimeout(buscar, 400);
  })();
});
<\/script>`;

export function conBase(html, path, escala) {
  const noteUrl = new URL(path.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
  // Tamaño de letra elegido en Cuenta (móvil): una nota aislada no puede leerlo del padre, así que se inyecta aquí.
  const estiloEscala = escala == null ? '' : `<style>:root{--note-scale:${Number(escala) || 1} !important}</style>`;
  const cabecera = `<base href="${esc(noteUrl)}">` + estiloEscala + ESTILO_RESALTADO + SCRIPT_NOTA;
  const abreHead = /<head(\s[^>]*)?>/i; // ojo: no debe coincidir con <header>
  return abreHead.test(html) ? html.replace(abreHead, m => m + cabecera) : cabecera + html;
}

export const esConfiable = (path) => NOTAS_CONFIABLES.has(path);
