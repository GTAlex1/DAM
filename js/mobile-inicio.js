// mobile-inicio.js
// Pantalla «Inicio» de la UI móvil: tarjeta de próximo examen + rejilla de asignaturas.
// Se carga bajo demanda desde mobile-app.js (solo a ≤1100px), así que en escritorio no hace peticiones.
//
// Datos:
//   · Asignaturas → carpetas de DAM/<curso>/ del árbol de github-source.js (manifest.json), con su nº de archivos.
//   · Próximo examen → Firestore (calendario_eventos): los de la clase (global) + los personales si hay sesión.
//
// Seguridad: todo texto externo (nombres de carpeta, campos de Firestore) se valida, se recorta y se
// escribe con textContent (helper el()); nunca innerHTML. Los clics se resuelven contra un Map de
// asignaturas ya cargadas, no contra el valor del atributo del DOM.

import { el } from './dom.js';
import { fetchGithubTree } from './github-source.js?v=02537279';
import { auth, watchAuth } from './firebase-init.js?v=11feeaf4'; // misma URL que app.js: comparte instancia
import {
  getFirestore, collection, onSnapshot, query, where,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COL_EVENTOS = 'calendario_eventos';
const MS_DIA = 86400000;

/* ---------- Asignaturas ---------- */

const COLORES = ['azul', 'verde', 'naranja', 'morado', 'rosa', 'turquesa'];
const COLOR_POR_CLAVE = {
  'bases-de-datos': 0, 'entornos-de-desarrollo': 1, 'lenguajes-de-marcas': 2,
  programacion: 3, 'sistemas-informaticos': 4, digitalizacion: 5,
};
const NOMBRES = {
  programacion: 'Programación',
  'sistemas-informaticos': 'Sistemas Informáticos',
  digitalizacion: 'Digitalización',
};
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e']);

const claveDe = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const nombreVisible = (n) => (NOMBRES[claveDe(n)] ?? n.replace(/[-_]+/g, ' ').trim()).slice(0, 60);

function iniciales(nombre) {
  const palabras = nombre.split(/\s+/).filter((w) => w && !PALABRAS_VACIAS.has(w.toLowerCase()));
  const txt = palabras.length >= 2 ? palabras[0][0] + palabras[1][0] : nombre.replace(/\s+/g, '').slice(0, 2);
  return txt.toUpperCase();
}

function contarArchivos(nodo) {
  if (nodo.type === 'file') return 1;
  return (nodo.children ?? []).reduce((suma, h) => suma + contarArchivos(h), 0);
}

function extraerAsignaturas(root) {
  const porClave = new Map();
  for (const curso of root.children ?? []) {
    if (curso.type !== 'folder') continue;
    for (const carpeta of curso.children ?? []) {
      if (carpeta.type !== 'folder') continue;
      const clave = claveDe(carpeta.name);
      const previa = porClave.get(clave);
      if (previa) { previa.archivos += contarArchivos(carpeta); continue; }
      porClave.set(clave, {
        clave,
        nombre: nombreVisible(carpeta.name),
        iniciales: iniciales(nombreVisible(carpeta.name)),
        archivos: contarArchivos(carpeta),
        color: COLORES[COLOR_POR_CLAVE[clave] ?? porClave.size % COLORES.length],
      });
    }
  }
  return [...porClave.values()];
}

// Memoizada: la pantalla Apuntes puede importar esta función y reutilizar el mismo árbol.
let promesaAsignaturas = null;
export function cargarAsignaturas() {
  if (!promesaAsignaturas) {
    promesaAsignaturas = fetchGithubTree()
      .then((datos) => extraerAsignaturas(datos.root))
      .catch((err) => { promesaAsignaturas = null; throw err; }); // permite reintentar
  }
  return promesaAsignaturas;
}

const textoArchivos = (n) => `${n} ${n === 1 ? 'archivo' : 'archivos'}`;

/* ---------- Exámenes (Firestore) ---------- */

const claveFechaValida = (k) => {
  if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
};
const fechaDesdeClave = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const inicioDeHoy = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

// Mismas reglas que normalizarEvento() de calendario.js, limitado a exámenes.
function normalizarExamen(id, d) {
  if (!d || d.tipo !== 'examen' || !claveFechaValida(d.fecha)) return null;
  if (d.ambito !== 'global' && d.ambito !== 'personal') return null;
  const titulo = String(d.titulo ?? '').trim();
  if (!titulo) return null;
  return {
    id,
    ini: fechaDesdeClave(d.fecha),
    asignatura: String(d.asignatura ?? '').trim().slice(0, 80),
    titulo: titulo.slice(0, 120),
    hora: typeof d.hora === 'string' && /^\d{2}:\d{2}$/.test(d.hora) ? d.hora : '',
  };
}

const mapaDesdeSnapshot = (snap) => {
  const m = new Map();
  snap.forEach((docu) => { const e = normalizarExamen(docu.id, docu.data()); if (e) m.set(docu.id, e); });
  return m;
};

/* ---------- Pantalla ---------- */

function crearHero() {
  const hero = el('button', 'm-hero');
  hero.type = 'button';
  const etiqueta = el('span', 'm-hero-etiqueta', 'Próximo examen');
  const cuenta = el('span', 'm-hero-cuenta', '…');
  const meta = el('span', 'm-hero-meta', '');
  hero.append(etiqueta, cuenta, meta);
  return { hero, cuenta, meta };
}

function pintarHero({ hero, cuenta, meta }, estado, examen) {
  hero.dataset.estado = estado;
  if (estado === 'ok' && examen) {
    const n = Math.round((examen.ini - inicioDeHoy()) / MS_DIA);
    cuenta.textContent = n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `${n} días`;
    const fecha = examen.ini.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    meta.textContent = [examen.asignatura || examen.titulo, fecha, examen.hora].filter(Boolean).join(' · ');
  } else if (estado === 'vacio') {
    cuenta.textContent = 'Sin exámenes';
    meta.textContent = 'No hay ninguno anotado por ahora';
  } else if (estado === 'error') {
    cuenta.textContent = 'Sin datos';
    meta.textContent = 'No se pudieron cargar los exámenes';
  } else {
    cuenta.textContent = '…';
    meta.textContent = '';
  }
}

function crearTarjeta(a) {
  const btn = el('button', 'm-asig');
  btn.type = 'button';
  btn.dataset.mAsig = a.clave;
  const chip = el('span', 'm-chip', a.iniciales);
  chip.dataset.color = a.color;
  chip.setAttribute('aria-hidden', 'true');
  btn.append(chip, el('span', 'm-asig-nombre', a.nombre), el('span', 'm-asig-meta', textoArchivos(a.archivos)));
  return btn;
}

export function iniciarInicio(raiz) {
  const slot = raiz.querySelector('[data-m-slot="inicio"]');
  if (!slot) return;

  // Esqueleto inmediato (sin esperar a la red).
  const refsHero = crearHero();
  const contador = el('span', 'm-seccion-meta', '');
  const rejilla = el('div', 'm-rejilla');
  rejilla.append(el('p', 'm-vacio', 'Cargando asignaturas…'));
  const cabecera = el('div', 'm-seccion');
  cabecera.append(el('h2', 'm-seccion-titulo', 'Asignaturas'), contador);
  slot.replaceChildren(refsHero.hero, cabecera, rejilla);
  pintarHero(refsHero, 'cargando');

  const irA = (vista, contexto) =>
    raiz.dispatchEvent(new CustomEvent('m:ir', { detail: { vista, contexto } }));

  /* Asignaturas */
  let conocidas = new Map();

  const pintarAsignaturas = (lista) => {
    conocidas = new Map(lista.map((a) => [a.clave, a]));
    contador.textContent = `${lista.length} ${lista.length === 1 ? 'asignatura' : 'asignaturas'}`;
    const resumen = raiz.querySelector('#m-apuntes-resumen');
    if (resumen) {
      const total = lista.reduce((s, a) => s + a.archivos, 0);
      resumen.textContent = `${contador.textContent} · ${textoArchivos(total)}`;
    }
    if (lista.length === 0) { rejilla.replaceChildren(el('p', 'm-vacio', 'Todavía no hay asignaturas.')); return; }
    rejilla.replaceChildren(...lista.map(crearTarjeta));
  };

  const pintarErrorAsignaturas = () => {
    const reintentar = el('button', 'm-btn-texto', 'Reintentar');
    reintentar.type = 'button';
    reintentar.dataset.mReintentar = '1';
    const caja = el('div', 'm-vacio');
    caja.append(el('p', '', 'No se pudieron cargar las asignaturas.'), reintentar);
    rejilla.replaceChildren(caja);
  };

  const cargar = () => {
    rejilla.replaceChildren(el('p', 'm-vacio', 'Cargando asignaturas…'));
    cargarAsignaturas().then(pintarAsignaturas).catch((err) => {
      console.error('Inicio: no se pudo cargar el árbol de archivos', err);
      pintarErrorAsignaturas();
    });
  };

  slot.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const origen = e.target instanceof Element ? e.target : null;
    if (!origen) return;

    if (origen.closest('[data-m-reintentar]')) { cargar(); return; }

    const tarjeta = origen.closest('[data-m-asig]');
    if (tarjeta && slot.contains(tarjeta)) {
      const asignatura = conocidas.get(tarjeta.dataset.mAsig); // solo claves ya cargadas
      if (asignatura) irA('apuntes', { asignatura: asignatura.clave });
      return;
    }
    if (origen.closest('.m-hero')) irA('calendario');
  });

  cargar();

  /* Próximo examen */
  const db = getFirestore(auth.app);
  const fuentes = { global: new Map(), personal: new Map() };
  let estado = 'cargando';

  const repintarExamen = () => {
    if (estado === 'cargando' || estado === 'error') { pintarHero(refsHero, estado); return; }
    const hoy = inicioDeHoy();
    const proximo = [...fuentes.global.values(), ...fuentes.personal.values()]
      .filter((e) => e.ini >= hoy)
      .sort((a, b) => a.ini - b.ini || (a.hora || '99:99').localeCompare(b.hora || '99:99'))[0];
    pintarHero(refsHero, proximo ? 'ok' : 'vacio', proximo);
  };

  onSnapshot(query(collection(db, COL_EVENTOS), where('ambito', '==', 'global')), (snap) => {
    fuentes.global = mapaDesdeSnapshot(snap);
    estado = 'ok';
    repintarExamen();
  }, (err) => {
    console.error('Inicio: error al leer los exámenes de la clase', err);
    estado = 'error';
    repintarExamen();
  });

  let cancelarPersonal = null;
  watchAuth((user) => {
    if (cancelarPersonal) { cancelarPersonal(); cancelarPersonal = null; }
    fuentes.personal = new Map();
    repintarExamen();
    if (!user) return;
    cancelarPersonal = onSnapshot(query(collection(db, COL_EVENTOS), where('usuario_uid', '==', user.uid)), (snap) => {
      fuentes.personal = mapaDesdeSnapshot(snap);
      repintarExamen();
    }, (err) => {
      console.error('Inicio: error al leer tus exámenes personales', err);
      fuentes.personal = new Map();
      repintarExamen();
    });
  });

  // Si la app queda abierta de un día para otro, la cuenta atrás se recalcula al volver.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) repintarExamen(); });
}
