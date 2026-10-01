// scripts/build-index.mjs
// Genera dos archivos en la RAÍZ del repositorio a partir de la carpeta DAM/:
//
//   manifest.json      lista de apuntes (ruta + huella) → la web construye el árbol con UNA
//                      petición al propio sitio, sin usar la API de GitHub (límite: 60/hora por IP).
//   search-index.json  texto plano de cada apunte → la búsqueda carga UN archivo en vez de
//                      descargar y procesar todos los apuntes en el navegador de cada alumno.
//
// Los ejecuta la GitHub Action .github/workflows/build-index.yml en cada push a main.
// Para probarlo en local (necesita Node 18+):
//     npm ci
//     node scripts/build-index.mjs
//
// La salida es DETERMINISTA (sin fechas): si no cambia ningún apunte, los archivos salen
// idénticos y la Action no hace commit.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { htmlAPlano } from './texto-plano.mjs';

const ROOT_FOLDER = 'DAM';
// Mismas extensiones que js/github-source.js (ALLOWED_EXTENSIONS).
const EXTENSIONES = ['html', 'htm', 'md', 'pdf'];
// Los PDF no tienen texto que indexar aquí.
const INDEXABLES = ['html', 'htm', 'md'];

const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');
const extensionDe = (ruta) => ruta.split('.').pop().toLowerCase();

async function listar(dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...await listar(ruta));
    else if (e.isFile() && EXTENSIONES.includes(extensionDe(e.name))) salida.push(ruta);
  }
  return salida;
}

const rutas = (await listar(ROOT_FOLDER)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const files = [];
const docs = {};
for (const ruta of rutas) {
  const bytes = await readFile(ruta);
  files.push({ path: ruta, h: sha256(bytes).slice(0, 10) });
  const ext = extensionDe(ruta);
  if (INDEXABLES.includes(ext)) {
    const crudo = bytes.toString('utf8');
    docs[ruta] = (ext === 'md' ? crudo : htmlAPlano(crudo)).toLowerCase();
  }
}

const indiceJson = JSON.stringify({ v: 1, docs });
const manifest = {
  v: 1,
  root: ROOT_FOLDER,
  ...(process.env.GITHUB_REPOSITORY ? { repo: process.env.GITHUB_REPOSITORY } : {}),
  indice: sha256(indiceJson).slice(0, 12),
  files,
};

await writeFile('search-index.json', indiceJson + '\n');
await writeFile('manifest.json', JSON.stringify(manifest, null, 1) + '\n');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
console.log(`manifest.json: ${files.length} archivos`);
console.log(`search-index.json: ${Object.keys(docs).length} documentos, ${kb(indiceJson)} KB`);
if (Buffer.byteLength(indiceJson) > 8 * 1024 * 1024) {
  console.warn('AVISO: el índice supera 8 MB; conviene dividirlo o recortarlo.');
}
