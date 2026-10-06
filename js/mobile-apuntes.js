// mobile-apuntes.js — pantalla Apuntes (móvil): asignaturas desplegables con sus archivos.
// Reutiliza cargarAsignaturas() de mobile-inicio.js. Sin innerHTML; los módulos pesados se cargan bajo demanda.
import { el } from './dom.js';

const claveDe = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const nombreArchivo = (n) => n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
const tipoArchivo = (n) => (n.includes('.') ? n.split('.').pop().slice(0, 4).toUpperCase() : '');
const urlDe = (ruta) => new URL(ruta.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
const textoArchivos = (n) => `${n} ${n === 1 ? 'archivo' : 'archivos'}`;

function archivosDe(nodo, out = []) {
  for (const h of nodo.children ?? []) (h.type === 'file' ? out.push(h) : archivosDe(h, out));
  return out;
}

async function cargar() {
  const [{ cargarAsignaturas }, { fetchGithubTree }] = await Promise.all([
    import('./mobile-inicio.js?v=bdf10294'), import('./github-source.js?v=02537279'),
  ]);
  const [asignaturas, datos] = await Promise.all([cargarAsignaturas(), fetchGithubTree()]);
  const porClave = new Map();
  for (const curso of datos.root.children ?? []) {
    if (curso.type !== 'folder') continue;
    for (const c of curso.children ?? []) {
      if (c.type !== 'folder') continue;
      const k = claveDe(c.name);
      porClave.set(k, [...(porClave.get(k) ?? []), ...archivosDe(c)]);
    }
  }
  return asignaturas.map((a) => ({ ...a, files: porClave.get(a.clave) ?? [] }));
}

// Lector: el apunte se abre dentro de la app, con barra superior y botón Volver (también el «atrás» del móvil).
function abrirLector(titulo, url) {
  const raizApp = document.getElementById('mobile-app');
  const volver = el('button', 'ma-volver', '‹');
  volver.type = 'button';
  volver.setAttribute('aria-label', 'Volver a Apuntes');
  const barra = el('header', 'ma-barra');
  barra.append(volver, el('span', 'ma-barra-titulo', titulo));
  const marco = el('iframe', 'ma-marco');
  marco.src = url;
  marco.title = titulo;
  const lector = el('div', 'ma-lector');
  lector.append(barra, marco);
  raizApp.append(lector);
  history.pushState({ ma: 1 }, '');
  const alAtras = () => { lector.remove(); window.removeEventListener('popstate', alAtras); };
  window.addEventListener('popstate', alAtras);
  volver.addEventListener('click', () => history.back());
  volver.focus();
}

function crearAsignatura(a) {
  const caja = el('div', 'ma-mat');
  caja.dataset.clave = a.clave;
  const cab = el('button', 'ma-cab');
  cab.type = 'button';
  cab.setAttribute('aria-expanded', 'false');
  const chip = el('span', 'm-chip', a.iniciales);
  chip.dataset.color = a.color;
  chip.setAttribute('aria-hidden', 'true');
  const txt = el('span', 'ma-txt');
  txt.append(el('span', 'ma-nombre', a.nombre), el('span', 'ma-meta', textoArchivos(a.files.length)));
  const flecha = el('span', 'ma-flecha', '›');
  flecha.setAttribute('aria-hidden', 'true');
  cab.append(chip, txt, flecha);
  const cuerpo = el('div', 'ma-archivos');
  cuerpo.hidden = true;
  for (const f of a.files) {
    const enlace = el('a', 'ma-archivo');
    enlace.href = urlDe(f.path);
    enlace.append(el('span', 'ma-tipo', tipoArchivo(f.name)), el('span', 'ma-nom', nombreArchivo(f.name)));
    enlace.addEventListener('click', (e) => { e.preventDefault(); abrirLector(nombreArchivo(f.name), enlace.href); });
    cuerpo.append(enlace);
  }
  cab.addEventListener('click', () => {
    const abre = cuerpo.hidden;
    cuerpo.hidden = !abre;
    cab.setAttribute('aria-expanded', String(abre));
    caja.classList.toggle('abierta', abre);
  });
  caja.append(cab, cuerpo);
  return caja;
}

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const slot = raiz.querySelector('[data-m-slot="apuntes"]');
  const resumen = raiz.querySelector('#m-apuntes-resumen');
  let listo = false, cargando = false;

  const abrir = (clave) => {
    if (!clave) return;
    const caja = [...slot.querySelectorAll('.ma-mat')].find((c) => c.dataset.clave === clave);
    if (!caja) return;
    if (!caja.classList.contains('abierta')) caja.querySelector('.ma-cab').click();
    caja.scrollIntoView({ block: 'start' });
  };

  const activar = (ctx) => {
    const clave = typeof ctx?.asignatura === 'string' ? ctx.asignatura : null;
    if (listo) { abrir(clave); return; }
    if (cargando) return;
    cargando = true;
    slot.replaceChildren(el('p', 'm-vacio', 'Cargando apuntes…'));
    cargar().then((lista) => {
      const total = lista.reduce((s, a) => s + a.files.length, 0);
      if (resumen) resumen.textContent = `${lista.length} asignaturas · ${textoArchivos(total)}`;
      slot.replaceChildren(...lista.map(crearAsignatura));
      listo = true;
      abrir(clave);
    }).catch((err) => {
      console.error('No se pudieron cargar los apuntes', err);
      slot.replaceChildren(el('p', 'm-vacio', 'No se pudieron cargar los apuntes.'));
    }).finally(() => { cargando = false; });
  };

  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'apuntes') activar(e.detail.contexto); });
  if (raiz.dataset.mVista === 'apuntes') activar(null); // vista restaurada antes de registrar el listener
}