const subjects = {
  PROGR:  { name: 'Programación',                                             teacher: 'Luis Manuel Vázquez Venegas', color: '#569cd6' },
  BADAT:  { name: 'Bases de Datos',                                            teacher: 'Miguel Ángel García Blanes',  color: '#c586c0' },
  ENDES:  { name: 'Entornos de desarrollo',                                    teacher: 'Pablo Hernández García',      color: '#4ec9b0' },
  'IPE I':{ name: 'Itinerario Personal para la Empleabilidad I',               teacher: 'Alejandro Martín Rodríguez',  color: '#ce9178' },
  LMSGI:  { name: 'Lenguajes de marcas y sistemas de gestión de información',  teacher: 'Pablo Hernández García',      color: '#d7ba7d' },
  SIINF:  { name: 'Sistemas informáticos',                                    teacher: 'Juan Aguilar Ferrer',         color: '#6a9955' },
  SASP:   { name: 'Sostenibilidad Aplicada al Sistema Productivo',            teacher: 'Luis Manuel Vázquez Venegas', color: '#dcdcaa' },
  DASPGS: { name: 'Digitalización Aplicada a los Sectores Productivos GS',    teacher: 'Luis Manuel Vázquez Venegas', color: '#9cdcfe' },
};

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const slots = ['08:15–09:15', '09:15–10:15', '10:15–11:15', '11:45–12:45', '12:45–13:45', '13:45–14:45'];

// Cada franja: array de entradas. Una entrada normal usa "code" (busca en subjects);
// una entrada suelta (tutorías, etc.) define name/teacher directamente.
const schedule = [
  // Lunes
  [ [{code:'PROGR'}], [{code:'PROGR'}], [{code:'ENDES'}],
    [{code:'IPE I'}],
    [{code:'LMSGI'}], [{code:'SIINF'}] ],
  // Martes
  [ [{code:'BADAT'}], [{code:'BADAT'}], [{code:'PROGR'}],
    [{code:'ENDES'}], [{code:'SASP'}], [{code:'SIINF'}] ],
  // Miércoles
  [ [{code:'DASPGS'}], [{code:'BADAT'}],
    [{code:'BADAT'}],
    [{code:'LMSGI'}], [{code:'PROGR'}], [{code:'IPE I'}] ],
  // Jueves
  [ [{code:'ENDES'}], [{code:'PROGR'}], [{code:'PROGR'}],
    [{code:'SIINF'}],
    [{code:'SIINF'}], [{code:'IPE I'}] ],
  // Viernes
  [ [{code:'LMSGI'}], [{code:'PROGR'}], [{code:'PROGR'}],
    [{code:'BADAT'}], [{code:'BADAT'}], [{code:'SIINF'}] ],
];

const todayIdx = new Date().getDay() - 1; // Lunes=0 ... Viernes=4

function entryHtml(e) {
  const info = e.code ? subjects[e.code] : null;
  const name = info ? info.name : e.name;
  const teacher = e.teacher || (info ? info.teacher : '');
  const color = info ? info.color : '#808080';
  const note = e.note ? `<div class="note">${e.note}</div>` : '';
  return `<div class="entry" data-code="${e.code || ''}" style="--c:${color}">
    <div class="name">${e.code || name}</div>
    <div class="teacher">${teacher}</div>
    ${note}
  </div>`;
}

const grid = document.getElementById('schedule');
let html = '<div class="cell head"></div>';
days.forEach((d, i) => {
  html += `<div class="cell head${i === todayIdx ? ' today' : ''}">${d}</div>`;
});

slots.forEach((slot, rowIdx) => {
  html += `<div class="cell time-cell">${slot}</div>`;
  days.forEach((d, colIdx) => {
    const entries = schedule[colIdx][rowIdx];
    const today = colIdx === todayIdx ? ' today' : '';
    html += `<div class="cell day-cell${today}" data-day="${colIdx}" data-slot="${rowIdx}">${entries.map(entryHtml).join('')}</div>`;
  });
  if (rowIdx === 2) {
    html += `<div class="cell recreo" id="recreo-cell">Recreo · 11:15–11:45</div>`;
  }
});

grid.innerHTML = html;

const tbody = document.querySelector('#materias-table tbody');
tbody.innerHTML = Object.entries(subjects).map(([abbr, s]) => `
  <tr data-code="${abbr}">
    <td><span class="swatch" style="background:${s.color}"></span><span class="abbr">${abbr}</span></td>
    <td>${s.name}</td>
    <td>${s.teacher}</td>
  </tr>
`).join('');

// ---------- Filtro por asignatura ----------
const filterBar = document.getElementById('filter-bar');
let activeCode = null; // null = sin filtro (se ve todo normal)

const allChip = `<button class="chip all active" data-filter="__all__">
  <span class="dot"></span>Todas
</button>`;
const subjectChips = Object.entries(subjects).map(([abbr, s]) => `
  <button class="chip" data-filter="${abbr}" style="--c:${s.color}">
    <span class="dot"></span>${abbr}
  </button>
`).join('');
filterBar.innerHTML = allChip + subjectChips;

function applyFilter(code) {
  activeCode = code;
  filterBar.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === (code || '__all__'));
  });
  document.querySelectorAll('.entry').forEach(el => {
    const isMatch = !code || el.dataset.code === code;
    el.classList.toggle('dimmed', !isMatch);
    el.classList.toggle('match', !!code && isMatch);
  });
  document.querySelectorAll('#materias-table tbody tr').forEach(row => {
    const isMatch = !code || row.dataset.code === code;
    row.classList.toggle('dimmed', !isMatch);
    row.classList.toggle('match', !!code && isMatch);
  });
}

filterBar.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const code = chip.dataset.filter;
  if (window.__modoEdicion && code !== '__all__') {
    window.__toggleConvalidada(code);
    return;
  }
  applyFilter(code === '__all__' ? null : code);
});

// ---------- Resaltar la franja horaria actual ("AHORA") ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
const slotRanges = slots.map(s => {
  const [start, end] = s.split('–'); // guion en medio (–), el mismo que en "slots"
  return [toMinutes(start), toMinutes(end)];
});
const recreoRange = [toMinutes('11:15'), toMinutes('11:45')];

function updateNow() {
  document.querySelectorAll('.day-cell.now').forEach(el => el.classList.remove('now'));
  document.querySelectorAll('.entry.now-entry').forEach(el => el.classList.remove('now-entry'));
  const recreoCell = document.getElementById('recreo-cell');
  if (recreoCell) recreoCell.classList.remove('now');

  if (todayIdx < 0 || todayIdx > 4) return; // fin de semana: nada que encender

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (nowMinutes >= recreoRange[0] && nowMinutes < recreoRange[1]) {
    if (recreoCell) recreoCell.classList.add('now');
    return;
  }

  const slotIdx = slotRanges.findIndex(([s, e]) => nowMinutes >= s && nowMinutes < e);
  if (slotIdx === -1) return; // fuera de horario lectivo

  const cell = document.querySelector(`.day-cell[data-day="${todayIdx}"][data-slot="${slotIdx}"]`);
  if (cell) {
    cell.classList.add('now');
    cell.querySelectorAll('.entry').forEach(el => el.classList.add('now-entry'));
  }
}

updateNow();
setInterval(updateNow, 30000); // se mantiene al día si dejas la pestaña abierta
