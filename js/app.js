import { isAuthorized, watchAuth, loadOrder, saveOrderForPath } from './firebase-init.js?v=3';
import { fetchGithubTree } from './github-source.js?v=2';

// ---------- Config ----------
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: false,
});

const fileTreeEl = document.getElementById('file-tree');
const tabbarEl = document.getElementById('tabbar');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const editorContentEl = document.getElementById('editor-content');
const titlebarPathEl = document.getElementById('titlebar-path');
const statusLangEl = document.getElementById('status-lang');
const statusSyncEl = document.getElementById('status-sync');
const sidebarEl = document.getElementById('sidebar');
const editBadgeEl = document.getElementById('edit-badge');
const searchInputEl = document.getElementById('search-input');
const searchFiltroEl = document.getElementById('search-filtro');
const searchStatusEl = document.getElementById('search-status');
const searchResultsEl = document.getElementById('search-results');
const favoritosListEl = document.getElementById('favoritos-list');

let root = null;            // raíz del árbol en memoria (con parent/id/pathKey)
let savedOrder = {};        // orden guardado en Firestore { pathKey: [nombres] }
let ghOwner = null, ghRepo = null, ghBranch = null; // repo de GitHub detectado
const openTabs = [];        // { path, name, crumbs: [..] }
let activePath = null;
const contentCache = {};
const collapsedIds = new Set();
let editMode = false;
let nextId = 1;
const nodesById = {};

// ---------- Favoritos (guardados en este navegador) ----------
const CLAVE_FAVORITOS = 'damNotesFavoritos';
let favoritos = new Set();
try { favoritos = new Set(JSON.parse(localStorage.getItem(CLAVE_FAVORITOS) || '[]')); } catch (e) { }

function esFavorito(path) { return favoritos.has(path); }
function guardarFavoritos() {
  try { localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify([...favoritos])); } catch (e) { }
}
function alternarFavorito(path) {
  if (favoritos.has(path)) favoritos.delete(path); else favoritos.add(path);
  guardarFavoritos();
}

// ---------- Icons ----------
const ICON_FOLDER = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg>`;
const ICON_FOLDER_OPEN = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM4 6h5.17l2 2H20v10H4V6z"/></svg>`;
const ICON_MD = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2" fill="#519aba"/><text x="12" y="16" font-size="8.5" font-family="monospace" font-weight="700" fill="#1e1e1e" text-anchor="middle">MD</text></svg>`;
const ICON_HTML = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2" fill="#e37933"/><text x="12" y="16" font-size="7" font-family="monospace" font-weight="700" fill="#1e1e1e" text-anchor="middle">&lt;/&gt;</text></svg>`;
const ICON_CHEVRON = `<svg class="chevron" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M6 4l4 4-4 4V4z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 8.7l3.15 3.15.7-.7L8.7 8l3.15-3.15-.7-.7L8 7.3 4.85 4.15l-.7.7L7.3 8l-3.15 3.15.7.7z"/></svg>`;
const ICON_GRIP = `<svg class="grip" viewBox="0 0 16 16" width="12" height="16"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>`;
const ICON_STAR_OUTLINE = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 3.5l2.6 5.4 5.9.6-4.4 4 1.3 5.8L12 16.4l-5.4 2.9 1.3-5.8-4.4-4 5.9-.6L12 3.5z"/></svg>`;
const ICON_STAR_FILL = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.6-4.4 4 1.3 5.8L12 16.4l-5.4 2.9 1.3-5.8-4.4-4 5.9-.6L12 3.5z"/></svg>`;

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  return (ext === 'html' || ext === 'htm') ? ICON_HTML : ICON_MD;
}

// ---------- Load file tree from GitHub + saved order ----------
async function cargarArbol() {
  try {
    const [{ root: treeRoot, owner, repo, branch }, orderData] = await Promise.all([
      fetchGithubTree(),
      loadOrder(),
    ]);
    ghOwner = owner; ghRepo = repo; ghBranch = branch;
    savedOrder = orderData || {};
    root = treeRoot;
    nextId = 1;
    for (const k in nodesById) delete nodesById[k];
    annotateTree(root, null, 'root');
    applySavedOrder(root);
    for (const k in contentCache) delete contentCache[k];
    indiceListo = false; indiceEnCurso = null;
    for (const k in textoIndexado) delete textoIndexado[k];
    searchFiltroEl.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());

    if (!root.children.length) {
      fileTreeEl.innerHTML = `<div style="padding:12px;color:#9a9a9a;font-size:12px;line-height:1.5;">
        La carpeta <strong>DAM/</strong> está vacía (o todavía no existe) en
        <code>${owner}/${repo}</code>. Sube tus apuntes ahí y recarga la página.
      </div>`;
      return;
    }
    buildTree();
  } catch (err) {
    showTreeError(err);
  }
}
cargarArbol();

function showTreeError(err) {
  let msg = 'No se pudo leer el árbol de archivos desde GitHub.';
  if (err && err.message === 'NO_REPO_INFO') {
    msg = 'No se ha podido detectar el repositorio de GitHub automáticamente. Si estás probando en local o con un dominio propio, añade <code>?owner=TU-USUARIO&repo=TU-REPO</code> a la URL.';
  } else if (err && err.message === 'REPO_NOT_FOUND') {
    msg = 'No se encontró ese repositorio en GitHub. Comprueba que sea público y que el nombre coincida con la URL.';
  } else if (err && err.message === 'TREE_NOT_FOUND') {
    msg = 'No se pudo leer el contenido del repositorio (rama no encontrada).';
  }
  fileTreeEl.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;line-height:1.5;">${msg}</div>`;
}

// Recorre el árbol asignando id único, referencia al padre y una "pathKey"
// estable (basada en nombres, no en posición) que se usa como clave del orden.
function annotateTree(node, parent, pathKey) {
  node.id = nextId++;
  node.parent = parent;
  node.pathKey = pathKey;
  nodesById[node.id] = node;
  if (node.children) {
    node.children.forEach(child => {
      annotateTree(child, node, pathKey + '/' + child.name);
    });
  }
}

// Reordena node.children según el orden guardado (si existe), conservando al
// final cualquier archivo/carpeta nuevo que no estuviera en el orden guardado.
function applySavedOrder(node) {
  if (node.children) {
    const order = savedOrder[node.pathKey];
    if (order && order.length) {
      const byName = new Map(node.children.map(c => [c.name, c]));
      const ordered = [];
      order.forEach(name => { if (byName.has(name)) { ordered.push(byName.get(name)); byName.delete(name); } });
      byName.forEach(c => ordered.push(c)); // nuevos, al final
      node.children = ordered;
    }
    node.children.forEach(applySavedOrder);
  }
}

// ---------- Build tree UI ----------
function buildTree() {
  fileTreeEl.innerHTML = '';
  renderTree(root, fileTreeEl, []);
}

function renderTree(node, container, crumbs) {
  node.children.forEach(child => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.nodeId = child.id;
    row.style.paddingLeft = (8 + crumbs.length * 14) + 'px';
    row.draggable = editMode;
    if (editMode) row.classList.add('draggable');

    const grip = editMode ? `<span class="grip-handle">${ICON_GRIP}</span>` : '';

    if (child.type === 'folder') {
      const collapsed = collapsedIds.has(child.id);
      row.innerHTML = `${grip}${ICON_CHEVRON}${ICON_FOLDER}<span class="label">${child.name}</span>`;
      if (collapsed) row.querySelector('.chevron').classList.add('collapsed');
      wrapper.appendChild(row);

      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children' + (collapsed ? ' collapsed' : '');
      wrapper.appendChild(childrenEl);
      renderTree(child, childrenEl, [...crumbs, child.name]);

      row.addEventListener('click', (e) => {
        if (e.target.closest('.grip-handle')) return;
        const nowCollapsed = childrenEl.classList.toggle('collapsed');
        row.querySelector('.chevron').classList.toggle('collapsed', nowCollapsed);
        row.querySelector('.icon').outerHTML = nowCollapsed ? ICON_FOLDER : ICON_FOLDER_OPEN;
        if (nowCollapsed) collapsedIds.add(child.id); else collapsedIds.delete(child.id);
      });
    } else {
      const activo = esFavorito(child.path);
      row.innerHTML = `${grip}<span style="width:16px;flex-shrink:0;"></span>${fileIcon(child.name)}<span class="label">${child.name}</span>`
        + `<span class="fav-star${activo ? ' activo' : ''}" title="${activo ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${activo ? ICON_STAR_FILL : ICON_STAR_OUTLINE}</span>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.grip-handle')) return;
        if (e.target.closest('.fav-star')) { toggleFavorito(child.path); return; }
        openFile(child, [...crumbs]);
      });
      wrapper.appendChild(row);
    }

    if (editMode) attachDragHandlers(row, child);
    container.appendChild(wrapper);
  });
}

function highlightSelected(path) {
  document.querySelectorAll('.tree-row.selected').forEach(el => el.classList.remove('selected'));
  const node = findByPath(root, path);
  if (node) {
    const row = document.querySelector(`.tree-row[data-node-id="${node.id}"]`);
    if (row) row.classList.add('selected');
  }
}

function findByPath(node, path) {
  if (node.path === path) return node;
  if (!node.children) return null;
  for (const c of node.children) {
    const found = findByPath(c, path);
    if (found) return found;
  }
  return null;
}

// Reconstruye el camino de nombres de carpeta desde la raíz hasta (sin
// incluir) el propio nodo, subiendo por node.parent.
function crumbsFor(node) {
  const crumbs = [];
  let p = node.parent;
  while (p && p.parent) { crumbs.unshift(p.name); p = p.parent; }
  return crumbs;
}

// ---------- Drag & drop (reordenar hermanos) ----------
let dragNodeId = null;

function attachDragHandlers(row, node) {
  row.addEventListener('dragstart', (e) => {
    dragNodeId = node.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    document.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  });
  row.addEventListener('dragover', (e) => {
    const draggedNode = nodesById[dragNodeId];
    if (!draggedNode || draggedNode.parent !== node.parent || draggedNode.id === node.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    row.classList.toggle('drop-before', before);
    row.classList.toggle('drop-after', !before);
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drop-before', 'drop-after');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drop-before', 'drop-after');
    const draggedNode = nodesById[dragNodeId];
    if (!draggedNode || draggedNode.parent !== node.parent || draggedNode.id === node.id) return;

    const siblings = node.parent.children;
    const fromIdx = siblings.indexOf(draggedNode);
    siblings.splice(fromIdx, 1);
    let toIdx = siblings.indexOf(node);
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    if (!before) toIdx += 1;
    siblings.splice(toIdx, 0, draggedNode);

    buildTree();
    persistOrder(node.parent);
  });
}

async function persistOrder(parentNode) {
  const names = parentNode.children.map(c => c.name);
  statusSyncEl.textContent = '⟲ guardando…';
  try {
    await saveOrderForPath(parentNode.pathKey, names);
    savedOrder[parentNode.pathKey] = names;
    statusSyncEl.textContent = '✓ orden guardado';
  } catch (e) {
    console.error(e);
    statusSyncEl.textContent = '⚠ error al guardar';
  }
}

// ---------- Favoritos: refresco centralizado de ambas vistas ----------
function toggleFavorito(path) {
  alternarFavorito(path);
  if (root) buildTree();
  renderFavoritos();
}

function renderFavoritos() {
  if (!favoritosListEl) return;
  const items = [...favoritos]
    .map(path => root && findByPath(root, path))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  if (!items.length) {
    favoritosListEl.innerHTML = `<div class="search-empty">Aún no tienes ningún apunte marcado. Pulsa la ☆ junto a un archivo del explorador para guardarlo aquí.</div>`;
    return;
  }

  favoritosListEl.innerHTML = '';
  items.forEach(node => {
    const crumbs = crumbsFor(node);
    const el = document.createElement('div');
    el.className = 'fav-item';
    el.innerHTML = `${fileIcon(node.name)}<div class="fav-info"><div class="fav-name">${node.name}</div>`
      + `<div class="fav-crumbs">${crumbs.join(' / ')}</div></div>`
      + `<button class="fav-remove" title="Quitar de favoritos">${ICON_STAR_FILL}</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.fav-remove')) { toggleFavorito(node.path); return; }
      openFile(node, crumbs);
    });
    favoritosListEl.appendChild(el);
  });
}

// ---------- Vistas de la sidebar (Explorador / Buscar / Favoritos) ----------
const explorerViewEl = document.getElementById('view-explorer');
const searchViewEl = document.getElementById('view-search');
const favoritosViewEl = document.getElementById('view-favoritos');
const navExplorer = document.getElementById('nav-explorer');
const navSearch = document.getElementById('nav-search');
const navFavoritos = document.getElementById('nav-favoritos');

let vistaActual = 'explorer';

function sidebarOculta() { return sidebarEl.style.display === 'none'; }
function mostrarSidebar() { sidebarEl.style.display = ''; }
function ocultarSidebar() { sidebarEl.style.display = 'none'; }
function alternarSidebar() { sidebarEl.style.display = sidebarOculta() ? '' : 'none'; }

function mostrarVista(nombre) {
  vistaActual = nombre;
  explorerViewEl.hidden = nombre !== 'explorer';
  searchViewEl.hidden = nombre !== 'search';
  favoritosViewEl.hidden = nombre !== 'favoritos';
  navExplorer.classList.toggle('active', nombre === 'explorer');
  navSearch.classList.toggle('active', nombre === 'search');
  navFavoritos.classList.toggle('active', nombre === 'favoritos');
  if (nombre === 'search') { iniciarIndiceBusqueda(); searchInputEl.focus(); }
  if (nombre === 'favoritos') renderFavoritos();
}

// Un clic en un icono de la barra de actividad: si la sidebar está oculta, la
// muestra con esa vista; si ya se ve esa misma vista, la oculta (esto hace
// que el icono de Explorador se comporte exactamente como Ctrl+B); si se ve
// otra vista, simplemente cambia a la pedida.
function clicNav(nombre) {
  if (sidebarOculta()) { mostrarSidebar(); mostrarVista(nombre); return; }
  if (vistaActual === nombre) { ocultarSidebar(); return; }
  mostrarVista(nombre);
}

navExplorer.addEventListener('click', () => clicNav('explorer'));
navSearch.addEventListener('click', () => clicNav('search'));
navFavoritos.addEventListener('click', () => clicNav('favoritos'));

// ---------- Buscador: indexa el contenido de todos los apuntes ----------
let indiceListo = false;
let indiceEnCurso = null;
const textoIndexado = {}; // nodeId -> texto plano en minúsculas

function todosLosArchivos(node, out) {
  if (node.type === 'file') { out.push(node); return out; }
  (node.children || []).forEach(c => todosLosArchivos(c, out));
  return out;
}

function htmlAPlano(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ');
}

async function indexarArchivo(node) {
  try {
    const res = await fetch(rawUrl(node.path), { cache: 'no-store' });
    if (!res.ok) return;
    const raw = await res.text();
    contentCache[node.path] = raw; // aprovecha para no re-descargar al abrir el archivo
    const esHtml = /\.(html?)$/i.test(node.path);
    textoIndexado[node.id] = (esHtml ? htmlAPlano(raw) : raw).toLowerCase();
  } catch (e) { /* si un archivo falla, sencillamente no aparecerá en resultados */ }
}

// Indexa con un máximo de 5 descargas en paralelo, para no saturar la CDN.
async function construirIndice(archivos) {
  const cola = [...archivos];
  let hechos = 0;
  const total = cola.length;
  searchStatusEl.textContent = `Indexando apuntes… (0/${total})`;

  async function trabajador() {
    while (cola.length) {
      const nodo = cola.shift();
      await indexarArchivo(nodo);
      hechos++;
      searchStatusEl.textContent = `Indexando apuntes… (${hechos}/${total})`;
    }
  }
  await Promise.all(Array.from({ length: 5 }, trabajador));
  indiceListo = true;
  searchStatusEl.textContent = '';
  ejecutarBusqueda();
}

function iniciarIndiceBusqueda() {
  if (indiceListo || indiceEnCurso || !root) return;
  const archivos = todosLosArchivos(root, []);
  indiceEnCurso = construirIndice(archivos);

  // Rellena el filtro de asignaturas con las carpetas de segundo nivel
  // (curso/asignatura), sin duplicados.
  const asignaturas = new Set();
  (root.children || []).forEach(curso => {
    (curso.children || []).forEach(c => { if (c.type === 'folder') asignaturas.add(c.name); });
  });
  [...asignaturas].sort((a, b) => a.localeCompare(b, 'es')).forEach(nombre => {
    const opt = document.createElement('option');
    opt.value = nombre;
    opt.textContent = nombre.replace(/-/g, ' ');
    searchFiltroEl.appendChild(opt);
  });
}

function coincideFiltro(node, filtro) {
  if (!filtro) return true;
  let p = node.parent;
  while (p) { if (p.name === filtro) return true; p = p.parent; }
  return false;
}

function snippetCon(texto, q) {
  const idx = texto.indexOf(q);
  if (idx === -1) return '';
  const inicio = Math.max(0, idx - 40);
  const fin = Math.min(texto.length, idx + q.length + 60);
  let frag = texto.slice(inicio, fin);
  if (inicio > 0) frag = '…' + frag;
  if (fin < texto.length) frag += '…';
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  return frag.replace(re, m => `<mark>${m}</mark>`);
}

function ejecutarBusqueda() {
  const q = searchInputEl.value.trim().toLowerCase();
  const filtro = searchFiltroEl.value;

  if (!q) {
    searchResultsEl.innerHTML = indiceListo
      ? `<div class="search-empty">Escribe algo para buscar en todos tus apuntes.</div>`
      : '';
    return;
  }
  if (!indiceListo) return; // se relanza sola cuando termine de indexar

  const archivos = todosLosArchivos(root, []).filter(n => coincideFiltro(n, filtro));
  const resultados = archivos
    .map(node => {
      const nombreCoincide = node.name.toLowerCase().includes(q);
      const texto = textoIndexado[node.id] || '';
      const textoCoincide = texto.includes(q);
      if (!nombreCoincide && !textoCoincide) return null;
      return { node, snippet: textoCoincide ? snippetCon(texto, q) : '' };
    })
    .filter(Boolean)
    .slice(0, 60);

  if (!resultados.length) {
    searchResultsEl.innerHTML = `<div class="search-empty">Sin resultados para "${q}".</div>`;
    return;
  }

  searchResultsEl.innerHTML = '';
  resultados.forEach(({ node, snippet }) => {
    const crumbs = crumbsFor(node);
    const el = document.createElement('div');
    el.className = 'search-result';
    el.innerHTML = `<div class="sr-name">${fileIcon(node.name)}<span>${node.name}</span></div>`
      + `<div class="sr-crumbs">${crumbs.join(' / ')}</div>`
      + (snippet ? `<div class="sr-snippet">${snippet}</div>` : '');
    el.addEventListener('click', () => openFile(node, crumbs));
    searchResultsEl.appendChild(el);
  });
}

let temporizadorBusqueda = null;
searchInputEl.addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(ejecutarBusqueda, 200);
});
searchFiltroEl.addEventListener('change', ejecutarBusqueda);

// ---------- Tabs ----------
function openFile(fileNode, crumbs) {
  let tab = openTabs.find(t => t.path === fileNode.path);
  if (!tab) {
    tab = { path: fileNode.path, name: fileNode.name, crumbs };
    openTabs.push(tab);
  }
  activatePath(fileNode.path);
}

function activatePath(path) {
  activePath = path;
  highlightSelected(path);
  renderTabbar();
  renderBreadcrumbs();
  renderEditor(path);
}

function closeTab(path, evt) {
  if (evt) evt.stopPropagation();
  const idx = openTabs.findIndex(t => t.path === path);
  if (idx === -1) return;
  openTabs.splice(idx, 1);

  if (activePath === path) {
    if (openTabs.length) {
      const next = openTabs[Math.max(0, idx - 1)];
      activatePath(next.path);
    } else {
      activePath = null;
      renderTabbar();
      renderBreadcrumbs();
      showWelcome();
    }
  } else {
    renderTabbar();
  }
}

function renderTabbar() {
  tabbarEl.innerHTML = '';
  openTabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.path === activePath ? ' active' : '');
    el.innerHTML = `${fileIcon(tab.name).replace('width="16" height="16"', 'width="15" height="15"')}<span class="label">${tab.name}</span><span class="tab-close">${ICON_CLOSE}</span>`;
    el.addEventListener('click', () => activatePath(tab.path));
    el.querySelector('.tab-close').addEventListener('click', (e) => closeTab(tab.path, e));
    tabbarEl.appendChild(el);
  });
}

function renderBreadcrumbs() {
  const tab = openTabs.find(t => t.path === activePath);
  if (!tab) {
    breadcrumbsEl.innerHTML = '';
    breadcrumbsEl.classList.add('empty');
    titlebarPathEl.textContent = 'Apuntes DAM';
    return;
  }
  breadcrumbsEl.classList.remove('empty');
  const parts = [...tab.crumbs, tab.name];
  breadcrumbsEl.innerHTML = parts.map((p, i) =>
    (i > 0 ? '<span class="crumb-sep">›</span>' : '') + `<span>${p}</span>`
  ).join('');
  titlebarPathEl.textContent = `${tab.name} — Apuntes DAM`;
}

// ---------- Render note content ----------
function rawUrl(path) {
  return `https://raw.githubusercontent.com/${ghOwner}/${ghRepo}/${ghBranch}/${path}`;
}

// Las notas HTML se pintan con `srcdoc`, y en un srcdoc las rutas relativas se resuelven contra index.html,
// no contra el archivo de la nota. Las notas enlazan sus recursos con rutas relativas a SU propia carpeta
// (p. ej. ../../css/styles.css y ../../js/horario.js), así que se añade un <base> con la ubicación real
// de la nota en el sitio. Con eso las mismas rutas funcionan dentro de la app y abriendo la nota directamente.
function conBase(html, path) {
  const noteUrl = new URL(path.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
  const base = `<base href="${noteUrl}">`;
  const abreHead = /<head(\s[^>]*)?>/i; // ojo: no debe coincidir con <header>
  return abreHead.test(html) ? html.replace(abreHead, m => m + base) : base + html;
}

// Efecto secundario del <base>: un enlace `href="#algo"` pasaría a apuntar a la URL real de la nota y
// recargaría el iframe. Se convierte en un simple salto dentro del propio documento.
function arreglaAnclas(iframe) {
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented) return; // la nota ya lo gestiona por su cuenta
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const destino = id ? doc.getElementById(id) : null;
    if (destino) destino.scrollIntoView(); else if (!id) doc.documentElement.scrollTop = 0;
  });
}

async function renderEditor(path) {
  const isHtml = /\.(html?|HTML?)$/.test(path);
  editorContentEl.classList.add('loading');
  statusLangEl.textContent = isHtml ? 'HTML' : 'Markdown';

  let raw = contentCache[path];
  if (!raw) {
    try {
      const res = await fetch(rawUrl(path), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      raw = await res.text();
      contentCache[path] = raw;
    } catch (e) {
      editorContentEl.classList.remove('full-bleed');
      editorContentEl.innerHTML = `<div class="note"><p style="color:#f48771;">No se pudo cargar <code>${path}</code> desde GitHub (${e.message}).</p></div>`;
      editorContentEl.classList.remove('loading');
      return;
    }
  }

  if (activePath !== path) return; // el usuario cambió de pestaña mientras cargaba

  if (isHtml) {
    editorContentEl.classList.add('full-bleed');
    editorContentEl.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'html-frame';
    iframe.sandbox = 'allow-same-origin allow-scripts allow-popups allow-forms';
    iframe.srcdoc = conBase(raw, path);
    iframe.addEventListener('load', () => arreglaAnclas(iframe));
    editorContentEl.appendChild(iframe);
  } else {
    editorContentEl.classList.remove('full-bleed');
    const html = marked.parse(raw);
    editorContentEl.innerHTML = `<div class="note">${html}</div>`;
    editorContentEl.scrollTop = 0;
  }
  editorContentEl.classList.remove('loading');
}

function showWelcome() {
  editorContentEl.classList.remove('full-bleed');
  editorContentEl.innerHTML = `
    <div class="welcome">
      <svg viewBox="0 0 24 24" width="64" height="64"><path fill="#3c3c3c" d="M17.5 2.4L9.4 9.7 4.8 6.1 2.7 7l4.1 5-4.1 5 2.1.9 4.6-3.6 8.1 7.3 4.8-2.3V4.7l-4.8-2.3zM17.5 16l-4.6-4 4.6-4v8z"/></svg>
      <h1>Apuntes de DAM</h1>
      <p>Selecciona un archivo del explorador para empezar a leer.</p>
      <div class="welcome-shortcuts">
        <div><span class="kbd">Esc</span> — cerrar pestaña activa</div>
        <div><span class="kbd">Ctrl</span> + <span class="kbd">B</span> — mostrar/ocultar explorador</div>
      </div>
    </div>`;
}

// ---------- Atajos reales ----------
document.addEventListener('keydown', (e) => {
  // Esc cierra la pestaña activa (libre, ningún navegador lo reserva)
  if (e.key === 'Escape' && activePath) {
    closeTab(activePath);
    return;
  }
  // Ctrl/Cmd+B alterna el explorador (atajo real de VS Code, libre en el navegador)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    alternarSidebar();
  }
});

// ---------- Cuenta ----------
// El acceso (botón del header, modal de login/registro) vive en firebase-init.js.
// Aquí solo se reacciona a la sesión: cualquiera puede registrarse, pero el modo
// edición (arrastrar carpetas y archivos) es solo de la cuenta autorizada.
watchAuth((user) => {
  const authorized = isAuthorized(user);
  editMode = authorized;
  editBadgeEl.toggleAttribute('hidden', !authorized);

  if (root) buildTree(); // re-render para mostrar/ocultar los "grips" de arrastre
});

// ---------- Ajustes (tema, acento, tamaño de letra, fuente, Zen, recargar) ----------
const CLAVE_AJUSTES = 'damNotesAjustes';
let ajustes = { theme: 'dark', accent: '', fontsize: 100, fontfamily: 'cascadia', zen: false };
try { Object.assign(ajustes, JSON.parse(localStorage.getItem(CLAVE_AJUSTES) || '{}')); } catch (e) { }

function guardarAjustes() {
  try { localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes)); } catch (e) { }
}

const FUENTES = {
  cascadia: `"Cascadia Code", "SF Mono", Consolas, "Courier New", monospace`,
  fira: `"Fira Code", "Cascadia Code", Consolas, monospace`,
  jetbrains: `"JetBrains Mono", "Cascadia Code", Consolas, monospace`,
};

const settingsIcon = document.getElementById('settings-icon');
const settingsPopover = document.getElementById('settings-popover');
const themeDarkBtn = document.getElementById('theme-dark');
const themeLightBtn = document.getElementById('theme-light');
const accentSwatches = document.querySelectorAll('.accent-swatch');
const fontsizeMenos = document.getElementById('fontsize-menos');
const fontsizeMas = document.getElementById('fontsize-mas');
const fontsizeValor = document.getElementById('fontsize-valor');
const fontfamilySelect = document.getElementById('fontfamily-select');
const zenToggleBtn = document.getElementById('zen-toggle');
const reloadTreeBtn = document.getElementById('reload-tree');

function aplicarAjustes() {
  document.documentElement.setAttribute('data-theme', ajustes.theme === 'light' ? 'light' : '');
  document.documentElement.setAttribute('data-accent', ajustes.accent || '');
  document.documentElement.style.setProperty('--note-scale', ajustes.fontsize / 100);
  document.documentElement.style.setProperty('--font-mono', FUENTES[ajustes.fontfamily] || FUENTES.cascadia);

  themeDarkBtn.classList.toggle('active', ajustes.theme !== 'light');
  themeLightBtn.classList.toggle('active', ajustes.theme === 'light');
  accentSwatches.forEach(s => s.classList.toggle('active', (s.dataset.accent || '') === (ajustes.accent || '')));
  fontsizeValor.textContent = ajustes.fontsize + '%';
  fontfamilySelect.value = ajustes.fontfamily;

  aplicarZen(ajustes.zen);
}

settingsIcon.addEventListener('click', () => {
  settingsPopover.hidden = !settingsPopover.hidden;
});
document.addEventListener('click', (e) => {
  if (!settingsPopover.hidden && !settingsPopover.contains(e.target) && !settingsIcon.contains(e.target)) {
    settingsPopover.hidden = true;
  }
});

themeDarkBtn.addEventListener('click', () => { ajustes.theme = 'dark'; guardarAjustes(); aplicarAjustes(); });
themeLightBtn.addEventListener('click', () => { ajustes.theme = 'light'; guardarAjustes(); aplicarAjustes(); });

accentSwatches.forEach(sw => {
  sw.addEventListener('click', () => { ajustes.accent = sw.dataset.accent || ''; guardarAjustes(); aplicarAjustes(); });
});

fontsizeMenos.addEventListener('click', () => {
  ajustes.fontsize = Math.max(80, ajustes.fontsize - 10);
  guardarAjustes(); aplicarAjustes();
});
fontsizeMas.addEventListener('click', () => {
  ajustes.fontsize = Math.min(150, ajustes.fontsize + 10);
  guardarAjustes(); aplicarAjustes();
});

fontfamilySelect.addEventListener('change', () => {
  ajustes.fontfamily = fontfamilySelect.value;
  guardarAjustes(); aplicarAjustes();
});

// ---------- Modo Zen ----------
let zenSalirBtn = null;
function aplicarZen(activo) {
  document.body.classList.toggle('zen', !!activo);
  zenToggleBtn.classList.toggle('zen-activo', !!activo);
  zenToggleBtn.textContent = activo ? '🧘 Salir del modo Zen' : '🧘 Modo Zen';

  if (activo && !zenSalirBtn) {
    zenSalirBtn = document.createElement('button');
    zenSalirBtn.className = 'zen-salir';
    zenSalirBtn.textContent = 'Salir del modo Zen (Esc)';
    zenSalirBtn.addEventListener('click', () => { ajustes.zen = false; guardarAjustes(); aplicarAjustes(); });
    document.body.appendChild(zenSalirBtn);
  } else if (!activo && zenSalirBtn) {
    zenSalirBtn.remove();
    zenSalirBtn = null;
  }
}

zenToggleBtn.addEventListener('click', () => {
  ajustes.zen = !ajustes.zen;
  guardarAjustes(); aplicarAjustes();
  settingsPopover.hidden = true;
});

// Esc sale del modo Zen con prioridad sobre cerrar la pestaña activa.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ajustes.zen) {
    e.stopPropagation();
    e.preventDefault();
    ajustes.zen = false;
    guardarAjustes();
    aplicarAjustes();
  }
}, true); // captura: se ejecuta antes que el atajo de cerrar pestaña

// ---------- Recargar árbol de archivos ----------
reloadTreeBtn.addEventListener('click', async () => {
  reloadTreeBtn.textContent = '⟲ Recargando…';
  reloadTreeBtn.disabled = true;
  await cargarArbol();
  reloadTreeBtn.textContent = '✓ Actualizado';
  setTimeout(() => {
    reloadTreeBtn.textContent = '⟲ Recargar árbol de archivos';
    reloadTreeBtn.disabled = false;
  }, 1200);
});

aplicarAjustes();
