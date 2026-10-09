// mobile-ajustes.js — «Ajustes» en la pantalla Cuenta (móvil): tamaño de letra de los apuntes.
// Usa la misma clave y el mismo rango que la web de escritorio (damNotesAjustes, 80–150 %).
import { el } from './dom.js';
import { iniciarCuenta } from './mobile-cuenta.js?v=c00be038';

const CLAVE = 'damNotesAjustes';
const MIN = 80, MAX = 150, PASO = 10;

function leer() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return Number.isFinite(g.fontsize) ? Math.min(MAX, Math.max(MIN, g.fontsize)) : 100;
  } catch { return 100; }
}
function guardar(v) {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    g.fontsize = v;
    localStorage.setItem(CLAVE, JSON.stringify(g));
  } catch { /* sin almacenamiento: el cambio dura solo esta sesión */ }
  document.documentElement.style.setProperty('--note-scale', v / 100);
}

const raiz = document.getElementById('mobile-app');
const slot = raiz?.querySelector('[data-m-slot="cuenta"]');
if (slot) {
  iniciarCuenta(raiz); // acceso / perfil (mobile-cuenta.js solo exporta la función; alguien tiene que llamarla)
  let valor = leer();
  const num = el('output', 'mj-valor', `${valor}%`);
  num.setAttribute('aria-live', 'polite');
  const boton = (texto, etiqueta, delta) => {
    const b = el('button', 'mj-btn', texto);
    b.type = 'button';
    b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', () => {
      valor = Math.min(MAX, Math.max(MIN, valor + delta));
      guardar(valor);
      num.textContent = `${valor}%`;
    });
    return b;
  };
  const control = el('div', 'mj-control');
  control.append(boton('−', 'Reducir letra', -PASO), num, boton('+', 'Aumentar letra', PASO));
  const fila = el('div', 'mj-fila');
  fila.append(el('span', 'mj-etiqueta', 'Tamaño de letra'), control);
  const seccion = el('section', 'mj-seccion');
  seccion.append(el('h2', 'm-seccion-titulo', 'Ajustes'), fila);
  slot.after(seccion);
}