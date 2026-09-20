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
// tipo: festivo | vacaciones | hito | cultural | evaluacion | reunion | evento
const eventos = [
  // Septiembre 2026
  { ini: dia(2026,8,4),  tipo:'reunion',   label:'ETCP (planificación de curso)' },
  { ini: dia(2026,8,8),  tipo:'reunion',   label:'Claustro (normas de funcionamiento, asignación de materias)' },
  { ini: dia(2026,8,9),  tipo:'reunion',   label:'Reunión de tutores' },
  { ini: dia(2026,8,10), tipo:'reunion',   label:'Reunión de equipos educativos NEAE' },
  { ini: dia(2026,8,14), tipo:'reunion',   label:'Claustro (comienzo de curso)' },
  { ini: dia(2026,8,15), tipo:'hito',      label:'Comienzo de las clases' },
  { ini: dia(2026,8,24), tipo:'festivo',   label:'Día de la Merced (Ayto.)' },
  { ini: dia(2026,8,28), tipo:'reunion',   label:'ETCP' },
  { ini: dia(2026,8,30), tipo:'evento',    label:'Presentación de padres y madres' },

  // Octubre 2026
  { ini: dia(2026,9,5), fin: dia(2026,9,7), tipo:'evaluacion', label:'Sesiones de evaluación inicial' },
  { ini: dia(2026,9,12), tipo:'festivo',   label:'Fiesta Nacional (Día del Pilar)' },
  { ini: dia(2026,9,15), tipo:'reunion',   label:'Consejo Escolar (aprobación de cuentas)' },
  { ini: dia(2026,9,21), tipo:'evento',    label:'Reunión Erasmus+' },
  { ini: dia(2026,9,26), tipo:'reunion',   label:'ETCP' },

  // Noviembre 2026
  { ini: dia(2026,10,2), tipo:'festivo',   label:'Fiesta de Todos los Santos (traslado)' },
  { ini: dia(2026,10,9), tipo:'reunion',   label:'Claustro (programaciones didácticas) y Consejo Escolar (planificación AACCE)' },
  { ini: dia(2026,10,10), fin: dia(2026,10,12), tipo:'evaluacion', label:'Preevaluaciones ESO' },
  { ini: dia(2026,10,10), fin: dia(2026,10,12), tipo:'evaluacion', label:'Seguimiento de pendientes' },
  { ini: dia(2026,10,30), tipo:'reunion',  label:'ETCP' },

  // Diciembre 2026
  { ini: dia(2026,11,7), tipo:'festivo',   label:'Día de la Constitución' },
  { ini: dia(2026,11,8), tipo:'festivo',   label:'Inmaculada Concepción' },
  { ini: dia(2026,11,15), fin: dia(2026,11,17), tipo:'evaluacion', label:'Sesiones 1ª evaluación' },
  { ini: dia(2026,11,22), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2026,11,23), fin: dia(2027,0,10), tipo:'vacaciones', label:'Vacaciones de Navidad' },

  // Enero 2027
  { ini: dia(2027,0,11), tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,0,11), fin: dia(2027,0,15), tipo:'evaluacion', label:'Exámenes de pendientes' },
  { ini: dia(2027,0,18), tipo:'reunion',   label:'Claustro y Consejo Escolar — resultados 1ª evaluación' },

  // Febrero 2027
  { ini: dia(2027,1,1),  tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,1,9), fin: dia(2027,1,11), tipo:'evaluacion', label:'Preevaluaciones ESO' },
  { ini: dia(2027,1,25), fin: dia(2027,1,26), tipo:'cultural', label:'Jornadas culturales por el Día de Andalucía' },

  // Marzo 2027
  { ini: dia(2027,2,1),  tipo:'festivo',   label:'Día de Andalucía' },
  { ini: dia(2027,2,8),  tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,2,15), fin: dia(2027,2,17), tipo:'evaluacion', label:'Sesiones 2ª evaluación' },
  { ini: dia(2027,2,19), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,2,20), fin: dia(2027,2,28), tipo:'vacaciones', label:'Vacaciones de Semana Santa' },

  // Abril 2027
  { ini: dia(2027,3,5),  tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,3,12), fin: dia(2027,3,16), tipo:'evaluacion', label:'Exámenes de pendientes' },
  { ini: dia(2027,3,12), tipo:'reunion',   label:'Claustro y Consejo Escolar — resultados 2ª evaluación' },
  { ini: dia(2027,3,26), tipo:'festivo',   label:'Feria de Jerez (Ayto.)' },
  { ini: dia(2027,3,30), tipo:'hito',      label:'Día de la Comunidad Educativa' },

  // Mayo 2027
  { ini: dia(2027,4,4), fin: dia(2027,4,6), tipo:'evaluacion', label:'Preevaluaciones ESO' },
  { ini: dia(2027,4,10), tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,4,18), fin: dia(2027,4,21), tipo:'evaluacion', label:'Exámenes finales de 2º Bachillerato' },
  { ini: dia(2027,4,24), tipo:'evaluacion', label:'Sesión de evaluación ordinaria de 2º Bachillerato' },
  { ini: dia(2027,4,24), tipo:'evaluacion', label:'Sesión de evaluación FINAL de FP — 2º DAM' },
  { ini: dia(2027,4,25), tipo:'evaluacion', label:'Publicación de notas de 2º Bachillerato y 2º DAM' },

  // Junio 2027
  { ini: dia(2027,5,3),  tipo:'evaluacion', label:'Sesiones evaluación FINAL FP (1º/2º ACOM, 1º/2º SMR, 1ª FINAL 1º/2º CFGB)' },
  { ini: dia(2027,5,4),  tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,5,7),  tipo:'reunion',   label:'ETCP' },
  { ini: dia(2027,5,9), fin: dia(2027,5,11), tipo:'evaluacion', label:'Exámenes pendientes 2º Bachillerato' },
  { ini: dia(2027,5,10), tipo:'evaluacion', label:'Evaluación FINAL de FP — 1º DAM', propia:true },
  { ini: dia(2027,5,11), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,5,16), fin: dia(2027,5,18), tipo:'evaluacion', label:'Exámenes de 2º Bach. — evaluación extraordinaria' },
  { ini: dia(2027,5,21), tipo:'evaluacion', label:'Examen de 2º Bach. — evaluación extraordinaria' },
  { ini: dia(2027,5,23), tipo:'hito',      label:'Último día lectivo' },
  { ini: dia(2027,5,23), fin: dia(2027,5,24), tipo:'evaluacion', label:'Sesiones eval. ordinaria ESO/1ºBach.; extraordinaria 2ºBach.; final 2ª FP de Ciclos' },
  { ini: dia(2027,5,24), tipo:'evaluacion', label:'Publicación de notas en iPasen' },
  { ini: dia(2027,5,25), tipo:'evento',    label:'Plazo de reclamaciones' },
  { ini: dia(2027,5,28), tipo:'evento',    label:'Plazo de reclamaciones' },
  { ini: dia(2027,5,29), tipo:'reunion',   label:'Claustro y Consejo Escolar — resultados evaluación ordinaria' },
];

const notasSinFecha = [
  'Viaje de estudios de 2º Bachillerato — por determinar',
  'Viaje lingüístico de 4º ESO — por determinar',
  'Acto de graduación de 2º Bachillerato — pendiente de fecha',
  'Acto de graduación de Ciclos y 4º ESO — pendiente de fecha',
];

// Expande cada evento a su lista concreta de días (para pintar la rejilla)
eventos.forEach(e => { e.dias = rango(e.ini, e.fin || e.ini); });

// Prioridad de color de fondo de celda (solo los tipos "grandes" tiñen la celda entera)
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
    const dots = otros.slice(0, 4).map(e => `<span class="cal-dot dot-${e.tipo}"></span>`).join('');

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

function pintaDetalle() {
  const evs = eventosDelDia(fechaSeleccionada);
  let html = `<div class="fecha">${formatoLargo(fechaSeleccionada)}</div>`;
  if (!evs.length) {
    html += `<div class="vacio">Sin anotaciones para este día.</div>`;
  } else {
    evs.forEach(e => {
      html += `<div class="item"><span class="sw sw-${e.tipo}"></span>${e.label}${e.propia ? '<span class="estrella" title="Tu evaluación">★</span>' : ''}</div>`;
    });
  }
  detalleEl.innerHTML = html;
}

btnAnterior.addEventListener('click', () => { if (idxMes > 0) { idxMes--; pintaMes(); } });
btnSiguiente.addEventListener('click', () => { if (idxMes < mesesCurso.length - 1) { idxMes++; pintaMes(); } });

pintaMes();
pintaDetalle();

// ---------- Próximos 5 festivos (festivo + vacaciones), aunque sean de otro mes ----------
function diasHasta(fecha) {
  const ms = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round(ms / 86400000);
}

const festivos = eventos
  .filter(e => e.tipo === 'festivo' || e.tipo === 'vacaciones')
  .filter(e => (e.fin || e.ini) >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
  .sort((a, b) => a.ini - b.ini)
  .slice(0, 5);

const festivosListEl = document.getElementById('festivosList');
festivosListEl.innerHTML = festivos.map(e => {
  const rangoTexto = e.fin ? `${formatoCorto(e.ini)} – ${formatoCorto(e.fin)}` : formatoCorto(e.ini);
  const n = diasHasta(e.ini);
  const cuenta = n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`;
  return `<div class="festivo-item tipo-${e.tipo}">
    <span class="f-fecha">${rangoTexto}</span>
    <span class="f-label">${e.label}</span>
    <span class="f-cuenta">${cuenta}</span>
  </div>`;
}).join('') || `<p class="vacio">No quedan más festivos en lo que resta de curso.</p>`;

// ---------- Tabla de días lectivos ----------
const tabla = document.getElementById('tablaLectivos');
const totalLectivos = mesesCurso.reduce((acc, m) => acc + m.lectivos, 0);
tabla.innerHTML = `
  <tr>${mesesCurso.map(m => `<th>${NOMBRES_MES[m.month].slice(0,3)}</th>`).join('')}<th>Total</th></tr>
  <tr>${mesesCurso.map(m => `<td>${m.lectivos}</td>`).join('')}<td class="total">${totalLectivos}</td></tr>
`;

// ---------- Notas sin fecha ----------
document.getElementById('notasList').innerHTML = notasSinFecha.map(n => `<li>${n}</li>`).join('');
