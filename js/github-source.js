// github-source.js
// Construye el árbol de archivos LEYENDO de verdad la carpeta DAM/ del
// repositorio de GitHub (vía la API de GitHub), en lugar de depender de un
// manifest.json que haya que editar a mano cada vez que añades un apunte.

const ROOT_FOLDER = 'DAM'; // nombre de la carpeta del repo que contiene los apuntes
const ALLOWED_EXTENSIONS = ['html', 'htm', 'md', "pdf"];

// Detecta owner/repo a partir de la URL. Funciona automáticamente para
// GitHub Pages de proyecto (https://usuario.github.io/repo/...). Si pruebas
// en LOCAL (localhost), añade ?owner=TU-USUARIO&repo=TU-REPO
// (opcionalmente &branch=main) a la URL. En producción se ignoran.
// SEGURIDAD: los parámetros ?owner=&repo=&branch= SOLO se aceptan en desarrollo local.
// En producción cualquiera podría enviar un enlace como
//   https://gtalex1.github.io/DAM/?owner=atacante&repo=x
// y la web cargaría (y ejecutaría con la sesión de la víctima) las notas de OTRO repositorio.
const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]'];

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

export async function fetchGithubTree() {
  const info = detectRepo();
  if (!info) {
    const err = new Error('NO_REPO_INFO');
    throw err;
  }
  const { owner, repo } = info;
  let branch = info.branch;

  if (!branch) {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { cache: 'no-store' });
    if (!repoRes.ok) throw new Error('REPO_NOT_FOUND');
    branch = (await repoRes.json()).default_branch;
  }

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { cache: 'no-store' });
  if (!treeRes.ok) throw new Error('TREE_NOT_FOUND');
  const treeData = await treeRes.json();

  const files = (treeData.tree || []).filter(item =>
    item.type === 'blob' &&
    item.path.startsWith(ROOT_FOLDER + '/') &&
    ALLOWED_EXTENSIONS.includes(item.path.split('.').pop().toLowerCase())
  );

  const root = { name: ROOT_FOLDER, type: 'folder', children: [] };

  files.forEach(file => {
    const relative = file.path.slice(ROOT_FOLDER.length + 1); // quita "DAM/"
    const segments = relative.split('/');
    let current = root;
    segments.forEach((seg, i) => {
      const isFile = i === segments.length - 1;
      if (isFile) {
        current.children.push({ name: seg, type: 'file', path: file.path });
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
  return { root, owner, repo, branch };
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });
  node.children.forEach(sortTree);
}
