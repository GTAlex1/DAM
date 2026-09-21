// calendario.js — Calendario escolar con exámenes y tareas reales en Firestore.
//
// Se carga como MÓDULO (<script type="module">) porque reutiliza la sesión y la
// conexión de firebase-init.js en vez de abrir otra propia:
//   · auth / watchAuth / isAuthorized → quién es el usuario y si es el admin.
//   · getFirestore(auth.app)          → la MISMA instancia de Firestore de la app.
//
// Colecciones de Firestore (reglas en firestore.rules):
//   calendario_eventos/{id}  Exámenes y tareas compartidos por toda la clase.
//                            Los lee cualquiera; los crea cualquier usuario con
//                            sesión; solo los edita/borra su autor o el admin.
//   calendario_hechas/{uid}  { hechas: { [idTarea]: true } }. Tareas que ha
//                            marcado cada usuario: privado, solo lo lee/escribe él.
//                            Sin sesión, las marcas se guardan en localStorage.
//
// Los festivos, vacaciones y demás fechas oficiales del curso siguen en
// `eventosFijos` (más abajo). Exámenes y tareas NO están en el código: salen
// únicamente de Firestore.

import { auth, watchAuth, isAuthorized } from './firebase-init.js?v=3';
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  deleteField, onSnapshot, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const db = getFirestore(auth.app);

const COL_EVENTOS = 'calendario_eventos';
const COL_HECHAS = 'calendario_hechas';
const LS_HECHAS = 'calendario.tareasHechas.v1';

// Catálogo del desplegable «Asignatura». Se puede elegir «Otra…» y escribirla.
const ASIGNATURAS = [
  'Programación',
  'Bases de Datos',
  'Entornos de Desarrollo',
  'Lenguajes de Marcas',
  'Sistemas Informáticos',
  'FOL',
];
const OTRA = '__otra';

// ---------- Utilidades de fecha ----------
const pad = n => String(n).padStart(2, '0');

function dia(y, m, d) { return new Date(y, m, d); }
function rango(ini, fin) {
  const out = [];
  let d = new Date(ini);
  while (d <= fin) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function mismoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatoCorto(d) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function formatoLargo(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
// Las fechas de Firestore se guardan como texto «AAAA-MM-DD» (sin hora ni zona
// horaria): así un examen del día 8 es siempre el día 8, esté quien esté donde esté.
function claveFecha(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fechaDesdeClave(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function claveValida(k) {
  return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && claveFecha(fechaDesdeClave(k)) === k;
}
function inicioDeHoy() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

// Todo texto que viene de Firestore lo escribe un usuario cualquiera: se escapa
// SIEMPRE antes de meterlo en innerHTML (si no, alguien podría inyectar HTML/JS).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// ---------- Meses del curso, con sus días lectivos oficiales ----------
const mesesCurso = [
  { year: 2026, month: 8,  lectivos: 12 }, // Septiembre
  { year: 2026, month: 9,  lectivos: 21 }, // Octubre
  { year: 2026, month: 10, lectivos: 20 }, // Noviembre
  { year: 2026, month: 11, lectivos: 14 }, // Diciembre
  { year: 2027, month: 0,  lectivos: 15 }, // Enero
  { year: 2027, month: 1,  lectivos: 20 }, // Febrero
  { year: 2027, month: 2,  lectivos: 17 }, // Marzo
  { year: 2027, month: 3,  lectivos: 21 }, // Abril
  { year: 2027, month: 4,  lectivos: 21 }, // Mayo
  { year: 2027, month: 5,  lectivos: 17 }, // Junio
];
const NOMBRES_MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Rango de fechas permitido al crear un evento: el curso completo.
const FECHA_MIN = claveFecha(new Date(mesesCurso[0].year, mesesCurso[0].month, 1));
const FECHA_MAX = claveFecha(new Date(mesesCurso.at(-1).year, mesesCurso.at(-1).month + 1, 0));

// ---------- Fechas oficiales del curso (fijas) ----------
// tipo: festivo | vacaciones | hito | cultural | evaluacion
// Todas llevan  ini (y fin, opcional, si dura varios días), tipo y label.
// Los exámenes y las tareas NO van aquí: se gestionan desde el calendario y
// viven en Firestore.
const eventosFijos = [
  // Septiembre 2026
  { ini: dia(2026,8,15), tipo:'hito',      label:'Comienzo de las clases' },
  { ini: dia(2026,8,24), tipo:'festivo',   label:'Día de la Merced (Ayto.)' },

  // Octubre 2026
  { ini: dia(2026,9,12), tipo:'festivo',   label:'Fiesta Nacional (Día del Pilar)' },

  // Noviembre 2026
  { ini: dia(2026,10,2), tipo:'festivo',   label:'Fiesta de Todos los Santos (traslado)' },

  // Diciembre 2026
  { ini: dia(2026,11,7), tipo:'festivo',   label:'Día de la Constitución' },
  { ini: dia(2026,11,8), tipo:'festivo',   label:'Inmaculada Concepción' },
  { ini: dia(2026,11,15), fin: dia(2026,11,17), tipo:'evaluacion', label:'Sesiones 1ª evaluación' },
  { ini: dia(2026,11,22), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2026,11,23), fin: dia(2027,0,10), tipo:'vacaciones', label:'Vacaciones de Navidad' },

  // Febrero 2027
  { ini: dia(2027,1,25), fin: dia(2027,1,26), tipo:'cultural', label:'Jornadas culturales por el Día de Andalucía' },

  // Marzo 2027
  { ini: dia(2027,2,1),  tipo:'festivo',   label:'Día de Andalucía' },
  { ini: dia(2027,2,15), fin: dia(2027,2,17), tipo:'evaluacion', label:'Sesiones 2ª evaluación' },
  { ini: dia(2027,2,19), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,2,20), fin: dia(2027,2,28), tipo:'vacaciones', label:'Vacaciones de Semana Santa' },

  // Abril 2027
  { ini: dia(2027,3,26), tipo:'festivo',   label:'Feria de Jerez (Ayto.)' },
  { ini: dia(2027,3,30), tipo:'hito',      label:'Día de la Comunidad Educativa' },

  // Mayo 2027
  { ini: dia(2027,4,24), tipo:'evaluacion', label:'Sesión de evaluación FINAL de FP — 2º DAM' },
  { ini: dia(2027,4,25), tipo:'evaluacion', label:'Publicación de notas de 2º DAM' },

  // Junio 2027
  { ini: dia(2027,5,10), tipo:'evaluacion', label:'Evaluación FINAL de FP — 1º DAM', propia:true },
  { ini: dia(2027,5,11), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,5,23), tipo:'hito',      label:'Último día lectivo' },
];

const notasSinFecha = [
  'Acto de graduación de Ciclos y 4º ESO — pendiente de fecha',
];

// Expande cada evento fijo a su lista concreta de días (para pintar la rejilla)
eventosFijos.forEach(e => { e.dias = rango(e.ini, e.fin || e.ini); });

// ---------- Exámenes y tareas (Firestore) ----------
let eventosDin = [];            // eventos normalizados leídos de Firestore
let porFecha = new Map();       // 'AAAA-MM-DD' → [eventos]
let estadoEventos = 'cargando'; // 'cargando' | 'ok' | 'error'
let errorEventos = null;

function normalizarEvento(id, d) {
  if (!d || (d.tipo !== 'examen' && d.tipo !== 'tarea') || !claveValida(d.fecha)) return null;
  const asignatura = String(d.asignatura ?? '').trim();
  const titulo = String(d.titulo ?? '').trim();
  if (!titulo) return null;
  return {
    id, dinamico: true, tipo: d.tipo,
    fechaClave: d.fecha, ini: fechaDesdeClave(d.fecha),
    asignatura, titulo,
    label: asignatura ? `${asignatura} — ${titulo}` : titulo,
    hora: typeof d.hora === 'string' ? d.hora : '',
    lugar: typeof d.lugar === 'string' ? d.lugar : '',
    temario: typeof d.temario === 'string' ? d.temario : '',
    creado_por: typeof d.creado_por === 'string' ? d.creado_por : '',
  };
}

function comparaEventosDia(a, b) {
  if (a.tipo !== b.tipo) return a.tipo === 'examen' ? -1 : 1; // exámenes antes que tareas
  return (a.hora || '99:99').localeCompare(b.hora || '99:99') || a.label.localeCompare(b.label, 'es');
}

// Prioridad de color de fondo de celda (solo los tipos "grandes" tiñen la celda entera;
// evaluacion, examen y tarea se dibujan como puntos)
const PRIORIDAD_FONDO = ['festivo', 'vacaciones', 'hito', 'cultural'];

function eventosDelDia(fecha) {
  const fijos = eventosFijos.filter(e => e.dias.some(d => mismoDia(d, fecha)));
  const din = (porFecha.get(claveFecha(fecha)) || []).slice().sort(comparaEventosDia);
  return fijos.concat(din);
}

// ---------- Sesión y estado por usuario ----------
let user = null;          // usuario de Firebase o null
let hechas = new Set();   // ids de tareas marcadas por el usuario actual

const puedeGestionar = e => !!user && !!e.dinamico && (e.creado_por === user.uid || isAuthorized(user));
const embebido = () => document.documentElement.classList.contains('auth-embebido');

function leerHechasLocal() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_HECHAS) || '[]');
    return new Set(Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function guardarHechasLocal() {
  try { localStorage.setItem(LS_HECHAS, JSON.stringify([...hechas])); }
  catch (err) { console.warn('No se pudo guardar en localStorage:', err); }
}
const igualesSets = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// ---------- Estado: mes mostrado ----------
const hoy = new Date();
let idxMes = mesesCurso.findIndex(m => m.year === hoy.getFullYear() && m.month === hoy.getMonth());
if (idxMes === -1) {
  // Si hoy cae fuera del curso (verano, etc.), mostrar el mes más cercano dentro del rango.
  idxMes = hoy < new Date(mesesCurso[0].year, mesesCurso[0].month, 1) ? 0 : mesesCurso.length - 1;
}
let fechaSeleccionada = hoy;

const $ = id => document.getElementById(id);
const calEl = $('cal');
const mesLabelEl = $('mesLabel');
const mesLectivosEl = $('mesLectivos');
const detalleEl = $('detalle');
const btnAnterior = $('mesAnterior');
const btnSiguiente = $('mesSiguiente');
const examenesListEl = $('examenesList');
const msgEl = $('msgCal');
const btnNuevo = $('btnNuevoEvento');
const avisoSesion = $('avisoSesion');
const btnAcceder = $('btnAcceder');

// ---------- Mensajes (fuera del panel de detalle, que se repinta a menudo) ----------
let temporizadorMsg = 0;
function mostrarMsg(texto, tipo = 'ok') {
  clearTimeout(temporizadorMsg);
  msgEl.textContent = texto;
  msgEl.dataset.tipo = tipo;
  msgEl.hidden = !texto;
  if (texto) temporizadorMsg = setTimeout(() => { msgEl.hidden = true; }, 7000);
}

function mensajeError(err, accion) {
  if (err?.code === 'permission-denied') {
    return `No tienes permiso para ${accion}. Comprueba que has iniciado sesión y que las reglas de Firestore (firestore.rules) están publicadas.`;
  }
  if (err?.code === 'unavailable') return 'Sin conexión con Firestore. Inténtalo de nuevo en unos segundos.';
  return `No se pudo ${accion}. Revisa la consola del navegador.`;
}

// ---------- Rejilla del mes ----------
function pintaMes() {
  const { year, month, lectivos } = mesesCurso[idxMes];
  mesLabelEl.textContent = `${NOMBRES_MES[month]} ${year}`;
  mesLectivosEl.textContent = `${lectivos} días lectivos este mes`;
  btnAnterior.disabled = idxMes === 0;
  btnSiguiente.disabled = idxMes === mesesCurso.length - 1;

  const primerDiaSemana = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lunes
  const totalDias = new Date(year, month + 1, 0).getDate();

  let html = '';
  ['L','M','X','J','V','S','D'].forEach(d => { html += `<div class="cal-head">${d}</div>`; });
  for (let i = 0; i < primerDiaSemana; i++) html += `<div class="cal-day vacio"></div>`;

  for (let d = 1; d <= totalDias; d++) {
    const fecha = new Date(year, month, d);
    const evs = eventosDelDia(fecha);
    const tipoFondo = PRIORIDAD_FONDO.find(t => evs.some(e => e.tipo === t));
    const otros = evs.filter(e => !PRIORIDAD_FONDO.includes(e.tipo));
    const esHoy = mismoDia(fecha, hoy);
    const esSel = mismoDia(fecha, fechaSeleccionada);

    const clases = ['cal-day'];
    if (tipoFondo) clases.push('tipo-' + tipoFondo);
    if (esHoy) clases.push('hoy');
    if (esSel) clases.push('seleccionado');

    const etiquetaMini = tipoFondo
      ? `<div class="etiqueta-mini">${esc(evs.find(e => e.tipo === tipoFondo).label)}</div>` : '';
    // Las tareas que TÚ has completado se pintan atenuadas (clase "hecha")
    const dots = otros.slice(0, 4).map(e =>
      `<span class="cal-dot dot-${e.tipo}${e.tipo === 'tarea' && hechas.has(e.id) ? ' hecha' : ''}"></span>`
    ).join('');

    html += `<div class="${clases.join(' ')}" data-fecha="${claveFecha(fecha)}">
      <div class="num">${d}</div>
      ${etiquetaMini}
      <div class="cal-dots">${dots}</div>
    </div>`;
  }

  calEl.innerHTML = html;
  calEl.querySelectorAll('.cal-day:not(.vacio)').forEach(el => {
    el.addEventListener('click', () => {
      fechaSeleccionada = fechaDesdeClave(el.dataset.fecha);
      pintaMes();
      pintaDetalle();
    });
  });
}

// ---------- Panel de detalle del día ----------
// Un dato "Etiqueta valor"; si el valor no existe no se pinta nada
function campo(etiqueta, valor) {
  return valor ? `<span><span class="meta-k">${etiqueta}</span>${esc(valor)}</span>` : '';
}

function htmlAcciones(e) {
  if (!puedeGestionar(e)) return '';
  const id = esc(e.id);
  return `<span class="item-acciones">
    <button type="button" class="cal-btn cal-btn-mini" data-accion="editar" data-id="${id}">Editar</button>
    <button type="button" class="cal-btn cal-btn-mini cal-btn-peligro" data-accion="eliminar" data-id="${id}">Eliminar</button>
  </span>`;
}

function htmlItemDetalle(e) {
  const sw = `<span class="sw sw-${e.tipo}"></span>`;

  if (e.tipo === 'examen') {
    const meta = campo('Hora', e.hora) + campo('Lugar', e.lugar);
    return `<div class="item">${sw}<div class="item-cuerpo">
      <div class="item-titulo">${esc(e.label)}</div>
      ${meta ? `<div class="item-meta">${meta}</div>` : ''}
      ${e.temario ? `<div class="item-explicacion"><span class="meta-k">Temario</span>${esc(e.temario)}</div>` : ''}
    </div>${htmlAcciones(e)}</div>`;
  }

  if (e.tipo === 'tarea') {
    const hecha = hechas.has(e.id);
    return `<div class="item${hecha ? ' item-hecha' : ''}">${sw}<div class="item-cuerpo">
      <label class="tarea-check"><input type="checkbox" data-hecha="${esc(e.id)}"${hecha ? ' checked' : ''}><span class="tarea-label">${esc(e.label)}</span></label>
    </div>${htmlAcciones(e)}</div>`;
  }

  const estrella = e.propia ? '<span class="estrella" title="Tu evaluación">★</span>' : '';
  return `<div class="item">${sw}<div class="item-cuerpo">${esc(e.label)}${estrella}</div></div>`;
}

function pintaDetalle() {
  const evs = eventosDelDia(fechaSeleccionada);
  const btnAdd = user
    ? '<button type="button" class="cal-btn cal-btn-mini" data-accion="anadir">+ Añadir en este día</button>' : '';
  let html = `<div class="detalle-cab"><div class="fecha">${formatoLargo(fechaSeleccionada)}</div>${btnAdd}</div>`;
  html += evs.length
    ? evs.map(htmlItemDetalle).join('')
    : `<div class="vacio">Sin anotaciones para este día.</div>`;
  detalleEl.innerHTML = html;
}

// Un único par de listeners (delegación) para todo el panel: sobrevive a los repintados.
let temporizadorEliminar = 0;
detalleEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  if (btn.dataset.accion === 'anadir') return abrirModal({ fecha: claveFecha(fechaSeleccionada) });
  const ev = eventosDin.find(x => x.id === btn.dataset.id);
  if (!ev) return;
  if (btn.dataset.accion === 'editar') return abrirModal({ evento: ev });
  if (btn.dataset.accion === 'eliminar') return eliminarEvento(btn, ev);
});
detalleEl.addEventListener('change', e => {
  const cb = e.target.closest('input[data-hecha]');
  if (cb) marcarTarea(cb.dataset.hecha, cb.checked, cb);
});

// «Eliminar» pide una segunda pulsación de confirmación (4 s) antes de borrar.
async function eliminarEvento(btn, ev) {
  if (btn.dataset.confirmar !== '1') {
    btn.dataset.confirmar = '1';
    btn.textContent = '¿Seguro?';
    clearTimeout(temporizadorEliminar);
    temporizadorEliminar = setTimeout(() => {
      if (btn.isConnected) { delete btn.dataset.confirmar; btn.textContent = 'Eliminar'; }
    }, 4000);
    return;
  }
  clearTimeout(temporizadorEliminar);
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, COL_EVENTOS, ev.id));
    mostrarMsg(ev.tipo === 'examen' ? 'Examen eliminado.' : 'Tarea eliminada.');
  } catch (err) {
    console.error('Error al eliminar el evento:', err);
    btn.disabled = false;
    delete btn.dataset.confirmar;
    btn.textContent = 'Eliminar';
    mostrarMsg(mensajeError(err, 'eliminar el evento'), 'err');
  }
}

// ---------- Check de tareas (por usuario) ----------
// Con sesión → Firestore (calendario_hechas/{uid}): se sincroniza entre móvil y
// ordenador y las reglas lo hacen privado. Sin sesión → localStorage del navegador.
async function guardarHecha(id, hecha) {
  if (user) {
    await setDoc(doc(db, COL_HECHAS, user.uid), {
      hechas: { [id]: hecha ? true : deleteField() },
      actualizado: serverTimestamp(),
    }, { merge: true });
  } else {
    guardarHechasLocal();
  }
}

// Optimista: la interfaz cambia al instante y, si falla el guardado, se deshace.
// No se repinta el panel entero para no quitarle el foco al checkbox (teclado).
async function marcarTarea(id, hecha, checkbox) {
  const antes = new Set(hechas);
  if (hecha) hechas.add(id); else hechas.delete(id);
  const item = checkbox.closest('.item');
  item?.classList.toggle('item-hecha', hecha);
  pintaMes();
  try {
    await guardarHecha(id, hecha);
  } catch (err) {
    console.error('No se pudo guardar el estado de la tarea:', err);
    hechas = antes;
    checkbox.checked = !hecha;
    item?.classList.toggle('item-hecha', !hecha);
    pintaMes();
    mostrarMsg(mensajeError(err, 'guardar el estado de la tarea'), 'err');
  }
}

let cancelarHechas = null;
function cargarHechas() {
  if (cancelarHechas) { cancelarHechas(); cancelarHechas = null; }
  if (!user) { hechas = leerHechasLocal(); return; }
  hechas = new Set();
  cancelarHechas = onSnapshot(doc(db, COL_HECHAS, user.uid), snap => {
    const nuevo = new Set();
    const mapa = snap.exists() ? snap.data().hechas : null;
    if (mapa && typeof mapa === 'object') {
      for (const [k, v] of Object.entries(mapa)) if (v === true) nuevo.add(k);
    }
    if (!igualesSets(nuevo, hechas)) { hechas = nuevo; pintaMes(); pintaDetalle(); }
  }, err => {
    console.error('Error al leer las tareas completadas:', err);
    mostrarMsg(mensajeError(err, 'leer tus tareas completadas'), 'err');
  });
}

// ---------- Próximos exámenes (solo Firestore) ----------
function textoCuenta(e) {
  const n = Math.round((e.ini - inicioDeHoy()) / 86400000);
  return { n, texto: n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días` };
}

function pintaExamenes() {
  if (estadoEventos === 'cargando') {
    examenesListEl.innerHTML = `<p class="vacio">Cargando exámenes…</p>`;
    return;
  }
  if (estadoEventos === 'error') {
    const permisos = errorEventos?.code === 'permission-denied';
    examenesListEl.innerHTML = `<p class="vacio vacio-error">${permisos
      ? 'No se pudieron leer los exámenes: Firestore ha denegado el acceso (revisa que las reglas estén publicadas).'
      : 'No se pudieron cargar los exámenes. Comprueba tu conexión y recarga la página.'}</p>`;
    return;
  }
  const inicioHoy = inicioDeHoy();
  const proximos = eventosDin
    .filter(e => e.tipo === 'examen' && e.ini >= inicioHoy)
    .sort((a, b) => a.ini - b.ini || (a.hora || '99:99').localeCompare(b.hora || '99:99') || a.label.localeCompare(b.label, 'es'));

  examenesListEl.innerHTML = proximos.map(e => {
    const meta = [e.hora, e.lugar].filter(Boolean).join(' · ');
    const c = textoCuenta(e);
    return `<div class="examen-item">
      <span class="e-fecha">${formatoCorto(e.ini)}</span>
      <span class="e-info">
        <span class="e-label">${esc(e.label)}</span>
        ${meta ? `<span class="e-meta">${esc(meta)}</span>` : ''}
      </span>
      <span class="e-cuenta${c.n <= 7 ? ' pronto' : ''}">${c.texto}</span>
    </div>`;
  }).join('') || `<p class="vacio">No hay exámenes próximos anotados.</p>`;
}

// ---------- Lectura en tiempo real de los eventos ----------
let cancelarEventos = null;
function iniciarEscuchaEventos() {
  if (cancelarEventos) cancelarEventos();
  estadoEventos = 'cargando';
  pintaExamenes();
  cancelarEventos = onSnapshot(collection(db, COL_EVENTOS), snap => {
    // Se lee la colección entera (son pocas decenas de documentos) y se filtra en
    // cliente: así no hace falta crear ningún índice compuesto en la consola.
    eventosDin = [];
    porFecha = new Map();
    snap.forEach(d => {
      const ev = normalizarEvento(d.id, d.data());
      if (!ev) return;
      eventosDin.push(ev);
      if (!porFecha.has(ev.fechaClave)) porFecha.set(ev.fechaClave, []);
      porFecha.get(ev.fechaClave).push(ev);
    });
    estadoEventos = 'ok';
    errorEventos = null;
    pintaMes(); pintaDetalle(); pintaExamenes();
  }, err => {
    console.error('Error al leer los eventos del calendario:', err);
    eventosDin = []; porFecha = new Map();
    estadoEventos = 'error';
    errorEventos = err;
    pintaMes(); pintaDetalle(); pintaExamenes();
  });
}

// ---------- Modal «Añadir / Editar evento» ----------
const modal = $('modalEvento');
const form = $('formEvento');
const campos = form.elements;
const selAsig = campos.asignatura;
const campoOtra = $('campoOtra');
const errorEl = $('errorEvento');
const btnGuardar = $('btnGuardarEvento');
let editando = null;   // evento que se está editando (null = creando uno nuevo)
let guardando = false;

// El desplegable se rellena aquí para que el catálogo viva en un solo sitio (ASIGNATURAS).
const opcionVacia = new Option('Elige una asignatura', '', true, true);
opcionVacia.disabled = true;
selAsig.append(opcionVacia);
ASIGNATURAS.forEach(n => selAsig.append(new Option(n, n)));
selAsig.append(new Option('Otra…', OTRA));
campos.fecha.min = FECHA_MIN;
campos.fecha.max = FECHA_MAX;

const tipoActual = () => editando
  ? editando.tipo
  : (form.querySelector('input[name="tipo"]:checked')?.value || 'examen');

function actualizarCampos() {
  const tipo = tipoActual();
  form.querySelectorAll('[data-solo]').forEach(n => { n.hidden = n.dataset.solo !== tipo; });
  campoOtra.hidden = selAsig.value !== OTRA;
}
form.addEventListener('change', e => {
  if (e.target.name === 'tipo' || e.target === selAsig) actualizarCampos();
});

function mostrarErrorForm(texto) { errorEl.textContent = texto; errorEl.hidden = !texto; }

function abrirModal({ fecha, evento } = {}) {
  if (!user) { mostrarMsg('Inicia sesión para añadir o editar exámenes y tareas.', 'err'); return; }
  editando = evento || null;
  form.reset();
  mostrarErrorForm('');

  form.querySelectorAll('input[name="tipo"]').forEach(r => { r.checked = r.value === (evento ? evento.tipo : 'examen'); });
  $('grupoTipo').hidden = !!evento;
  $('modalEventoTitulo').textContent = evento
    ? (evento.tipo === 'examen' ? 'Editar examen' : 'Editar tarea')
    : 'Añadir evento';
  btnGuardar.textContent = 'Guardar';

  if (evento) {
    campos.fecha.value = evento.fechaClave;
    if (ASIGNATURAS.includes(evento.asignatura)) selAsig.value = evento.asignatura;
    else { selAsig.value = OTRA; campos.asignaturaOtra.value = evento.asignatura; }
    campos.titulo.value = evento.titulo;
    campos.hora.value = evento.hora;
    campos.lugar.value = evento.lugar;
    campos.temario.value = evento.temario;
  } else {
    const hoyClave = claveFecha(new Date());
    const porDefecto = fecha && fecha >= FECHA_MIN && fecha <= FECHA_MAX ? fecha
      : (hoyClave >= FECHA_MIN && hoyClave <= FECHA_MAX ? hoyClave : FECHA_MIN);
    campos.fecha.value = porDefecto;
  }
  actualizarCampos();
  modal.showModal();
  campos.titulo.focus();
}

// Cerrar con la X / Cancelar, o pulsando fuera del cuadro (sin que arrastrar para
// seleccionar texto y soltar fuera lo cierre por accidente).
let pulsadoFuera = false;
modal.addEventListener('mousedown', e => { pulsadoFuera = e.target === modal; });
modal.addEventListener('click', e => {
  if (e.target.closest('[data-cerrar]') || (e.target === modal && pulsadoFuera)) modal.close();
});

function leerFormulario() {
  const tipo = tipoActual();
  const fecha = campos.fecha.value;
  const asignatura = (selAsig.value === OTRA ? campos.asignaturaOtra.value : selAsig.value).trim();
  const titulo = campos.titulo.value.trim();

  if (!claveValida(fecha)) return { error: 'Elige una fecha.', campo: campos.fecha };
  if (fecha < FECHA_MIN || fecha > FECHA_MAX) {
    return { error: 'La fecha tiene que estar dentro del curso (sept. 2026 – jun. 2027).', campo: campos.fecha };
  }
  if (!asignatura) {
    return { error: 'Elige la asignatura.', campo: selAsig.value === OTRA ? campos.asignaturaOtra : selAsig };
  }
  if (asignatura.length > 60) return { error: 'La asignatura admite 60 caracteres como máximo.', campo: campos.asignaturaOtra };
  if (!titulo) return { error: 'Escribe un título.', campo: campos.titulo };
  if (titulo.length > 100) return { error: 'El título admite 100 caracteres como máximo.', campo: campos.titulo };

  const datos = { tipo, fecha, asignatura, titulo };
  if (tipo === 'examen') {
    datos.hora = campos.hora.value || '';
    datos.lugar = campos.lugar.value.trim();
    datos.temario = campos.temario.value.trim();
    if (datos.lugar.length > 60) return { error: 'El lugar admite 60 caracteres como máximo.', campo: campos.lugar };
    if (datos.temario.length > 1500) return { error: 'El temario admite 1500 caracteres como máximo.', campo: campos.temario };
  }
  return { datos };
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (guardando) return;
  if (!user) return mostrarErrorForm('Tu sesión ha caducado. Vuelve a iniciar sesión.');

  const { datos, error, campo: campoError } = leerFormulario();
  if (error) { mostrarErrorForm(error); campoError?.focus(); return; }

  guardando = true;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando…';
  mostrarErrorForm('');
  try {
    if (editando) {
      // El tipo, el autor y la fecha de creación no cambian nunca (lo exigen las reglas).
      const { tipo, ...editables } = datos;
      await updateDoc(doc(db, COL_EVENTOS, editando.id), editables);
    } else {
      await addDoc(collection(db, COL_EVENTOS), {
        ...datos,
        creado_por: user.uid,
        creado: serverTimestamp(),
      });
    }
    // Se lleva el calendario al día guardado para que se vea lo que se acaba de anotar.
    const f = fechaDesdeClave(datos.fecha);
    const i = mesesCurso.findIndex(m => m.year === f.getFullYear() && m.month === f.getMonth());
    if (i !== -1) idxMes = i;
    fechaSeleccionada = f;
    modal.close();
    pintaMes(); pintaDetalle(); pintaExamenes();
    mostrarMsg(editando ? 'Cambios guardados.' : (datos.tipo === 'examen' ? 'Examen añadido.' : 'Tarea añadida.'));
  } catch (err) {
    console.error('Error al guardar el evento:', err);
    mostrarErrorForm(mensajeError(err, 'guardar el evento'));
  } finally {
    guardando = false;
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar';
  }
});

btnNuevo.addEventListener('click', () => abrirModal({ fecha: claveFecha(fechaSeleccionada) }));
// Abre el modal de acceso de firebase-init.js (no existe si la página va embebida en un iframe).
btnAcceder.addEventListener('click', () => $('btn-auth-trigger')?.click());

// ---------- Navegación de meses ----------
btnAnterior.addEventListener('click', () => { if (idxMes > 0) { idxMes--; pintaMes(); } });
btnSiguiente.addEventListener('click', () => { if (idxMes < mesesCurso.length - 1) { idxMes++; pintaMes(); } });

// ---------- Sesión ----------
function actualizarInterfazSesion() {
  btnNuevo.hidden = !user;
  avisoSesion.hidden = !!user;
  btnAcceder.hidden = embebido() || !$('btn-auth-trigger');
  if (!user && modal.open) modal.close(); // cerraron sesión (p. ej. en otra pestaña) con el modal abierto
}

let primeraVez = true;
watchAuth(u => {
  const cambio = (u?.uid ?? null) !== (user?.uid ?? null);
  user = u || null;
  actualizarInterfazSesion();
  if (primeraVez || cambio) cargarHechas();
  // La lectura arranca cuando ya se conoce la sesión (así también funcionaría si algún
  // día las reglas exigen estar autenticado) y se reintenta si un intento anterior falló.
  if (primeraVez || estadoEventos === 'error') iniciarEscuchaEventos();
  primeraVez = false;
  pintaMes(); pintaDetalle(); // muestra u oculta los botones de añadir/editar y las marcas del usuario
});

// ---------- Próximos 5 festivos (festivo + vacaciones), aunque sean de otro mes ----------
function textoRango(e) {
  return e.fin ? `${formatoCorto(e.ini)} – ${formatoCorto(e.fin)}` : formatoCorto(e.ini);
}
{
  const inicioHoy = inicioDeHoy();
  const festivos = eventosFijos
    .filter(e => e.tipo === 'festivo' || e.tipo === 'vacaciones')
    .filter(e => (e.fin || e.ini) >= inicioHoy)
    .sort((a, b) => a.ini - b.ini)
    .slice(0, 5);

  const cuenta = e => {
    const n = Math.round((e.ini - inicioHoy) / 86400000);
    return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? 'en curso' : `en ${n} días`;
  };
  $('festivosList').innerHTML = festivos.map(e => `<div class="festivo-item tipo-${e.tipo}">
      <span class="f-fecha">${textoRango(e)}</span>
      <span class="f-label">${esc(e.label)}</span>
      <span class="f-cuenta">${cuenta(e)}</span>
    </div>`
  ).join('') || `<p class="vacio">No quedan más festivos en lo que resta de curso.</p>`;
}

// ---------- Tabla de días lectivos ----------
{
  const totalLectivos = mesesCurso.reduce((acc, m) => acc + m.lectivos, 0);
  $('tablaLectivos').innerHTML = `
  <tr>${mesesCurso.map(m => `<th>${NOMBRES_MES[m.month].slice(0,3)}</th>`).join('')}<th>Total</th></tr>
  <tr>${mesesCurso.map(m => `<td>${m.lectivos}</td>`).join('')}<td class="total">${totalLectivos}</td></tr>
`;
}

// ---------- Notas sin fecha ----------
$('notasList').innerHTML = notasSinFecha.map(n => `<li>${esc(n)}</li>`).join('');

// ---------- Primer pintado (antes de que responda Firebase) ----------
hechas = leerHechasLocal();
pintaMes();
pintaDetalle();
pintaExamenes();
actualizarInterfazSesion();
