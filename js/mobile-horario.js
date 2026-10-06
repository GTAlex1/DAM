// mobile-horario.js — pantalla Horario (móvil): pestañas L M X J V y las clases del día.
// Los datos son una copia de los de js/horario.js; si cambias el horario allí, cámbialo también aquí.
import { el } from './dom.js';

const MATERIAS = {
  PROGR:  { name: 'Programación', teacher: 'Luis Manuel Vázquez Venegas', color: '#569cd6' },
  BADAT:  { name: 'Bases de Datos', teacher: 'Miguel Ángel García Blanes', color: '#c586c0' },
  ENDES:  { name: 'Entornos de desarrollo', teacher: 'Pablo Hernández García', color: '#4ec9b0' },
  'IPE I': { name: 'Itinerario Personal para la Empleabilidad I', teacher: 'Alejandro Martín Rodríguez', color: '#ce9178' },
  LMSGI:  { name: 'Lenguajes de marcas y sistemas de gestión de información', teacher: 'Pablo Hernández García', color: '#d7ba7d' },
  SIINF:  { name: 'Sistemas informáticos', teacher: 'Juan Aguilar Ferrer', color: '#6a9955' },
  SASP:   { name: 'Sostenibilidad Aplicada al Sistema Productivo', teacher: 'Luis Manuel Vázquez Venegas', color: '#dcdcaa' },
  DASPGS: { name: 'Digitalización Aplicada a los Sectores Productivos GS', teacher: 'Luis Manuel Vázquez Venegas', color: '#9cdcfe' },
};
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const LETRAS = ['L', 'M', 'X', 'J', 'V'];
const FRANJAS = ['08:15–09:15', '09:15–10:15', '10:15–11:15', '11:45–12:45', '12:45–13:45', '13:45–14:45'];
const HORARIO = [
  ['PROGR', 'PROGR', 'ENDES', 'IPE I', 'LMSGI', 'SIINF'],
  ['BADAT', 'BADAT', 'PROGR', 'ENDES', 'SASP', 'SIINF'],
  ['DASPGS', 'BADAT', 'BADAT', 'LMSGI', 'PROGR', 'IPE I'],
  ['ENDES', 'PROGR', 'PROGR', 'SIINF', 'SIINF', 'IPE I'],
  ['LMSGI', 'PROGR', 'PROGR', 'BADAT', 'BADAT', 'SIINF'],
];

const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
function esAhora(dia, franja) {
  const ahora = new Date();
  if (ahora.getDay() - 1 !== dia) return false;
  const [ini, fin] = FRANJAS[franja].split('–').map(minutos);
  const t = ahora.getHours() * 60 + ahora.getMinutes();
  return t >= ini && t < fin;
}

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const slot = raiz.querySelector('[data-m-slot="horario"]');
  const eyebrow = raiz.querySelector('#m-horario-dia');
  const hoy = new Date().getDay() - 1;
  let sel = hoy >= 0 && hoy <= 4 ? hoy : 0; // fin de semana: se muestra el lunes

  const pintar = () => {
    const pestanas = el('div', 'mh-dias');
    pestanas.setAttribute('role', 'group');
    pestanas.setAttribute('aria-label', 'Día de la semana');
    DIAS.forEach((d, i) => {
      const b = el('button', 'mh-dia', LETRAS[i]);
      b.type = 'button';
      b.setAttribute('aria-label', d);
      b.setAttribute('aria-pressed', String(i === sel));
      b.addEventListener('click', () => { sel = i; pintar(); });
      pestanas.append(b);
    });
    const lista = el('div', 'mh-lista');
    HORARIO[sel].forEach((codigo, i) => {
      if (i === 3) lista.append(el('p', 'mh-recreo', 'Recreo · 11:15–11:45'));
      const m = MATERIAS[codigo];
      const clase = el('div', 'mh-clase');
      clase.style.setProperty('--c', m.color);
      const txt = el('span', 'mh-txt');
      txt.append(el('span', 'mh-nombre', m.name), el('span', 'mh-meta', `${FRANJAS[i]} · ${m.teacher}`));
      clase.append(el('span', 'mh-chip', codigo), txt);
      if (esAhora(sel, i)) { clase.classList.add('ahora'); clase.append(el('span', 'mh-ahora', 'Ahora')); }
      lista.append(clase);
    });
    slot.replaceChildren(pestanas, lista);
    if (eyebrow) eyebrow.textContent = DIAS[sel];
  };

  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'horario') pintar(); });
  if (raiz.dataset.mVista === 'horario') pintar();
}
