// mobile-calendario.js — pantalla Calendario (móvil). Incrusta la página Calendario.html de la web, que ya
// trae TODAS las funciones (vista de mes, eventos personales con sesión, tareas hechas, añadir examen o tarea).
import { el } from './dom.js';
import { sandboxPara } from './notas.js?v=5558ec18';

const urlDe = (ruta) => new URL(ruta.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
function buscar(nodo) {
  for (const h of nodo.children ?? []) {
    if (h.type === 'file' && /^calendario\.html?$/i.test(h.name)) return h;
    if (h.type === 'folder') { const r = buscar(h); if (r) return r; }
  }
  return null;
}

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const slot = raiz.querySelector('[data-m-slot="calendario"]');
  const mes = raiz.querySelector('#m-calendario-mes');
  let iniciado = false;

  const iniciar = async () => {
    if (mes) mes.textContent = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (iniciado) return;
    iniciado = true;
    slot.replaceChildren(el('p', 'm-vacio', 'Cargando calendario…'));
    try {
      const { fetchGithubTree } = await import('./github-source.js?v=02537279');
      const nodo = buscar((await fetchGithubTree()).root);
      if (!nodo) throw new Error('Calendario.html no encontrado');
      const marco = el('iframe', 'mc-marco');
      marco.sandbox = sandboxPara(nodo.path); // Calendario.html es de confianza (usa la sesión de Firebase); antes de src
      marco.src = urlDe(nodo.path);
      marco.title = 'Calendario';
      Object.assign(marco.style, { display: 'block', width: '100%', height: 'calc(100dvh - 210px)', minHeight: '420px',
        border: '0', borderRadius: '18px', background: '#0E1015' });
      slot.replaceChildren(marco);
    } catch (err) {
      console.error('Calendario no disponible', err);
      iniciado = false;
      slot.replaceChildren(el('p', 'm-vacio', 'No se pudo cargar el calendario.'));
    }
  };

  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'calendario') iniciar(); });
  if (raiz.dataset.mVista === 'calendario') iniciar();
}