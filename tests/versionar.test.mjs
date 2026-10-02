// tests/versionar.test.mjs
// Comprueba scripts/versionar.mjs en un repo de mentira (carpeta temporal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { versionar, resolver } from '../scripts/versionar.mjs';

async function repoDePrueba(archivos) {
  const raiz = await mkdtemp(path.join(tmpdir(), 'versionar-'));
  for (const [ruta, texto] of Object.entries(archivos)) {
    await mkdir(path.dirname(path.join(raiz, ruta)), { recursive: true });
    await writeFile(path.join(raiz, ruta), texto);
  }
  return raiz;
}
const leer = (raiz, ruta) => readFile(path.join(raiz, ruta), 'utf8');
const version = (texto, nombre) => texto.match(new RegExp(`${nombre}\\?v=([\\w.-]+)`))?.[1];

const BASE = {
  'index.html': '<link rel="stylesheet" href="css/styles.css?v=8">\n<script type="module" src="js/app.js?v=14"></script>\n<script src="js/vendor/marked.min.js"></script>',
  'css/styles.css': 'body { color: red; }',
  'js/app.js': "import { a } from './core.js?v=1';\nimport { b } from './util.js?v=1';\nimport 'https://www.gstatic.com/x.js';",
  'js/core.js': "import { b } from './util.js?v=7';\nexport const a = 1;",
  'js/util.js': 'export const b = 2;',
  'DAM/1-DAM/Nota.html': '<link href="/DAM/css/styles.css?v=9"><script src="../../js/util.js?v=2"></script><script src="../../js/falta.js?v=2"></script>',
};

test('resolver: relativas, absolutas del sitio y externas', () => {
  assert.equal(resolver('index.html', 'js/app.js'), 'js/app.js');
  assert.equal(resolver('js/app.js', './core.js'), 'js/core.js');
  assert.equal(resolver('DAM/1-DAM/Nota.html', '../../js/util.js'), 'js/util.js');
  assert.equal(resolver('DAM/1-DAM/Nota.html', '/DAM/css/styles.css'), 'css/styles.css');
  assert.equal(resolver('index.html', '/otro/x.js'), null);
  assert.equal(resolver('index.html', 'https://x.com/a.js'), null);
  assert.equal(resolver('index.html', '../fuera.js'), null);
});

test('sustituye los números a mano por huellas y deja el resto intacto', async () => {
  const raiz = await repoDePrueba(BASE);
  try {
    const cambiados = await versionar(raiz);
    assert.deepEqual(cambiados.sort(), ['DAM/1-DAM/Nota.html', 'index.html', 'js/app.js', 'js/core.js']);

    const index = await leer(raiz, 'index.html');
    assert.match(index, /css\/styles\.css\?v=[0-9a-f]{8}"/);
    assert.match(index, /js\/app\.js\?v=[0-9a-f]{8}"/);
    assert.match(index, /src="js\/vendor\/marked\.min\.js"/); // sin ?v=: no se toca

    const app = await leer(raiz, 'js/app.js');
    assert.match(app, /'https:\/\/www\.gstatic\.com\/x\.js'/); // externo: no se toca

    const nota = await leer(raiz, 'DAM/1-DAM/Nota.html');
    assert.match(nota, /falta\.js\?v=2"/); // no existe: no se toca
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('un mismo módulo recibe la misma huella desde todos los que lo importan', async () => {
  const raiz = await repoDePrueba(BASE);
  try {
    await versionar(raiz);
    const deApp = version(await leer(raiz, 'js/app.js'), 'util\\.js');
    const deCore = version(await leer(raiz, 'js/core.js'), 'util\\.js');
    const deNota = version(await leer(raiz, 'DAM/1-DAM/Nota.html'), 'util\\.js');
    assert.ok(deApp);
    assert.equal(deApp, deCore);
    assert.equal(deApp, deNota);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('es idempotente: la segunda pasada no cambia nada', async () => {
  const raiz = await repoDePrueba(BASE);
  try {
    await versionar(raiz);
    assert.deepEqual(await versionar(raiz), []);
    assert.deepEqual(await versionar(raiz, { escribir: false }), []);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('cascada: cambiar un módulo cambia la huella de quien lo importa, hasta index.html', async () => {
  const raiz = await repoDePrueba(BASE);
  try {
    await versionar(raiz);
    const antes = version(await leer(raiz, 'index.html'), 'js\\/app\\.js');
    const cssAntes = version(await leer(raiz, 'index.html'), 'css\\/styles\\.css');

    await writeFile(path.join(raiz, 'js/util.js'), 'export const b = 3;');
    const cambiados = await versionar(raiz);
    assert.deepEqual(cambiados.sort(), ['DAM/1-DAM/Nota.html', 'index.html', 'js/app.js', 'js/core.js']);

    const despues = version(await leer(raiz, 'index.html'), 'js\\/app\\.js');
    assert.notEqual(antes, despues);
    assert.equal(cssAntes, version(await leer(raiz, 'index.html'), 'css\\/styles\\.css')); // el CSS no cambió
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('--check (escribir: false) lista lo desactualizado sin tocar los archivos', async () => {
  const raiz = await repoDePrueba(BASE);
  try {
    const cambiados = await versionar(raiz, { escribir: false });
    assert.ok(cambiados.includes('index.html'));
    assert.equal(await leer(raiz, 'index.html'), BASE['index.html']);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('la huella no depende de los saltos de línea (CRLF o LF)', async () => {
  const lf = await repoDePrueba({ ...BASE, 'js/util.js': 'export const b = 2;\nexport const c = 3;\n' });
  const crlf = await repoDePrueba({ ...BASE, 'js/util.js': 'export const b = 2;\r\nexport const c = 3;\r\n' });
  try {
    await versionar(lf);
    await versionar(crlf);
    assert.equal(version(await leer(lf, 'js/core.js'), 'util\\.js'), version(await leer(crlf, 'js/core.js'), 'util\\.js'));
  } finally {
    await rm(lf, { recursive: true, force: true });
    await rm(crlf, { recursive: true, force: true });
  }
});

test('avisa si dos módulos se importan en círculo', async () => {
  const raiz = await repoDePrueba({
    'js/a.js': "import './b.js?v=1';",
    'js/b.js': "import './a.js?v=1';",
  });
  try {
    await assert.rejects(() => versionar(raiz), /circular/i);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});
