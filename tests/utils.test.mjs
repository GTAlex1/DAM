import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { htmlAPlano as htmlAPlanoServidor } from '../scripts/texto-plano.mjs';
import { esc, htmlAPlano, posicionesDe, localizarOcurrencia } from '../js/utils.js';

// Entorno de navegador simulado (utils.js usa document, DOMParser, NodeFilter y window al ejecutarse).
function navegador(html = '<body></body>') {
  const dom = new JSDOM(html);
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.NodeFilter = w.NodeFilter;
  globalThis.DOMParser = w.DOMParser;
  return w;
}

test('esc escapa los cinco caracteres peligrosos y tolera null/undefined', () => {
  assert.equal(esc('<img src=x onerror="a(1)"> & \'q\''), '&lt;img src=x onerror=&quot;a(1)&quot;&gt; &amp; &#39;q&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('posicionesDe devuelve apariciones sin solaparse', () => {
  assert.deepEqual(posicionesDe('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(posicionesDe('hola mundo hola', 'hola'), [0, 11]);
  assert.deepEqual(posicionesDe('abc', 'z'), []);
});

test('htmlAPlano ignora script/style, colapsa espacios y no ejecuta nada', () => {
  navegador();
  globalThis.__pwned = false;
  const html = '<html><head><style>.a{}</style></head><body><p>Hola\n\n   mundo</p>'
    + '<script>globalThis.__pwned = true</script><img src=x onerror="globalThis.__pwned = true"></body></html>';
  assert.equal(htmlAPlano(html), 'Hola mundo');
  assert.equal(globalThis.__pwned, false);
});

test('localizarOcurrencia: la aparición nº k de la lista es la nº k de la página', () => {
  const html = `<html><head><title>horario</title><script>var horario = 1;</script></head><body>
    <p>El horario es fijo.</p>
    <p>hor<b>ari</b>o   partido</p>
    <script>horario = 2</script>
    <div>\n  HORARIO\n  de clase</div>
    <details><summary>más</summary><p>otro horario oculto</p></details>
    <p>y el último Horario.</p></body></html>`;
  const esperadas = posicionesDe(htmlAPlanoServidor(html).toLowerCase(), 'horario').length;
  assert.equal(esperadas, 5); // la del <script> no cuenta

  const w = navegador(html);
  const seleccionadas = [];
  for (let k = 0; k < esperadas; k++) {
    assert.equal(localizarOcurrencia(w.document.body, 'horario', k), true, `k=${k}`);
    seleccionadas.push(w.getSelection().toString().replace(/\s+/g, ' ').toLowerCase());
  }
  assert.deepEqual(seleccionadas, Array(5).fill('horario'));
  assert.equal(localizarOcurrencia(w.document.body, 'horario', 5), false); // no hay una sexta
  assert.equal(w.document.querySelector('details').open, true); // abrió el <details> de la 4ª
});

test('el índice del servidor (cheerio) y el navegador cuentan igual', () => {
  const html = '<body><h1>Sesión</h1><p>cerrar   sesión y abrir <i>SESIÓN</i><span>ses</span>ión</p><textarea>sesión</textarea></body>';
  const w = navegador(html);
  const indice = htmlAPlanoServidor(html).toLowerCase();
  const esperadas = posicionesDe(indice, 'sesión').length;
  let halladas = 0;
  while (localizarOcurrencia(w.document.body, 'sesión', halladas)) halladas++;
  assert.equal(halladas, esperadas);
});
