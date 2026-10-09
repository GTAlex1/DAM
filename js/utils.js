// utils.js
// Funciones puras de la web (sin estado). Están aquí para poder probarlas (carpeta tests/).

// ---------- Seguridad: escape y saneado ----------
// Todo texto que no sea una constante de este archivo (nombres de archivo, rutas,
// contenido de los apuntes, lo que escribe el usuario, parámetros de la URL) debe
// pasar por esc() antes de meterse en un innerHTML, o insertarse con textContent.
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function htmlAPlano(html) {
  // DOMParser crea un documento inerte: no ejecuta scripts ni carga imágenes/handlers
  // (a diferencia de asignar innerHTML a un elemento, aunque no esté en la página).
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach(n => n.remove());
  return (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ');
}

// Posiciones (sin solaparse) de cada aparición de q en el texto indexado. La aparición nº k de
// esta lista es la MISMA que localizarOcurrencia() busca en la página con el mismo k.
export function posicionesDe(texto, q) {
  const pos = [];
  let i = texto.indexOf(q);
  while (i !== -1) {
    pos.push(i);
    i = texto.indexOf(q, i + q.length);
  }
  return pos;
}

// En un srcdoc las rutas relativas se resuelven contra index.html, no contra el archivo de la nota.
// Las notas enlazan sus recursos con rutas relativas a SU propia carpeta (p. ej. ../../css/styles.css),
// así que se añade un <base> con la ubicación real de la nota en el sitio.
//
// Efecto secundario del <base>: un enlace `href="#algo"` pasaría a apuntar a la URL real de la nota
// y recargaría el iframe. Se arregla con un pequeño script que se inyecta DENTRO de la nota (el padre
// no puede tocar el documento de un iframe aislado). Se registra en `load` para ir después de los
// manejadores de la propia nota y respetar su `preventDefault`.
// Localiza la aparición nº k (0 = la primera) del texto q dentro de `raiz`, la resalta y la lleva
// a la vista. Usa solo APIs estándar: TreeWalker, Range, Selection y CSS Custom Highlight.
//
// El texto se construye EXACTAMENTE como el índice de búsqueda (scripts/build-index.mjs): texto
// de la página sin <script>/<style>/<noscript>, espacios colapsados y en minúsculas. Así la
// aparición nº k de los resultados es la nº k aquí, también si cruza etiquetas (<b>hor</b>ario).
//
// IMPORTANTE: esta función se copia como texto dentro de cada nota (ver SCRIPT_NOTA), así que debe
// ser autosuficiente: no puede usar nada definido fuera de ella.
export function localizarOcurrencia(raiz, q, k) {
  var recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  var nodos = [], pos = [], txt = '', espacioPrevio = false, nodo;
  while ((nodo = recorrido.nextNode())) {
    if (nodo.parentElement && nodo.parentElement.closest('script,style,noscript,template')) continue;
    var v = nodo.nodeValue;
    for (var i = 0; i < v.length; i++) {
      var c = v.charAt(i);
      if (/\s/.test(c)) {
        if (espacioPrevio) continue;
        espacioPrevio = true;
        c = ' ';
      } else {
        espacioPrevio = false;
      }
      var minus = c.toLowerCase();
      for (var j = 0; j < minus.length; j++) { txt += minus.charAt(j); nodos.push(nodo); pos.push(i); }
    }
  }

  var idx = -1, desde = 0;
  for (var n = 0; n <= k; n++) {
    idx = txt.indexOf(q, desde);
    if (idx === -1) return false;
    desde = idx + q.length;
  }

  var fin = idx + q.length - 1;
  var rango = document.createRange();
  rango.setStart(nodos[idx], pos[idx]);
  rango.setEnd(nodos[fin], pos[fin] + 1);

  var el = nodos[idx].parentElement;
  if (!el) return false;
  // Si la aparición está dentro de un <details> cerrado, se abre para que sea visible.
  for (var d = el.closest('details:not([open])'); d; d = d.parentElement && d.parentElement.closest('details:not([open])')) {
    d.open = true;
  }
  if (window.CSS && CSS.highlights && typeof Highlight !== 'undefined') {
    CSS.highlights.set('busqueda-apuntes', new Highlight(rango));
  } else {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rango);
  }
  el.scrollIntoView({ block: 'center' });
  return true;
}

// Reordenar archivos PROPIOS (quien no es admin solo puede escribir en sus documentos): cambia de sitio un archivo
// con el siguiente (delta = 1) o el anterior (-1) de SUS archivos del grupo, intercambiando sus «orden».
// Devuelve las escrituras necesarias [{ id, orden }]; nunca incluye archivos ajenos.
export function planReordenPropio(grupo, id, delta, uid) {
  const propios = grupo.filter((x) => x.creado_por === uid);
  const i = propios.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= propios.length) return [];
  const [a, b] = [propios[i], propios[j]];
  const oa = Number.isInteger(a.orden) ? a.orden : 0;
  const ob = Number.isInteger(b.orden) ? b.orden : 0;
  if (oa !== ob) return [{ id: a.id, orden: ob }, { id: b.id, orden: oa }];
  return delta < 0 ? [{ id: b.id, orden: oa + 1 }] : [{ id: a.id, orden: ob + 1 }]; // empate: se desempata
}
