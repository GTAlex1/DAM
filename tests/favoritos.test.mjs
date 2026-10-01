import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// js/app.js no se puede importar (toca el DOM al cargarse), así que estos tests extraen su bloque
// «Favoritos» y lo ejecutan con un localStorage y una nube simulados.
// Si cambias los comentarios-marca de ese bloque en app.js, ajusta aquí las dos líneas siguientes.
const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const bloque = src.slice(src.indexOf('// ---------- Favoritos ----------'), src.indexOf('// ---------- Icons ----------'));

function entorno({ local = {}, nube = {} } = {}) {
  const almacen = { ...local };
  const subidas = [];
  const localStorage = {
    getItem: (k) => (k in almacen ? almacen[k] : null),
    setItem: (k, v) => { almacen[k] = String(v); },
    removeItem: (k) => { delete almacen[k]; },
  };
  const cargarFavoritosNube = async (u) => (u.uid in nube ? nube[u.uid] : null);
  const guardarFavoritosNube = async (u, lista) => { subidas.push({ uid: u.uid, lista }); nube[u.uid] = lista; };
  const fabrica = new Function(
    'localStorage', 'cargarFavoritosNube', 'guardarFavoritosNube', 'root', 'buildTree', 'renderFavoritos',
    'setTimeout', 'clearTimeout', 'console',
    `${bloque}
     return {
       get favoritos() { return favoritos; },
       set usuario(u) { usuarioFavoritos = u; },
       alternarFavorito, sincronizarFavoritos, alCerrarSesionFavoritos,
     };`,
  );
  // setTimeout inmediato: así el «agrupar clics» de 800 ms no ralentiza los tests.
  const estado = fabrica(localStorage, cargarFavoritosNube, guardarFavoritosNube, null, () => {}, () => {},
    (fn) => { fn(); return 0; }, () => {}, console);
  return { estado, almacen, subidas, nube, lista: () => [...estado.favoritos].sort() };
}

const A = { uid: 'A' };
const B = { uid: 'B' };
const pausa = () => new Promise((r) => setTimeout(r, 10));

test('primera sesión en este navegador: se unen los favoritos locales y los de la cuenta', async () => {
  const e = entorno({ local: { damNotesFavoritos: '["x","y"]' }, nube: { A: ['y', 'z'] } });
  e.estado.usuario = A;
  await e.estado.sincronizarFavoritos(A);
  await pausa();
  assert.deepEqual(e.lista(), ['x', 'y', 'z']);
  assert.deepEqual(e.subidas.at(-1).lista.sort(), ['x', 'y', 'z']);
  assert.equal(e.almacen.damNotesFavoritosUid, 'A');
});

test('sesión ya sincronizada: manda la cuenta y no sube nada (se propagan los borrados)', async () => {
  const e = entorno({ local: { damNotesFavoritos: '["x","y"]', damNotesFavoritosUid: 'A' }, nube: { A: ['y'] } });
  e.estado.usuario = A;
  await e.estado.sincronizarFavoritos(A);
  await pausa();
  assert.deepEqual(e.lista(), ['y']);
  assert.equal(e.subidas.length, 0);
});

test('los cambios hechos sin sesión no se pierden al iniciarla', async () => {
  const e = entorno({
    local: { damNotesFavoritos: '["nuevo"]', damNotesFavoritosUid: 'A', damNotesFavoritosSucio: '1' },
    nube: { A: ['y'] },
  });
  e.estado.usuario = A;
  await e.estado.sincronizarFavoritos(A);
  await pausa();
  assert.deepEqual(e.lista(), ['nuevo', 'y']);
  assert.equal(e.almacen.damNotesFavoritosSucio, undefined);
});

test('sin sesión marca «sucio»; con sesión sube a la cuenta', async () => {
  const e = entorno();
  e.estado.alternarFavorito('p1');
  assert.equal(e.almacen.damNotesFavoritosSucio, '1');
  assert.equal(e.subidas.length, 0);
  e.estado.usuario = A;
  e.estado.alternarFavorito('p2');
  await pausa();
  assert.deepEqual(e.subidas.at(-1).lista.sort(), ['p1', 'p2']);
});

test('cerrar sesión vacía lo local y nunca sube una lista vacía a la cuenta', async () => {
  const e = entorno({ local: { damNotesFavoritos: '["x"]', damNotesFavoritosUid: 'A' }, nube: { A: ['x'] } });
  e.estado.usuario = A;
  e.estado.usuario = null;
  e.estado.alCerrarSesionFavoritos();
  await pausa();
  assert.equal(e.lista().length, 0);
  assert.equal(e.almacen.damNotesFavoritos, '[]');
  assert.deepEqual(e.nube.A, ['x']);
  assert.equal(e.subidas.length, 0);
});

test('otra cuenta en el mismo navegador no hereda los favoritos de la anterior', async () => {
  const e = entorno({ local: { damNotesFavoritos: '["deA"]', damNotesFavoritosUid: 'A' }, nube: { A: ['deA'], B: ['deB'] } });
  e.estado.usuario = A;
  e.estado.alCerrarSesionFavoritos();
  e.estado.usuario = B;
  await e.estado.sincronizarFavoritos(B);
  await pausa();
  assert.deepEqual(e.lista(), ['deB']);
});

test('cuenta nueva y vacía: no escribe nada', async () => {
  const e = entorno();
  e.estado.usuario = A;
  await e.estado.sincronizarFavoritos(A);
  await pausa();
  assert.equal(e.subidas.length, 0);
});
