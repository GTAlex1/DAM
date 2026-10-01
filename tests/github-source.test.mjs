import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaValida, construirArbol, fetchGithubTree } from '../js/github-source.js';

const manifest = (files, extra = {}) => ({ v: 1, repo: 'gtalex1/DAM', indice: 'abc123', files, ...extra });

function entorno({ host = 'gtalex1.github.io', search = '', respuestas }) {
  const peticiones = [];
  globalThis.location = { hostname: host, pathname: '/DAM/', search };
  globalThis.document = { baseURI: `https://${host}/DAM/` };
  globalThis.fetch = async (url) => {
    peticiones.push(String(url));
    const r = respuestas(String(url));
    return { ok: r.status === 200, status: r.status, json: async () => r.cuerpo };
  };
  return peticiones;
}

test('rutaValida solo acepta archivos permitidos dentro de DAM/', () => {
  assert.equal(rutaValida('DAM/1-DAM/horario.html'), true);
  assert.equal(rutaValida('DAM/a/b.md'), true);
  assert.equal(rutaValida('DAM/../js/app.js'), false);
  assert.equal(rutaValida('DAM/x\\y.html'), false);
  assert.equal(rutaValida('otra/cosa.html'), false);
  assert.equal(rutaValida('DAM/script.exe'), false);
  assert.equal(rutaValida(undefined), false);
});

test('construirArbol pone las carpetas primero y ordena por nombre', () => {
  const raiz = construirArbol(['DAM/b.html', 'DAM/Carpeta/z.html', 'DAM/a.html']);
  assert.deepEqual(raiz.children.map(n => n.name), ['Carpeta', 'a.html', 'b.html']);
  assert.equal(raiz.children[0].type, 'folder');
});

test('con manifest: construye el árbol sin llamar a la API de GitHub', async () => {
  const peticiones = entorno({
    respuestas: (url) => url.endsWith('/manifest.json')
      ? { status: 200, cuerpo: manifest([{ path: 'DAM/1-DAM/a.html', h: 'a1b2c3' }]) }
      : { status: 500 },
  });
  const r = await fetchGithubTree();
  assert.equal(r.origen, 'manifest');
  assert.equal(r.hashes['DAM/1-DAM/a.html'], 'a1b2c3');
  assert.equal(r.indice, 'abc123');
  assert.ok(!peticiones.some(u => u.includes('api.github.com')));
});

test('manifest con rutas maliciosas y huellas inválidas: se filtran', async () => {
  entorno({
    respuestas: () => ({ status: 200, cuerpo: manifest([
      { path: 'DAM/ok.md', h: '<script>' }, { path: 'DAM/../x.html', h: 'aa' }, { path: 'fuera/y.html', h: 'aa' },
    ]) }),
  });
  const r = await fetchGithubTree();
  assert.deepEqual(Object.keys(r.hashes), ['DAM/ok.md']);
  assert.equal(r.hashes['DAM/ok.md'], '');
});

test('sin manifest y con la API limitada: error RATE_LIMIT', async () => {
  entorno({ respuestas: (url) => (url.includes('api.github.com') ? { status: 403 } : { status: 404 }) });
  await assert.rejects(fetchGithubTree(), { message: 'RATE_LIMIT' });
});

test('en producción se ignoran ?owner= y ?repo= (no se puede cargar otro repositorio)', async () => {
  const peticiones = entorno({
    search: '?owner=atacante&repo=x',
    respuestas: (url) => (url.includes('api.github.com') ? { status: 403 } : { status: 404 }),
  });
  await assert.rejects(fetchGithubTree());
  assert.ok(peticiones.some(u => u.includes('/repos/gtalex1/DAM')));
  assert.ok(!peticiones.some(u => u.includes('atacante')));
});

test('en localhost sí se aceptan ?owner= y ?repo=', async () => {
  const peticiones = entorno({
    host: 'localhost', search: '?owner=yo&repo=prueba',
    respuestas: (url) => (url.includes('api.github.com') ? { status: 403 } : { status: 404 }),
  });
  await assert.rejects(fetchGithubTree());
  assert.ok(peticiones.some(u => u.includes('/repos/yo/prueba')));
});
