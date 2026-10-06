// horario-movil.js — pestañas L-M-X-J-V para el Horario en móvil (el CSS solo las usa a ≤700 px).
const grid = document.getElementById('schedule');
const cabeceras = grid ? [...grid.querySelectorAll('.cell.head')].slice(1) : [];
if (grid && cabeceras.length) {
  const letras = ['L', 'M', 'X', 'J', 'V'];
  const hoy = Math.max(0, cabeceras.findIndex((c) => c.classList.contains('today')));
  const barra = document.createElement('div');
  barra.className = 'm-dias';
  const elegir = (i) => {
    grid.dataset.dia = String(i);
    [...barra.children].forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  };
  cabeceras.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = letras[i] ?? String(i + 1);
    b.setAttribute('aria-label', c.textContent.trim());
    b.addEventListener('click', () => elegir(i));
    barra.append(b);
  });
  grid.closest('.schedule-scroll').before(barra);
  elegir(hoy);
}
