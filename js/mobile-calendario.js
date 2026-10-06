// mobile-calendario.js — pantalla Calendario (móvil): próximos exámenes y tareas de la clase (solo lectura).
import { el } from './dom.js';

const fecha = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
function normalizar(d) {
  if (!d || (d.tipo !== 'examen' && d.tipo !== 'tarea') || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha ?? '')) return null;
  const titulo = String(d.titulo ?? '').trim();
  if (!titulo) return null;
  return { tipo: d.tipo, ini: fecha(d.fecha), titulo: titulo.slice(0, 120), asignatura: String(d.asignatura ?? '').trim().slice(0, 80),
    hora: typeof d.hora === 'string' && /^\d{2}:\d{2}$/.test(d.hora) ? d.hora : '' };
}

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const slot = raiz.querySelector('[data-m-slot="calendario"]');
  const mes = raiz.querySelector('#m-calendario-mes');
  let iniciado = false;
  let eventos = [];

  const pintar = () => {
    const n = new Date();
    const hoy = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (mes) mes.textContent = n.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const proximos = eventos.filter((e) => e.ini >= hoy).sort((a, b) => a.ini - b.ini);
    const seccion = (titulo, tipo, vacio) => {
      const lista = proximos.filter((e) => e.tipo === tipo);
      const caja = el('section', 'mc-seccion');
      caja.append(el('h2', 'm-seccion-titulo', titulo));
      if (!lista.length) caja.append(el('p', 'm-vacio', vacio));
      for (const e of lista) {
        const dias = Math.round((e.ini - hoy) / 86400000);
        const cuando = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`;
        const f = el('div', 'mc-fecha');
        f.append(el('span', 'mc-dia', String(e.ini.getDate())), el('span', 'mc-mes', e.ini.toLocaleDateString('es-ES', { month: 'short' })));
        const t = el('div', 'mc-txt');
        t.append(el('span', 'mc-titulo', e.titulo), el('span', 'mc-meta', [e.asignatura, e.hora, cuando].filter(Boolean).join(' · ')));
        const item = el('div', 'mc-item');
        item.append(f, t);
        caja.append(item);
      }
      return caja;
    };
    slot.replaceChildren(seccion('Exámenes', 'examen', 'No hay exámenes próximos.'), seccion('Tareas', 'tarea', 'No hay tareas próximas.'));
  };

  const iniciar = async () => {
    if (iniciado) { pintar(); return; }
    iniciado = true;
    slot.replaceChildren(el('p', 'm-vacio', 'Cargando calendario…'));
    try {
      const [{ auth }, fs] = await Promise.all([
        import('./firebase-init.js?v=11feeaf4'),
        import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js'),
      ]);
      const db = fs.getFirestore(auth.app);
      fs.onSnapshot(fs.query(fs.collection(db, 'calendario_eventos'), fs.where('ambito', '==', 'global')), (snap) => {
        eventos = [];
        snap.forEach((d) => { const e = normalizar(d.data()); if (e) eventos.push(e); });
        pintar();
      }, () => slot.replaceChildren(el('p', 'm-vacio', 'No se pudo cargar el calendario.')));
    } catch (err) {
      console.error('Calendario no disponible', err);
      iniciado = false;
      slot.replaceChildren(el('p', 'm-vacio', 'No se pudo cargar el calendario.'));
    }
  };

  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'calendario') iniciar(); });
  if (raiz.dataset.mVista === 'calendario') iniciar();
}
