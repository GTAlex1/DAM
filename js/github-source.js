// github-source.js
// Construye el árbol de archivos de la carpeta DAM/ del repositorio.
//
// Fuente 1 (normal): manifest.json, generado por la GitHub Action al hacer push. Es un archivo
//   del propio sitio: una sola petición, sin límite de la API de GitHub.
// Fuente 2 (respaldo): la API de GitHub. Se usa si manifest.json no existe todavía (primer
//   despliegue) o al probar en local sin haberlo generado. Límite: 60 peticiones/hora por IP.

const ROOT_FOLDER = 'DAM'; // nombre de la carpeta del repo que contiene los apuntes
const ALLOWED_EXTENSIONS = ['html', 'htm', 'md', 'pdf'];

// SEGURIDAD: los parámetros ?owner=&repo=&branch= SOLO se aceptan en desarrollo local.
// En producción cualquiera podría enviar un enlace como
//   https://gtalex1.github.io/DAM/?owner=atacante&repo=x
// y la web cargaría (y ejecutaría con la sesión de la víctima) las notas de OTRO repositorio.
const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]'];

// Detecta owner/repo a partir de la URL. Funciona automáticamente para
// GitHub Pages de proyecto (https://usuario.github.io/repo/...). Si pruebas
// en LOCAL (localhost) sin manifest.json, añade ?owner=TU-USUARIO&repo=TU-REPO
// (opcionalmente &branch=main) a la URL. En producción se ignoran.
function detectRepo() {
  const host = location.hostname;
  const params = new URLSearchParams(location.search);
  if (HOSTS_LOCALES.includes(host) && params.get('owner') && params.get('repo')) {
    return { owner: params.get('owner'), repo: params.get('repo'), branch: params.get('branch') || null };
  }
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const parts = location.pathname.split('/').filter(Boolean);
    const repo = parts.length ? parts[0] : `${owner}.github.io`;
    return { owner, repo, branch: null };
  }
  return null;
}

const extensionDe = (ruta) => ruta.split('.').pop().toLowerCase();

// Ruta válida: dentro de DAM/, sin «..» ni barras invertidas y con extensión permitida.
function rutaValida(ruta) {
  return typeof ruta === 'string'
    && ruta.startsWith(ROOT_FOLDER + '/')
    && !ruta.includes('\\')
    && !ruta.split('/').includes('..')
    && ALLOWED_EXTENSIONS.includes(extensionDe(ruta));
}

// Convierte una lista de rutas («DAM/1-DAM/Java/Java.html») en el árbol de carpetas.
function construirArbol(rutas) {
  const root = { name: ROOT_FOLDER, type: 'folder', children: [] };
  rutas.forEach(ruta => {
    const segments = ruta.slice(ROOT_FOLDER.length + 1).split('/'); // quita "DAM/"
    let current = root;
    segments.forEach((seg, i) => {
      if (i === segments.length - 1) {
        current.children.push({ name: seg, type: 'file', path: ruta });
      } else {
        let folder = current.children.find(c => c.type === 'folder' && c.name === seg);
        if (!folder) {
          folder = { name: seg, type: 'folder', children: [] };
          current.children.push(folder);
        }
        current = folder;
      }
    });
  });
  sortTree(root);
  return root;
}

const HEX = /^[0-9a-f]{1,64}$/;

async function desdeManifest() {
  // no-cache: el navegador revalida con el servidor (respuesta 304 si no cambió), así un
  // apunte nuevo aparece enseguida sin esperar a que caduque la caché.
  const res = await fetch(new URL('manifest.json', document.baseURI).href, { cache: 'no-cache' });
  if (!res.ok) throw new Error('MANIFEST_NOT_FOUND');
  const m = await res.json();
  if (!m || !Array.isArray(m.files)) throw new Error('MANIFEST_INVALID');

  const archivos = m.files.filter(f => f && rutaValida(f.path));
  const hashes = {};
  archivos.forEach(f => { hashes[f.path] = HEX.test(f.h) ? f.h : ''; });

  const info = detectRepo();
  const [owner, repo] = typeof m.repo === 'string' && m.repo.includes('/')
    ? m.repo.split('/')
    : [info && info.owner, info && info.repo];

  return {
    root: construirArbol(archivos.map(f => f.path)),
    owner: owner || '', repo: repo || '', branch: null,
    origen: 'manifest',
    hashes,                                   // ruta → huella, para invalidar la caché por archivo
    indice: HEX.test(m.indice) ? m.indice : '', // huella de search-index.json
  };
}

async function desdeApi() {
  const info = detectRepo();
  if (!info) throw new Error('NO_REPO_INFO');
  const { owner, repo } = info;
  let branch = info.branch;

  const comprobar = (res, fallo) => {
    if (res.status === 403 || res.status === 429) throw new Error('RATE_LIMIT');
    if (!res.ok) throw new Error(fallo);
  };

  if (!branch) {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { cache: 'no-store' });
    comprobar(repoRes, 'REPO_NOT_FOUND');
    branch = (await repoRes.json()).default_branch;
  }

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { cache: 'no-store' });
  comprobar(treeRes, 'TREE_NOT_FOUND');
  const treeData = await treeRes.json();

  const rutas = (treeData.tree || [])
    .filter(item => item.type === 'blob' && rutaValida(item.path))
    .map(item => item.path);

  return { root: construirArbol(rutas), owner, repo, branch, origen: 'api', hashes: {}, indice: '' };
}

export async function fetchGithubTree() {
  try {
    return await desdeManifest();
  } catch (e) {
    console.info('manifest.json no disponible; se usa la API de GitHub (', e.message, ')');
  }
  return desdeApi();
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });
  node.children.forEach(sortTree);
}
