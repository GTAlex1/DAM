import { auth, isAuthorized, watchAuth, login, logout, loadOrder, saveOrderForPath } from './firebase-init.js';

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

let root = null;            // raíz del árbol en memoria (con parent/id/pathKey)
let savedOrder = {};        // orden guardado en Firestore { pathKey: [nombres] }
const openTabs = [];        // { path, name, crumbs: [..] }
let activePath = null;
const contentCache = {};
const collapsedIds = new Set();
let editMode = false;
let nextId = 1;
const nodesById = {};

// ---------- Icons ----------
const ICON_FOLDER = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg>`;
const ICON_FOLDER_OPEN = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM4 6h5.17l2 2H20v10H4V6z"/></svg>`;
const ICON_MD = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2" fill="#519aba"/><text x="12" y="16" font-size="8.5" font-family="monospace" font-weight="700" fill="#1e1e1e" text-anchor="middle">MD</text></svg>`;
const ICON_CHEVRON = `<svg class="chevron" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M6 4l4 4-4 4V4z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 8.7l3.15 3.15.7-.7L8.7 8l3.15-3.15-.7-.7L8 7.3 4.85 4.15l-.7.7L7.3 8l-3.15 3.15.7.7z"/></svg>`;
const ICON_GRIP = `<svg class="grip" viewBox="0 0 16 16" width="12" height="16"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>`;

// ---------- Load manifest + saved order ----------
Promise.all([
  fetch('manifest.json').then(r => r.json()),
  loadOrder(),
]).then(([manifestData, orderData]) => {
  savedOrder = orderData || {};
  root = manifestData;
  annotateTree(root, null, 'root');
  applySavedOrder(root);
  buildTree();
}).catch(() => {
  fileTreeEl.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;">No se pudo cargar manifest.json (¿estás sirviendo el sitio por http:// y no por file://?)</div>`;
});

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
      row.innerHTML = `${grip}<span style="width:16px;flex-shrink:0;"></span>${ICON_MD}<span class="label">${child.name}</span>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.grip-handle')) return;
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
    el.innerHTML = `${ICON_MD.replace('width="16" height="16"', 'width="15" height="15"')}<span class="label">${tab.name}</span><span class="tab-close">${ICON_CLOSE}</span>`;
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
async function renderEditor(path) {
  editorContentEl.classList.add('loading');
  statusLangEl.textContent = 'Markdown';

  let raw = contentCache[path];
  if (!raw) {
    try {
      const res = await fetch(path);
      raw = await res.text();
      contentCache[path] = raw;
    } catch (e) {
      editorContentEl.innerHTML = `<div class="note"><p style="color:#f48771;">No se pudo cargar ${path}</p></div>`;
      editorContentEl.classList.remove('loading');
      return;
    }
  }

  if (activePath !== path) return; // el usuario cambió de pestaña mientras cargaba

  const html = marked.parse(raw);
  editorContentEl.innerHTML = `<div class="note">${html}</div>`;
  editorContentEl.scrollTop = 0;
  editorContentEl.classList.remove('loading');
}

function showWelcome() {
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
    sidebarEl.style.display = (sidebarEl.style.display === 'none') ? '' : 'none';
  }
});

// ---------- Cuenta / login ----------
const accountIcon = document.getElementById('account-icon');
const accountPopover = document.getElementById('account-popover');
const loginView = document.getElementById('login-view');
const accountView = document.getElementById('account-view');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmit = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');
const logoutSubmit = document.getElementById('logout-submit');
const accountEmailEl = document.getElementById('account-email');
const accountStatusEl = document.getElementById('account-status');

accountIcon.addEventListener('click', () => {
  const hidden = accountPopover.hasAttribute('hidden');
  if (hidden) accountPopover.removeAttribute('hidden'); else accountPopover.setAttribute('hidden', '');
});
document.addEventListener('click', (e) => {
  if (!accountPopover.contains(e.target) && !accountIcon.contains(e.target)) {
    accountPopover.setAttribute('hidden', '');
  }
});

loginSubmit.addEventListener('click', async () => {
  loginError.setAttribute('hidden', '');
  try {
    await login(loginEmail.value.trim(), loginPassword.value);
  } catch (e) {
    loginError.textContent = 'No se pudo iniciar sesión. Revisa el correo y la contraseña.';
    loginError.removeAttribute('hidden');
  }
});
[loginEmail, loginPassword].forEach(input => {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginSubmit.click(); });
});
logoutSubmit.addEventListener('click', () => logout());

watchAuth((user) => {
  const authorized = isAuthorized(user);
  editMode = authorized;
  accountIcon.classList.toggle('active', !!user);
  editBadgeEl.toggleAttribute('hidden', !authorized);

  if (user) {
    loginView.setAttribute('hidden', '');
    accountView.removeAttribute('hidden');
    accountEmailEl.textContent = user.email;
    accountStatusEl.textContent = authorized
      ? 'Puedes arrastrar carpetas y archivos para reordenarlos.'
      : 'Esta cuenta no tiene permiso de edición.';
  } else {
    loginView.removeAttribute('hidden');
    accountView.setAttribute('hidden', '');
    loginEmail.value = '';
    loginPassword.value = '';
  }

  if (root) buildTree(); // re-render para mostrar/ocultar los "grips" de arrastre
});
