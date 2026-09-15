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

let manifest = null;
const openTabs = []; // { path, name, crumbs: [..], content: null|string }
let activePath = null;
const contentCache = {};

// ---------- Icons ----------
const ICON_FOLDER = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg>`;
const ICON_FOLDER_OPEN = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><path fill="#dcb67a" d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM4 6h5.17l2 2H20v10H4V6z"/></svg>`;
const ICON_MD = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2" fill="#519aba"/><text x="12" y="16" font-size="8.5" font-family="monospace" font-weight="700" fill="#1e1e1e" text-anchor="middle">MD</text></svg>`;
const ICON_CHEVRON = `<svg class="chevron" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M6 4l4 4-4 4V4z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 8.7l3.15 3.15.7-.7L8.7 8l3.15-3.15-.7-.7L8 7.3 4.85 4.15l-.7.7L7.3 8l-3.15 3.15.7.7z"/></svg>`;

// ---------- Load manifest ----------
fetch('manifest.json')
  .then(r => r.json())
  .then(data => {
    manifest = data;
    renderTree(manifest, fileTreeEl, []);
  })
  .catch(() => {
    fileTreeEl.innerHTML = `<div style="padding:12px;color:#f48771;font-size:12px;">No se pudo cargar manifest.json (¿estás sirviendo el sitio por http:// y no por file://?)</div>`;
  });

// ---------- Build tree ----------
function renderTree(node, container, crumbs) {
  node.children.forEach(child => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (8 + crumbs.length * 14) + 'px';

    if (child.type === 'folder') {
      row.innerHTML = `${ICON_CHEVRON}${ICON_FOLDER}<span class="label">${child.name}</span>`;
      wrapper.appendChild(row);

      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';
      wrapper.appendChild(childrenEl);
      renderTree(child, childrenEl, [...crumbs, child.name]);

      row.addEventListener('click', () => {
        const collapsed = childrenEl.classList.toggle('collapsed');
        row.querySelector('.chevron').classList.toggle('collapsed', collapsed);
        row.querySelector('.icon').outerHTML = collapsed ? ICON_FOLDER : ICON_FOLDER_OPEN;
      });
    } else {
      row.innerHTML = `<span style="width:16px;flex-shrink:0;"></span>${ICON_MD}<span class="label">${child.name}</span>`;
      row.dataset.path = child.path;
      row.addEventListener('click', () => openFile(child, [...crumbs]));
      wrapper.appendChild(row);
    }

    container.appendChild(wrapper);
  });
}

function highlightSelected(path) {
  document.querySelectorAll('.tree-row.selected').forEach(el => el.classList.remove('selected'));
  const row = document.querySelector(`.tree-row[data-path="${CSS.escape(path)}"]`);
  if (row) row.classList.add('selected');
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
    titlebarPathEl.textContent = 'dam-notes';
    return;
  }
  breadcrumbsEl.classList.remove('empty');
  const parts = [...tab.crumbs, tab.name];
  breadcrumbsEl.innerHTML = parts.map((p, i) =>
    (i > 0 ? '<span class="crumb-sep">›</span>' : '') + `<span>${p}</span>`
  ).join('');
  titlebarPathEl.textContent = `${tab.name} — dam-notes`;
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

  if (activePath !== path) return; // user switched tabs while loading

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
        <div><span class="kbd">Ctrl</span> + <span class="kbd">P</span> — ir a un archivo</div>
        <div><span class="kbd">Ctrl</span> + <span class="kbd">W</span> — cerrar pestaña</div>
      </div>
    </div>`;
}

// ---------- Ctrl/Cmd+W closes active tab ----------
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
    if (activePath) {
      e.preventDefault();
      closeTab(activePath);
    }
  }
});
