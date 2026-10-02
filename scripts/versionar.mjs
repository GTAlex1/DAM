// scripts/versionar.mjs
// Pone en cada enlace «?v=…» a un .js/.css del propio sitio una HUELLA calculada con el contenido
// del archivo al que apunta. Así no hay que subir los números a mano: si un archivo cambia, su
// huella cambia; y si no cambia, el enlace queda igual (la caché del navegador sigue valiendo).
//
// Qué toca (solo cambia el valor de «?v=», nada más):
//   · index.html y demás .html de la raíz   →  src="…" / href="…"
//   · js/**/*.js (menos js/vendor)          →  import … from '…' / import('…') / import '…'
//   · DAM/**/*.html (las notas)             →  src="…" / href="…"
// Un enlace solo se toca si YA lleva «?v=» y apunta a un archivo que existe en el repo.
// Los enlaces sin «?v=», los externos (https://…) y los que no existen se dejan como están.
//
// Rutas que entiende: relativas al archivo (./x.js, ../../js/x.js, js/x.js) y absolutas del sitio
// que empiezan por PREFIJO_SITIO («/DAM/js/x.js»).
//
// CASCADA: la huella de un módulo incluye las huellas de lo que él importa. Si cambia
// firebase-core.js, cambia la de firebase-init.js, la de app.js y el enlace de index.html. Todos los
// que importan un mismo módulo reciben SIEMPRE la misma huella, así el navegador no lo carga dos
// veces (con «?v=» distintos serían dos módulos distintos).
//
// Es idempotente: si ya está todo al día, no cambia nada (la Action no hace commit).
//
// Uso (desde la raíz del repo):
//     node scripts/versionar.mjs           reescribe los archivos
//     node scripts/versionar.mjs --check   no escribe; sale con error si algo está desactualizado

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ruta base del sitio publicado (https://usuario.github.io/DAM/). Las notas usan «/DAM/css/…».
const PREFIJO_SITIO = '/DAM/';
const LONGITUD_HUELLA = 8;
const IGNORAR = new Set(['node_modules', '.git', 'vendor']);

// Normaliza saltos de línea para que la huella sea igual en Windows y en Linux.
const huellaDe = (texto) =>
  createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex').slice(0, LONGITUD_HUELLA);

// Grupos: 1 = lo que va delante, 2 = comilla, 3 = ruta, 4 = versión actual.
const RE_HTML = /((?:src|href)\s*=\s*)(["'])([^"'?#\s]+\.(?:m?js|css))\?v=([\w.-]*)\2/gi;
const RE_JS = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"'?#\s]+\.m?js)\?v=([\w.-]*)\2/g;

const esHtml = (ruta) => /\.html?$/i.test(ruta);

// Archivos cuyo contenido se revisa en busca de enlaces con «?v=».
function esEscaneable(ruta) {
  if (ruta.split('/').includes('vendor')) return false;
  return /^[^/]+\.html?$/i.test(ruta) || /^js\/.+\.js$/.test(ruta) || /^DAM\/.+\.html?$/i.test(ruta);
}

async function recorrer(raiz, rel) {
  const salida = [];
  let entradas;
  try {
    entradas = await readdir(path.join(raiz, rel), { withFileTypes: true });
  } catch {
    return salida;
  }
  for (const e of entradas) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!IGNORAR.has(e.name)) salida.push(...await recorrer(raiz, r));
    } else if (e.isFile() && esEscaneable(r)) {
      salida.push(r);
    }
  }
  return salida.sort();
}

// Convierte la ruta escrita en el enlace en una ruta del repo (relativa a la raíz), o null si no
// es un archivo propio.
export function resolver(origen, ref) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return null; // https://, data:, …
  let destino;
  if (ref.startsWith('/')) {
    if (!ref.startsWith(PREFIJO_SITIO)) return null;
    destino = ref.slice(PREFIJO_SITIO.length);
  } else {
    destino = path.posix.join(path.posix.dirname(origen), ref);
  }
  destino = path.posix.normalize(destino);
  if (destino === '..' || destino.startsWith('../')) return null; // fuera del repo
  return destino;
}

// Devuelve la lista de archivos que cambian (y los escribe, salvo con { escribir: false }).
export async function versionar(raiz, { escribir = true } = {}) {
  const memo = new Map();
  const enCurso = [];

  // Texto de `ruta` con sus enlaces ya actualizados + su huella; null si el archivo no existe.
  async function procesar(ruta) {
    if (memo.has(ruta)) return memo.get(ruta);
    if (enCurso.includes(ruta)) {
      throw new Error(`Dependencia circular entre módulos: ${[...enCurso, ruta].join(' → ')}`);
    }
    enCurso.push(ruta);
    try {
      let original;
      try {
        original = await readFile(path.join(raiz, ruta), 'utf8');
      } catch {
        memo.set(ruta, null);
        return null;
      }

      let texto = original;
      if (esEscaneable(ruta)) {
        const re = esHtml(ruta) ? RE_HTML : RE_JS;
        const huellas = new Map(); // ruta del repo → huella (o null si no existe)
        for (const m of original.matchAll(re)) {
          const destino = resolver(ruta, m[3]);
          if (destino && !huellas.has(destino)) {
            const dep = await procesar(destino);
            huellas.set(destino, dep ? dep.huella : null);
          }
        }
        texto = original.replace(re, (todo, antes, comilla, ref) => {
          const destino = resolver(ruta, ref);
          const h = destino && huellas.get(destino);
          return h ? `${antes}${comilla}${ref}?v=${h}${comilla}` : todo;
        });
      }

      const resultado = { original, texto, huella: huellaDe(texto) };
      memo.set(ruta, resultado);
      return resultado;
    } finally {
      enCurso.pop();
    }
  }

  const cambiados = [];
  for (const ruta of await recorrer(raiz, '')) {
    const r = await procesar(ruta);
    if (r && r.texto !== r.original) {
      cambiados.push(ruta);
      if (escribir) await writeFile(path.join(raiz, ruta), r.texto);
    }
  }
  return cambiados;
}

// Ejecución desde la terminal / la Action (no al importarlo desde los tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const comprobar = process.argv.includes('--check');
  const cambiados = await versionar(raiz, { escribir: !comprobar });
  if (cambiados.length === 0) {
    console.log('Versiones al día: no hay nada que cambiar.');
  } else if (comprobar) {
    console.error(`Versiones desactualizadas en ${cambiados.length} archivo(s):\n  ${cambiados.join('\n  ')}`);
    console.error('Ejecuta «node scripts/versionar.mjs» para actualizarlas.');
    process.exit(1);
  } else {
    console.log(`Versiones actualizadas en ${cambiados.length} archivo(s):\n  ${cambiados.join('\n  ')}`);
  }
}
