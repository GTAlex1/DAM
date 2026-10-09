import { test } from 'node:test';
import assert from 'node:assert/strict';

// notas.js solo toca document.baseURI al preparar una nota.
globalThis.document = { baseURI: 'https://x.github.io/DAM/' };
const { sandboxPara, conBase, esConfiable } = await import('../js/notas.js');

test('sandboxPara: solo las notas de confianza conservan allow-same-origin', () => {
  for (const ruta of ['DAM/1-DAM/Horario.html', 'DAM/1-DAM/Calendario.html',
    'DAM/1-DAM/Entornos-de-Desarrollo/Libro.html', 'DAM/1-DAM/Lenguajes-de-Marcas/Libro.html']) {
    assert.match(sandboxPara(ruta), /allow-same-origin/, ruta);
    assert.equal(esConfiable(ruta), true);
  }
  for (const ruta of ['DAM/1-DAM/Otra.html', 'dam/1-dam/calendario.html', 'DAM/1-DAM/Calendario.html/../x.html', '', 'DAM/1-DAM/Sistemas-Informaticos/Unidad1.html']) {
    assert.doesNotMatch(sandboxPara(ruta), /allow-same-origin/, ruta);
    assert.match(sandboxPara(ruta), /allow-scripts/); // sigue pudiendo ejecutar sus propios scripts
  }
});

test('conBase: <base> y escala van tras <head> (no tras <header>)', () => {
  const html = '<html><head><title>t</title></head><body><header>x</header></body></html>';
  const out = conBase(html, 'DAM/a b.html', 1.25);
  assert.match(out, /<head><base href="https:\/\/x\.github\.io\/DAM\/DAM\/a%20b\.html">/);
  assert.match(out, /--note-scale:1\.25 !important/);
  assert.match(out, /<header>x<\/header>/);
  assert.equal(out.indexOf('<base') < out.indexOf('<title>'), true);
});

test('conBase: sin <head> la cabecera va delante; sin escala no se toca el tamaño', () => {
  const out = conBase('<p>hola</p>', 'DAM/n.html');
  assert.equal(out.startsWith('<base href='), true);
  assert.doesNotMatch(out, /--note-scale/);
});

test('conBase: la escala solo admite números y la ruta se escapa', () => {
  assert.match(conBase('<p>x</p>', 'DAM/n.html', '1.1'), /--note-scale:1\.1 !important/);
  const malo = conBase('<p>x</p>', 'DAM/n.html', '1}</style><script>alert(1)</script>');
  assert.doesNotMatch(malo, /<script>alert\(1\)/);
  assert.match(malo, /--note-scale:1 !important/); // NaN → 1
  assert.doesNotMatch(conBase('<p>x</p>', 'DAM/"><img src=x>.html'), /"><img/);
});
