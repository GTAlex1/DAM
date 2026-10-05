// movil.js — interfaz móvil (≤700 px). NO sustituye a app.js: lee el árbol que app.js ya pinta
// (#file-tree) y "pulsa" sus filas, así apertura de archivos, favoritos, búsqueda, Firebase y
// permisos siguen funcionando igual. En ordenador no hace nada.
const MQ = window.matchMedia('(max-width: 700px)');
const raizHtml = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);

// ---------- Utilidades ----------
function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  hijos.flat().forEach((c) => el.append(c));
  return el;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function ico(rutas, tam = 22) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', tam); s.setAttribute('height', tam);
  s.setAttribute('class', 'm-ico'); s.setAttribute('aria-hidden', 'true');
  rutas.forEach((d) => { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p); });
  return s;
}
const I = {
  buscar: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  cuenta: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6'],
  atras: ['m15 6-6 6 6 6'],
  der: ['m9 6 6 6-6 6'], abajo: ['m6 9 6 6 6-6'],
  estrella: ['M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z'],
  inicio: ['M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  apuntes: ['M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z', 'M5 16a4 4 0 0 1 4-4h10'],
  horario: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  calendario: ['M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M8 3v4M16 3v4M4 10h16'],
};

// ---------- Lectura del árbol de app.js ----------
const esCarpeta = (n) => !!n.querySelector(':scope > .tree-children');
const etiqueta = (n) => n.querySelector(':scope > .tree-row .label')?.textContent ?? '';
const filaDe = (n) => n.querySelector(':scope > .tree-row');
const hijosDe = (n) => [...n.querySelectorAll(':scope > .tree-children > .tree-node')];
function archivosDe(n, out = []) {
  hijosDe(n).forEach((c) => (esCarpeta(c) ? archivosDe(c, out) : out.push(c)));
  return out;
}
function leerMaterias() {
  const raiz = $('#file-tree');
  if (!raiz) return { materias: [], todos: [] };
  const tops = [...raiz.children].filter((n) => n.classList.contains('tree-node') && esCarpeta(n));
  let materias = tops.flatMap((c) => hijosDe(c).filter(esCarpeta));
  if (!materias.length) materias = tops; // estructura distinta: cada carpeta de primer nivel es una asignatura
  return { materias, todos: [...raiz.querySelectorAll('.tree-node')] };
}
function buscarArchivo(todos, re) {
  return todos.find((n) => !esCarpeta(n) && re.test(etiqueta(n)));
}

// ---------- Presentación de nombres y colores ----------
const quitarAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NOMBRES = { programacion: 'Programación', 'sistemas-informaticos': 'Sistemas Informáticos', digitalizacion: 'Digitalización' };
function nombreMateria(crudo) {
  const clave = quitarAcentos(crudo).toLowerCase();
  return NOMBRES[clave] ?? crudo.replace(/[-_]+/g, ' ');
}
const nombreArchivo = (crudo) => crudo.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
const tipoArchivo = (crudo) => (crudo.split('.').pop() || '').slice(0, 4).toUpperCase();
const PALETA = ['#6AA9FF', '#7BE0A8', '#FFA45C', '#C58BFF', '#FF7A8A', '#5FD6D6'];
const CONOCIDOS = [['bases', 0], ['entornos', 1], ['lenguajes', 2], ['program', 3], ['sistemas', 4], ['digital', 5]];
function colorMateria(crudo) {
  const k = quitarAcentos(crudo).toLowerCase();
  const c = CONOCIDOS.find(([p]) => k.includes(p));
  if (c) return PALETA[c[1]];
  let hsh = 0; for (const ch of k) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[hsh % PALETA.length];
}
function iniciales(nombre) {
  const p = nombre.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  const base = p.length > 1 ? p[0][0] + p[1][0] : nombre.replace(/\s/g, '').slice(0, 2);
  return base.toUpperCase();
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------- Estructura (se crea una vez) ----------
const abiertas = new Set(); // asignaturas desplegadas en Apuntes
let pantalla = 'inicio';
let previa = 'inicio';

const inicioWrap = h('div', { class: 'm-wrap' });
const apuntesWrap = h('div', { class: 'm-wrap' });
const buscarWrap = h('div', { class: 'm-wrap' });
const barraTitulo = h('div', { class: 'm-bar-titulo' });
const raizMovil = h('div', { id: 'movil-root' },
  h('section', { class: 'm-pantalla', id: 'm-inicio', 'aria-label': 'Inicio' }, inicioWrap),
  h('section', { class: 'm-pantalla', id: 'm-apuntes', 'aria-label': 'Apuntes' }, apuntesWrap),
  h('section', { class: 'm-pantalla', id: 'm-buscar', 'aria-label': 'Buscar' }, buscarWrap),
  h('header', { class: 'm-bar' },
    h('button', { class: 'm-btn-ico m-atras', 'aria-label': 'Volver', onclick: () => volver() }, ico(I.atras)),
    barraTitulo),
);
const nav = h('nav', { class: 'm-nav', 'aria-label': 'Principal' });
const TABS = [['inicio', 'Inicio'], ['apuntes', 'Apuntes'], ['horario', 'Horario'], ['calendario', 'Calendario']];
TABS.forEach(([id, texto]) => nav.append(
  h('button', { type: 'button', 'data-tab': id, onclick: () => irATab(id) }, h('span', {}, ico(I[id])), texto)));
raizMovil.append(nav);
document.body.append(raizMovil);

// ---------- Navegación ----------
function ir(p, titulo) {
  pantalla = p;
  raizHtml.dataset.pantalla = p;
  if (titulo !== undefined) barraTitulo.textContent = titulo;
  nav.querySelectorAll('button').forEach((b) => {
    if (b.dataset.tab === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  raizMovil.querySelectorAll('.m-pantalla').forEach((s) => { s.scrollTop = 0; });
}
function irATab(id) {
  if (id === 'horario' || id === 'calendario') return abrirNota(id);
  ir(id);
}
function abrirNota(id) {
  const { todos } = leerMaterias();
  const n = buscarArchivo(todos, new RegExp(`^${id}(\\.html?)?$`, 'i'));
  if (!n) { ir('inicio'); return; }
  filaDe(n).click();
  ir(id, id === 'horario' ? 'Horario' : 'Calendario');
}
function abrirArchivo(n) {
  previa = pantalla;
  history.pushState({ movil: 1 }, '');
  filaDe(n).click(); // app.js abre el archivo con su lógica de siempre
  ir('lector', nombreArchivo(etiqueta(n)));
}
function volver() { history.back(); } // el botón atrás del móvil hace lo mismo (popstate)
window.addEventListener('popstate', () => {
  if (!MQ.matches) return;
  if (pantalla === 'lector' || pantalla === 'buscar') ir(previa === 'lector' ? 'apuntes' : previa);
});

// ---------- Pantalla Inicio ----------
function saludo() {
  const hr = new Date().getHours();
  return hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buenos días' : hr < 21 ? 'Buenas tardes' : 'Buenas noches';
}
function botonCuenta() {
  const u = $('#auth-user');
  const destino = u && !u.hidden ? $('#btn-perfil-trigger') : $('#btn-auth-trigger');
  destino?.click();
}
const btnCuenta = h('button', { type: 'button', class: 'm-btn-ico', 'aria-label': 'Cuenta', onclick: botonCuenta }, ico(I.cuenta));
const btnInstalar = h('button', { type: 'button', class: 'm-instalar', onclick: () => $('#btn-instalar')?.click() }, 'Instalar app');
function sincronizarInstalar() {
  // El botón de cuenta se ilumina mientras haya un modal de cuenta abierto.
const modalesCuenta = ['#modal-auth', '#modal-perfil'].map((q) => $(q)).filter(Boolean);
const syncCuenta = () => btnCuenta.classList.toggle('activo', modalesCuenta.some((m) => !m.hidden));
modalesCuenta.forEach((m) => new MutationObserver(syncCuenta).observe(m, { attributes: true, attributeFilter: ['hidden'] }));
const original = $('#btn-instalar');
  btnInstalar.classList.toggle('visible', !!original && !original.hidden);
}
function pintarInicio(materias) {
  const grid = h('div', { class: 'm-grid' });
  materias.forEach((m) => {
    const crudo = etiqueta(m), nom = nombreMateria(crudo), n = archivosDe(m).length;
    grid.append(h('button', { type: 'button', class: 'm-card', onclick: () => { abiertas.add(crudo); pintarApuntes(); ir('apuntes'); } },
      h('span', { class: 'm-badge', style: `background:${colorMateria(crudo)}` }, iniciales(nom)),
      h('span', {}, h('b', {}, nom), h('i', {}, plural(n, 'archivo', 'archivos')))));
  });
  inicioWrap.replaceChildren(
    h('div', { class: 'm-cab' },
      h('div', {}, h('div', { class: 'm-sub' }, saludo()), h('h1', { class: 'm-h1' }, 'Apuntes DAM')),
      h('div', { class: 'm-acciones' },
        h('button', { type: 'button', class: 'm-btn-ico', 'aria-label': 'Buscar', onclick: abrirBuscar }, ico(I.buscar)),
        btnCuenta)),
    h('button', { type: 'button', class: 'm-hero', onclick: () => irATab('calendario') },
      h('small', {}, 'Calendario'), h('strong', {}, 'Exámenes y tareas'), h('span', {}, 'Toca para ver lo próximo')),
    btnInstalar,
    h('div', { class: 'm-seccion' }, h('h2', { class: 'm-h2' }, 'Asignaturas'),
      h('span', { class: 'm-sub' }, plural(materias.length, 'asignatura', 'asignaturas'))),
    materias.length ? grid : h('p', { class: 'm-vacio' }, 'Cargando apuntes…'));
  sincronizarInstalar();
}

// ---------- Pantalla Apuntes ----------
function pintarApuntes() {
  const { materias } = leerMaterias();
  const total = materias.reduce((s, m) => s + archivosDe(m).length, 0);
  const lista = h('div', { class: 'm-lista' });
  materias.forEach((m) => {
    const crudo = etiqueta(m), nom = nombreMateria(crudo), color = colorMateria(crudo), arch = archivosDe(m);
    const abierta = abiertas.has(crudo);
    const cuerpo = h('div', { class: 'm-archivos' });
    arch.forEach((a) => {
      const estrella = filaDe(a)?.querySelector('.fav-star');
      const fav = !!estrella?.classList.contains('activo');
      cuerpo.append(h('div', { class: 'm-archivo' },
        h('span', { class: 'm-tipo', style: `color:${color}` }, tipoArchivo(etiqueta(a))),
        h('button', { type: 'button', class: 'm-nombre', onclick: () => abrirArchivo(a) }, nombreArchivo(etiqueta(a))),
        h('button', { type: 'button', class: `m-fav${fav ? ' activo' : ''}`, 'aria-pressed': String(fav),
          'aria-label': `${fav ? 'Quitar de' : 'Añadir a'} favoritos: ${nombreArchivo(etiqueta(a))}`,
          onclick: () => estrella?.click() }, ico(I.estrella))));
    });
    lista.append(h('div', { class: `m-mat${abierta ? ' abierta' : ''}` },
      h('button', { type: 'button', class: 'm-mat-cab', 'aria-expanded': String(abierta), onclick: () => {
        if (abiertas.has(crudo)) abiertas.delete(crudo); else abiertas.add(crudo);
        pintarApuntes();
      } },
        h('span', { class: 'm-badge', style: `background:${color}` }, iniciales(nom)),
        h('span', { class: 'm-txt' }, h('b', {}, nom), h('i', {}, plural(arch.length, 'archivo', 'archivos'))),
        ico(abierta ? I.abajo : I.der, 20)),
      cuerpo));
  });
  const y = $('#m-apuntes').scrollTop;
  apuntesWrap.replaceChildren(
    h('div', { class: 'm-cab' },
      h('div', {}, h('div', { class: 'm-sub' }, `${plural(materias.length, 'asignatura', 'asignaturas')} · ${plural(total, 'archivo', 'archivos')}`),
        h('h1', { class: 'm-h1' }, 'Apuntes')),
      h('button', { type: 'button', class: 'm-btn-ico', 'aria-label': 'Buscar', onclick: abrirBuscar }, ico(I.buscar))),
    materias.length ? lista : h('p', { class: 'm-vacio' }, 'Cargando apuntes…'));
  $('#m-apuntes').scrollTop = y;
}

// ---------- Pantalla Buscar (reutiliza el buscador de app.js moviendo sus nodos) ----------
const movidos = []; // [nodo, padreOriginal, siguienteOriginal]
let indiceIniciado = false;
function mover(nodo, destino) {
  if (!nodo) return;
  movidos.push([nodo, nodo.parentNode, nodo.nextSibling]);
  destino.append(nodo);
}
function restaurarBuscador() {
  while (movidos.length) {
    const [nodo, padre, sig] = movidos.pop();
    if (padre) padre.insertBefore(nodo, sig && sig.parentNode === padre ? sig : null);
  }
}
function abrirBuscar() {
  if (!movidos.length) {
    const cab = h('div', { class: 'm-buscar-cab' },
      h('button', { type: 'button', class: 'm-btn-ico', 'aria-label': 'Volver', onclick: volver }, ico(I.atras)));
    buscarWrap.replaceChildren(h('div', { class: 'm-cab' }, h('h1', { class: 'm-h1' }, 'Buscar')), h('div', { style: 'height:16px' }), cab);
    mover($('.search-box'), cab);
    mover($('#search-status'), buscarWrap);
    mover($('#search-results'), buscarWrap);
  }
  if (!indiceIniciado) { $('#nav-search')?.click(); indiceIniciado = true; } // app.js empieza a indexar los apuntes
  previa = pantalla;
  history.pushState({ movil: 1 }, '');
  ir('buscar');
  setTimeout(() => $('#search-input')?.focus(), 60);
}
buscarWrap.addEventListener('click', (e) => {
  // Al pulsar un resultado, app.js abre el archivo; nosotros mostramos el lector.
  const r = e.target.closest('.search-result');
  if (!r) return;
  const titulo = r.querySelector('.sr-name span')?.textContent ?? '';
  previa = 'buscar';
  history.pushState({ movil: 1 }, '');
  ir('lector', nombreArchivo(titulo));
});

// ---------- Puesta en marcha ----------
let pendiente = false;
function repintar() {
  if (!MQ.matches || pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    const { materias } = leerMaterias();
    pintarInicio(materias);
    pintarApuntes();
  });
}
const arbol = $('#file-tree');
if (arbol) new MutationObserver(repintar).observe(arbol, { childList: true, subtree: true });
const original = $('#btn-instalar');
if (original) new MutationObserver(sincronizarInstalar).observe(original, { attributes: true, attributeFilter: ['hidden'] });

function aplicar() {
  raizHtml.classList.toggle('movil', MQ.matches);
  if (MQ.matches) { ir(pantalla === 'lector' ? 'apuntes' : pantalla); repintar(); }
  else { restaurarBuscador(); delete raizHtml.dataset.pantalla; }
}
MQ.addEventListener('change', aplicar);
aplicar();