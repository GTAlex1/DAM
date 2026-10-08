// mobile-chat.js — Chat (móvil), fase 1: grupo «General» + grupos de 2 a 30 personas. Solo texto.
// Texto con formato seguro (sin innerHTML): [texto](https://…), enlaces sueltos, **negrita**, *cursiva*, `código`.
import { el } from './dom.js';
import { cargarFirebase, nombreDe, UID_ADMIN } from './chat-core.js?v=07eafb64';

const PAGINA = 50, MAX_TEXTO = 2000, MAX_GRUPO = 30;
const COLORES = ['#6AA9FF', '#7BE0A8', '#FFA45C', '#C58BFF', '#FF7A8A', '#5FD6D6'];
const colorDe = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; };
const PATRON = /\[([^\]\n]{1,100})\]\(([^\s)]{1,500})\)|(https?:\/\/[^\s<]{0,499}[^\s<.,;:!?)])|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/g;

// Acepta «https://sitio.com», «http://…» y también «sitio.com/ruta» (se le añade https://).
function normalizarUrl(u) {
  if (/^https?:\/\//i.test(u)) return u;
  return /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(u) ? `https://${u}` : null;
}
function enlace(texto, url) {
  const limpia = normalizarUrl(url);
  let u;
  try { u = new URL(limpia); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null; // nada de javascript:, data:…
  const a = el('a', 'mch-enlace', texto);
  a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
  return a;
}
function formatearLinea(texto, destino) {
  let i = 0;
  for (const m of texto.matchAll(PATRON)) {
    if (m.index > i) destino.append(texto.slice(i, m.index));
    const nodo = m[2] ? enlace(m[1], m[2]) : m[3] ? enlace(m[3], m[3])
      : m[4] ? el('strong', 'mch-b', m[4]) : m[5] ? el('code', 'mch-codigo', m[5]) : el('em', 'mch-i', m[6]);
    destino.append(nodo ?? m[0]);
    i = m.index + m[0].length;
  }
  if (i < texto.length) destino.append(texto.slice(i));
}

// Bloques: «# título» (1 a 3 #) y ``` bloques de código ``` ; el resto, línea a línea con formato en línea.
function formatear(texto, destino) {
  let codigo = null;
  let enLinea = false;
  const cerrar = () => { const pre = el('pre', 'mch-bloque'); pre.append(el('code', '', codigo.join('\n'))); destino.append(pre); codigo = null; enLinea = false; };
  for (const linea of texto.split('\n')) {
    if (/^```/.test(linea)) { if (codigo === null) codigo = []; else cerrar(); continue; }
    if (codigo) { codigo.push(linea); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(linea);
    if (h) { const t = el('div', `mch-h mch-h${h[1].length}`); formatearLinea(h[2], t); destino.append(t); enLinea = false; continue; }
    if (enLinea) destino.append('\n');
    formatearLinea(linea, destino);
    enLinea = true;
  }
  if (codigo) cerrar();
}

// Archivos (solo descarga) por Cloudinary. Para usar otro preset sin firmar, cambia PRESET.
const CLOUD = 'vagm1bzj', PRESET = 'DAMChat', MAX_MB = 10;
const PREFIJO_CLOUD = `https://res.cloudinary.com/${CLOUD}/`;
const EXT_OK = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const urlDescarga = (u) => u.replace('/upload/', '/upload/fl_attachment/');

// Monta el chat dentro de `slot`. `anfitrion` es donde se abren la conversación y los diálogos
// (móvil: #mobile-app; escritorio: el panel del chat). Devuelve { iniciar }.
export function montarChat({ slot, btnNuevo, anfitrion }) {
  const raiz = anfitrion;
  raiz.classList.add('mch');
  slot.classList.add('mch');
  let fb = null; // { auth, fs, db, yo, admin }
  let iniciado = false, bajaGrupos = null, bajaConv = null;

  const aviso = (msg) => slot.replaceChildren(el('p', 'm-vacio', msg));

  // ---------- Lista de chats ----------
  function tarjeta(nombre, sub, clave, onClick) {
    const b = el('button', 'mch-tarjeta');
    b.type = 'button';
    const chip = el('span', 'mch-chip', nombre.slice(0, 2).toUpperCase());
    chip.style.background = clave;
    const txt = el('span', 'mch-tarjeta-txt');
    txt.append(el('span', 'mch-tarjeta-nombre', nombre), el('span', 'mch-tarjeta-sub', sub));
    b.append(chip, txt);
    b.addEventListener('click', onClick);
    return b;
  }
  function pintarLista(grupos) {
    const lista = el('div', 'mch-lista');
    lista.append(tarjeta('General', 'Toda la clase', '#FFC857', () => abrir({ id: 'general', nombre: 'General', sub: 'Toda la clase' })));
    for (const g of grupos) {
      lista.append(tarjeta(g.nombre, `${g.miembros.length} personas`, colorDe(g.id),
        () => abrir({ id: g.id, nombre: g.nombre, sub: `${g.miembros.length} personas` })));
    }
    if (!grupos.length) lista.append(el('p', 'm-vacio', 'Crea un grupo con el botón + para hablar con tus compañeros de trabajo.'));
    slot.replaceChildren(lista);
  }

  async function iniciar() {
    if (iniciado) return;
    iniciado = true;
    aviso('Cargando chat…');
    try {
      fb = await cargarFirebase();
      const { auth, fs, fa, db } = fb;
      fa.onAuthStateChanged(auth, async (u) => {
        bajaGrupos?.(); bajaGrupos = null;
        fb.yo = u;
        fb.admin = !!u && fb.fi?.isAuthorized?.(u) === true;
        if (btnNuevo) btnNuevo.hidden = !u || fb.admin;
        if (!u) {
          const b = el('button', 'mch-btn', 'Iniciar sesión');
          b.type = 'button';
          b.dataset.mTab = 'cuenta'; // el menú principal ya sabe ir a Cuenta
          slot.replaceChildren(el('p', 'm-vacio', 'Inicia sesión para usar el chat de la clase.'), b);
          return;
        }
        pintarLista([]);
        bajaGrupos = fs.onSnapshot(fb.admin ? fs.collection(db, 'chats') : fs.query(fs.collection(db, 'chats'), fs.where('miembros', 'array-contains', u.uid)), (snap) => {
          const g = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.creado?.toMillis?.() ?? Infinity) - (a.creado?.toMillis?.() ?? Infinity));
          pintarLista(g);
        }, () => { pintarLista([]); slot.append(el('p', 'm-vacio', 'No se pudieron cargar tus grupos. El grupo General sí funciona.')); });
      });
    } catch (err) {
      console.error('Chat no disponible', err);
      iniciado = false;
      aviso('No se pudo cargar el chat.');
    }
  }

  // ---------- Nuevo grupo ----------
  async function nuevoGrupo() {
    const { fs, db, yo } = fb;
    const dlg = el('dialog', 'mch-dialogo');
    const nombre = el('input', 'mch-input');
    nombre.maxLength = 40; nombre.placeholder = 'Nombre del grupo'; nombre.setAttribute('aria-label', 'Nombre del grupo');
    const miembros = el('div', 'mch-miembros');
    const msg = el('p', 'mch-aviso', 'Cargando compañeros…');
    const cancelar = el('button', 'mch-btn mch-btn-sec', 'Cancelar');
    const crear = el('button', 'mch-btn', 'Crear grupo');
    cancelar.type = crear.type = 'button';
    const fila = el('div', 'mch-fila');
    fila.append(cancelar, crear);
    dlg.append(el('h2', 'mch-dialogo-titulo', 'Nuevo grupo'), nombre, msg, miembros, fila);
    raiz.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    cancelar.addEventListener('click', () => dlg.close());
    dlg.showModal();
    try {
      const snap = await fs.getDocs(fs.collection(db, 'directorio'));
      const alumnos = snap.docs.filter((d) => d.id !== yo.uid && d.id !== UID_ADMIN).map((d) => ({ uid: d.id, nombre: String(d.data().nombre || 'Alumno') }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      msg.textContent = alumnos.length ? `Elige entre 1 y ${MAX_GRUPO - 1} compañeros` : 'Aún no hay compañeros registrados: aparecen cuando inician sesión una vez.';
      for (const a of alumnos) {
        const l = el('label', 'mch-miembro');
        const c = el('input', '');
        c.type = 'checkbox'; c.value = a.uid;
        l.append(c, el('span', '', a.nombre));
        miembros.append(l);
      }
    } catch (err) { console.error(err); msg.textContent = 'No se pudo cargar la lista de compañeros.'; }
    crear.addEventListener('click', async () => {
      const elegidos = [...miembros.querySelectorAll('input:checked')].map((c) => c.value);
      const nom = nombre.value.trim();
      if (!nom) { msg.textContent = 'Ponle un nombre al grupo.'; nombre.focus(); return; }
      if (elegidos.length < 1 || elegidos.length > MAX_GRUPO - 1) { msg.textContent = `Elige entre 1 y ${MAX_GRUPO - 1} compañeros.`; return; }
      crear.disabled = true;
      try {
        await fs.addDoc(fs.collection(db, 'chats'), { nombre: nom, miembros: [yo.uid, ...elegidos], creador: yo.uid, creado: fs.serverTimestamp() });
        dlg.close();
      } catch (err) { console.error(err); msg.textContent = 'No se pudo crear el grupo.'; crear.disabled = false; }
    });
  }
  btnNuevo?.addEventListener('click', () => { if (fb?.yo) nuevoGrupo(); });

  // ---------- Conversación ----------
  function abrir(chat) {
    const { fs, db, yo } = fb;
    const atras = el('button', 'mch-atras', '‹');
    atras.type = 'button'; atras.setAttribute('aria-label', 'Volver a los chats');
    const cab = el('header', 'mch-cab');
    const t = el('div', 'mch-cab-txt');
    t.append(el('span', 'mch-cab-nombre', chat.nombre), el('span', 'mch-cab-sub', chat.sub));
    cab.append(atras, t);
    const msgs = el('div', 'mch-msgs');
    msgs.setAttribute('role', 'log'); msgs.setAttribute('aria-live', 'polite');
    const caja = el('textarea', 'mch-caja');
    caja.rows = 1; caja.maxLength = MAX_TEXTO; caja.placeholder = 'Escribe un mensaje…'; caja.setAttribute('aria-label', 'Mensaje');
    const enviar = el('button', 'mch-enviar', '➤');
    enviar.type = 'button'; enviar.setAttribute('aria-label', 'Enviar'); enviar.disabled = true;
    const adjuntar = el('button', 'mch-adjuntar', '📎');
    adjuntar.type = 'button'; adjuntar.setAttribute('aria-label', 'Adjuntar archivo'); adjuntar.title = `Adjuntar archivo (máx. ${MAX_MB} MB)`;
    const entrada = el('input', '');
    entrada.type = 'file'; entrada.hidden = true; entrada.accept = EXT_OK.map((e) => `.${e}`).join(',');
    const comp = el('div', 'mch-comp');
    comp.append(...(fb.admin ? [el('p', 'mch-aviso', 'Modo administrador: solo lectura')] : [adjuntar, entrada, caja, enviar]));
    const conv = el('div', 'mch-conv');
    conv.append(cab, msgs, comp);
    raiz.append(conv);
    history.pushState({ mch: 1 }, '');

    const coleccion = fs.collection(db, 'chats', chat.id, 'mensajes');
    let recientes = [], antiguos = [], ultimoDoc = null, hayMas = true;
    const todos = () => {
      const mapa = new Map();
      for (const m of [...antiguos, ...recientes]) mapa.set(m.id, m);
      return [...mapa.values()].sort((a, b) => a.t - b.t);
    };
    const leer = (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), t: d.data({ serverTimestamps: 'estimate' }).creado?.toMillis?.() ?? Date.now() });

    function pintar(bajar) {
      const pegado = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
      const frag = document.createDocumentFragment();
      if (hayMas && recientes.length >= PAGINA) {
        const mas = el('button', 'mch-mas', 'Cargar mensajes anteriores');
        mas.type = 'button';
        mas.addEventListener('click', cargarAntiguos);
        frag.append(mas);
      }
      let dia = '', autor = '';
      for (const m of todos()) {
        const f = new Date(m.t);
        const d = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (d !== dia) { dia = d; autor = ''; frag.append(el('p', 'mch-dia', d.charAt(0).toUpperCase() + d.slice(1))); }
        const mio = m.uid === yo.uid;
        const burbuja = el('div', `mch-burbuja${mio ? ' mio' : ''}`);
        if (!mio && m.autor !== autor) {
          const n = el('span', 'mch-autor', m.autor); n.style.color = colorDe(m.uid); burbuja.append(n);
        }
        autor = m.autor;
        const cuerpo = el('span', 'mch-texto', '');
        formatear(m.texto, cuerpo);
        burbuja.append(cuerpo);
        if (m.archivo && typeof m.archivo.url === 'string' && m.archivo.url.startsWith(PREFIJO_CLOUD)) {
          const a = el('a', 'mch-archivo');
          a.href = urlDescarga(m.archivo.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.append(el('span', 'mch-archivo-ico', '⬇'), el('span', 'mch-archivo-nom', String(m.archivo.nombre || 'archivo').slice(0, 80)),
            el('span', 'mch-archivo-tam', tamano(Number(m.archivo.tam) || 0)));
          burbuja.append(a);
        }
        burbuja.append(el('span', 'mch-hora', f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })));
        if (mio) {
          const x = el('button', 'mch-borrar', '×');
          x.type = 'button'; x.setAttribute('aria-label', 'Eliminar mensaje');
          x.addEventListener('click', () => { if (confirm('¿Eliminar este mensaje?')) fs.deleteDoc(fs.doc(db, 'chats', chat.id, 'mensajes', m.id)).catch(() => {}); });
          burbuja.append(x);
        }
        frag.append(burbuja);
      }
      if (!todos().length) frag.append(el('p', 'm-vacio', 'Aún no hay mensajes. ¡Escribe el primero!'));
      msgs.replaceChildren(frag);
      if (bajar || pegado) msgs.scrollTop = msgs.scrollHeight;
    }

    async function cargarAntiguos() {
      const base = ultimoDoc ?? null;
      if (!base) return;
      const snap = await fs.getDocs(fs.query(coleccion, fs.orderBy('creado', 'desc'), fs.startAfter(base), fs.limit(PAGINA)));
      antiguos = [...antiguos, ...snap.docs.map(leer)];
      if (snap.docs.length) ultimoDoc = snap.docs[snap.docs.length - 1];
      hayMas = snap.docs.length === PAGINA;
      const antes = msgs.scrollHeight;
      pintar(false);
      msgs.scrollTop = msgs.scrollHeight - antes;
    }

    bajaConv = fs.onSnapshot(fs.query(coleccion, fs.orderBy('creado', 'desc'), fs.limit(PAGINA)), (snap) => {
      recientes = snap.docs.map(leer);
      if (!ultimoDoc && snap.docs.length) ultimoDoc = snap.docs[snap.docs.length - 1];
      pintar(recientes.length === snap.docs.length && !msgs.childElementCount);
    }, () => msgs.replaceChildren(el('p', 'm-vacio', 'No se pudieron cargar los mensajes.')));

    const ajustar = () => { caja.style.height = 'auto'; caja.style.height = `${Math.min(caja.scrollHeight, 120)}px`; enviar.disabled = !caja.value.trim(); };
    caja.addEventListener('input', ajustar);
    async function mandar() {
      const texto = caja.value.trim().slice(0, MAX_TEXTO);
      if (!texto) return;
      enviar.disabled = true;
      try {
        await fs.addDoc(coleccion, { uid: yo.uid, autor: nombreDe(yo).slice(0, 60), texto, creado: fs.serverTimestamp() });
        caja.value = ''; ajustar(); pintar(true);
      } catch (err) { console.error(err); caja.placeholder = 'No se pudo enviar. Inténtalo de nuevo'; enviar.disabled = false; }
    }
    enviar.addEventListener('click', mandar);
    adjuntar.addEventListener('click', () => entrada.click());
    entrada.addEventListener('change', async () => {
      const f = entrada.files?.[0];
      entrada.value = '';
      if (!f) return;
      if (!EXT_OK.includes(f.name.split('.').pop().toLowerCase())) { caja.placeholder = 'Tipo de archivo no permitido'; return; }
      if (f.size > MAX_MB * 1048576) { caja.placeholder = `Máximo ${MAX_MB} MB por archivo`; return; }
      adjuntar.disabled = enviar.disabled = true;
      caja.placeholder = 'Subiendo archivo…';
      try {
        const datos = new FormData();
        datos.append('file', f); datos.append('upload_preset', PRESET);
        const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, { method: 'POST', body: datos });
        const j = await r.json();
        if (!r.ok || typeof j.secure_url !== 'string' || !j.secure_url.startsWith(PREFIJO_CLOUD)) throw new Error(j?.error?.message || 'subida fallida');
        await fs.addDoc(coleccion, { uid: yo.uid, autor: nombreDe(yo).slice(0, 60), texto: caja.value.trim().slice(0, MAX_TEXTO),
          archivo: { url: j.secure_url, nombre: f.name.slice(0, 100), tam: f.size }, creado: fs.serverTimestamp() });
        caja.value = ''; caja.placeholder = 'Escribe un mensaje…'; pintar(true);
      } catch (err) { console.error(err); caja.placeholder = 'No se pudo subir el archivo'; }
      finally { adjuntar.disabled = false; ajustar(); }
    });

    const cerrar = () => { bajaConv?.(); bajaConv = null; conv.remove(); window.removeEventListener('popstate', cerrar); };
    window.addEventListener('popstate', cerrar);
    atras.addEventListener('click', () => history.back());
    if (!fb.admin) caja.focus();
  }

  return { iniciar };
}