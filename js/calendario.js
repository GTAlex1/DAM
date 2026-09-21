// ---------- Utilidades de fecha ----------
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

// ---------- Eventos del curso ----------
// Solo se guardan los festivos, las vacaciones, el inicio/fin de curso, los días especiales y lo que afecta a DAM.
// tipo: festivo | vacaciones | hito | cultural | evaluacion | examen | tarea
//
// Todos los eventos llevan  ini (y fin, opcional, si dura varios días), tipo y label.
// Campos propios de cada tipo:
//   examen → hora:'09:00', lugar:'Aula 12', explicacion:'Temario que entra'   (label: 'Asignatura — título')
//   tarea  → completada: true | false                                        (ini = fecha de entrega)
const eventos = [
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
  { ini: dia(2027,4,25), tipo:'evaluacion', label:'Publicación de notas de 2º Bachillerato y 2º DAM' },

  // Junio 2027
  { ini: dia(2027,5,10), tipo:'evaluacion', label:'Evaluación FINAL de FP — 1º DAM', propia:true },
  { ini: dia(2027,5,11), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,5,23), tipo:'hito',      label:'Último día lectivo' },

  // ---------- Exámenes y tareas ----------
  // ⚠ EJEMPLOS con datos inventados: sustitúyelos o bórralos y añade los tuyos.
  { ini: dia(2026,8,28), tipo:'tarea',  label:'Entornos de desarrollo — Informe de instalación del IDE (ejemplo)', completada:true },
  { ini: dia(2026,9,5),  tipo:'tarea',  label:'Programación — Entrega de ejercicios UT1 (ejemplo)', completada:false },
  { ini: dia(2026,9,8),  tipo:'examen', label:'Programación — Examen UT1 (ejemplo)',
    hora:'09:00', lugar:'Aula 12',
    explicacion:'Sintaxis básica de Java, variables y tipos de datos,\nestructuras de control y arrays.' },
  { ini: dia(2026,9,8),  tipo:'tarea',  label:'Lenguajes de marcas — Entrega de la práctica de HTML (ejemplo)', completada:false },
  { ini: dia(2026,9,22), tipo:'examen', label:'Bases de datos — Examen del modelo E/R (ejemplo)',
    hora:'11:30', lugar:'Laboratorio 2',
    explicacion:'Modelo entidad-relación, paso a modelo relacional y normalización hasta 3FN.' },
];

const notasSinFecha = [
  'Acto de graduación de Ciclos y 4º ESO — pendiente de fecha',
];

// Expande cada evento a su lista concreta de días (para pintar la rejilla)
eventos.forEach(e => { e.dias = rango(e.ini, e.fin || e.ini); });

// Prioridad de color de fondo de celda (solo los tipos "grandes" tiñen la celda entera;
// evaluacion, examen y tarea se dibujan como puntos)
const PRIORIDAD_FONDO = ['festivo', 'vacaciones', 'hito', 'cultural'];

function eventosDelDia(fecha) {
  return eventos.filter(e => e.dias.some(d => mismoDia(d, fecha)));
}

// ---------- Estado: mes mostrado ----------
const hoy = new Date();
let idxMes = mesesCurso.findIndex(m => m.year === hoy.getFullYear() && m.month === hoy.getMonth());
if (idxMes === -1) {
  // Si hoy cae fuera del curso (verano, etc.), mostrar el mes más cercano dentro del rango.
  idxMes = hoy < new Date(mesesCurso[0].year, mesesCurso[0].month, 1) ? 0 : mesesCurso.length - 1;
}
let fechaSeleccionada = hoy;

const calEl = document.getElementById('cal');
const mesLabelEl = document.getElementById('mesLabel');
const mesLectivosEl = document.getElementById('mesLectivos');
const detalleEl = document.getElementById('detalle');
const btnAnterior = document.getElementById('mesAnterior');
const btnSiguiente = document.getElementById('mesSiguiente');

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
      ? `<div class="etiqueta-mini">${evs.find(e => e.tipo === tipoFondo).label}</div>` : '';
    // Las tareas ya completadas se pintan atenuadas (clase "hecha")
    const dots = otros.slice(0, 4).map(e =>
      `<span class="cal-dot dot-${e.tipo}${e.tipo === 'tarea' && e.completada ? ' hecha' : ''}"></span>`
    ).join('');

    html += `<div class="${clases.join(' ')}" data-fecha="${fecha.toISOString()}">
      <div class="num">${d}</div>
      ${etiquetaMini}
      <div class="cal-dots">${dots}</div>
    </div>`;
  }

  calEl.innerHTML = html;
  calEl.querySelectorAll('.cal-day:not(.vacio)').forEach(el => {
    el.addEventListener('click', () => {
      fechaSeleccionada = new Date(el.dataset.fecha);
      pintaMes();
      pintaDetalle();
    });
  });
}

// ---------- Panel de detalle del día ----------
// Un dato "Etiqueta valor"; si el valor no existe no se pinta nada
function campo(etiqueta, valor) {
  return valor ? `<span><span class="meta-k">${etiqueta}</span>${valor}</span>` : '';
}

function htmlItemDetalle(e) {
  const sw = `<span class="sw sw-${e.tipo}"></span>`;

  if (e.tipo === 'examen') {
    const meta = campo('Hora', e.hora) + campo('Lugar', e.lugar);
    return `<div class="item">${sw}<div class="item-cuerpo">
      <div>${e.label}</div>
      ${meta ? `<div class="item-meta">${meta}</div>` : ''}
      ${e.explicacion ? `<div class="item-explicacion"><span class="meta-k">Temario</span>${e.explicacion}</div>` : ''}
    </div></div>`;
  }

  if (e.tipo === 'tarea') {
    const estado = e.completada
      ? '<span class="estado estado-hecha">✓ Completada</span>'
      : '<span class="estado estado-pendiente">Pendiente</span>';
    return `<div class="item${e.completada ? ' item-hecha' : ''}">${sw}<div class="item-cuerpo">
      <span class="tarea-label">${e.label}</span>${estado}
    </div></div>`;
  }

  const estrella = e.propia ? '<span class="estrella" title="Tu evaluación">★</span>' : '';
  return `<div class="item">${sw}<div class="item-cuerpo">${e.label}${estrella}</div></div>`;
}

function pintaDetalle() {
  const evs = eventosDelDia(fechaSeleccionada);
  let html = `<div class="fecha">${formatoLargo(fechaSeleccionada)}</div>`;
  html += evs.length
    ? evs.map(htmlItemDetalle).join('')
    : `<div class="vacio">Sin anotaciones para este día.</div>`;
  detalleEl.innerHTML = html;
}

btnAnterior.addEventListener('click', () => { if (idxMes > 0) { idxMes--; pintaMes(); } });
btnSiguiente.addEventListener('click', () => { if (idxMes < mesesCurso.length - 1) { idxMes++; pintaMes(); } });

pintaMes();
pintaDetalle();

// ---------- Utilidades de las listas "Próximos ..." ----------
const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

function diasHasta(fecha) {
  const ms = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) - inicioHoy;
  return Math.round(ms / 86400000);
}
function textoRango(e) {
  return e.fin ? `${formatoCorto(e.ini)} – ${formatoCorto(e.fin)}` : formatoCorto(e.ini);
}
function textoCuenta(e) {
  const n = diasHasta(e.ini);
  return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? 'en curso' : `en ${n} días`;
}

// ---------- Próximos exámenes ----------
const examenes = eventos
  .filter(e => e.tipo === 'examen')
  .filter(e => (e.fin || e.ini) >= inicioHoy)
  .sort((a, b) => a.ini - b.ini || (a.hora || '').localeCompare(b.hora || ''));

const examenesListEl = document.getElementById('examenesList');
examenesListEl.innerHTML = examenes.map(e => {
  const meta = [e.hora, e.lugar].filter(Boolean).join(' · ');
  return `<div class="examen-item">
    <span class="e-fecha">${textoRango(e)}</span>
    <span class="e-info">
      <span class="e-label">${e.label}</span>
      ${meta ? `<span class="e-meta">${meta}</span>` : ''}
    </span>
    <span class="e-cuenta">${textoCuenta(e)}</span>
  </div>`;
}).join('') || `<p class="vacio">No hay exámenes próximos anotados.</p>`;

// ---------- Próximos 5 festivos (festivo + vacaciones), aunque sean de otro mes ----------
const festivos = eventos
  .filter(e => e.tipo === 'festivo' || e.tipo === 'vacaciones')
  .filter(e => (e.fin || e.ini) >= inicioHoy)
  .sort((a, b) => a.ini - b.ini)
  .slice(0, 5);

const festivosListEl = document.getElementById('festivosList');
festivosListEl.innerHTML = festivos.map(e => `<div class="festivo-item tipo-${e.tipo}">
    <span class="f-fecha">${textoRango(e)}</span>
    <span class="f-label">${e.label}</span>
    <span class="f-cuenta">${textoCuenta(e)}</span>
  </div>`
).join('') || `<p class="vacio">No quedan más festivos en lo que resta de curso.</p>`;

// ---------- Tabla de días lectivos ----------
const tabla = document.getElementById('tablaLectivos');
const totalLectivos = mesesCurso.reduce((acc, m) => acc + m.lectivos, 0);
tabla.innerHTML = `
  <tr>${mesesCurso.map(m => `<th>${NOMBRES_MES[m.month].slice(0,3)}</th>`).join('')}<th>Total</th></tr>
  <tr>${mesesCurso.map(m => `<td>${m.lectivos}</td>`).join('')}<td class="total">${totalLectivos}</td></tr>
`;

// ---------- Notas sin fecha ----------
document.getElementById('notasList').innerHTML = notasSinFecha.map(n => `<li>${n}</li>`).join('');
