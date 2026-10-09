// extensiones.js
// Pestaña «Extensiones» de la barra de actividad (escritorio), justo debajo del chat: abre un panel
// lateral con herramientas (calculadoras) para no tener que buscarlas dentro de los apuntes.
// La lógica de cálculo está en calculadoras.js (sin DOM, con tests); aquí solo la interfaz.
// Todo se construye con textContent: nada de innerHTML.
import { el } from './dom.js';
import {
  evaluar, formatearNumero, convertirBase, capacidad, binarioATexto, textoABytes, bytesABinario, desglose,
} from './calculadoras.js?v=00000000';

const MAX_FILAS = 64; // filas del desglose byte a byte

// ---------- Piezas comunes ----------
function boton(texto, etiqueta, clase = 'ext-btn') {
  const b = el('button', clase, texto);
  b.type = 'button'; b.title = etiqueta; b.setAttribute('aria-label', etiqueta);
  return b;
}
function entrada(valor, etiqueta) {
  const i = el('input');
  i.type = 'text'; i.value = valor; i.autocomplete = 'off'; i.spellcheck = false;
  i.setAttribute('aria-label', etiqueta);
  return i;
}
function selector(opciones, etiqueta) {
  const s = el('select');
  s.setAttribute('aria-label', etiqueta);
  for (const [valor, texto] of opciones) { const o = el('option', '', texto); o.value = valor; s.append(o); }
  return s;
}
function campo(etiqueta, control) {
  const l = el('label', 'ext-campo');
  l.append(el('span', '', etiqueta), control);
  return l;
}
// Fila de resultado: al hacer clic en el valor se copia al portapapeles.
function resultado(etiqueta) {
  const nodo = el('div', 'ext-res');
  const valor = el('code', '', '—');
  valor.title = 'Clic para copiar';
  valor.addEventListener('click', async () => {
    if (valor.textContent === '—') return;
    try {
      await navigator.clipboard.writeText(valor.textContent);
      valor.classList.add('copiado');
      setTimeout(() => valor.classList.remove('copiado'), 700);
    } catch { /* sin permiso de portapapeles */ }
  });
  nodo.append(el('span', '', etiqueta), valor);
  return { nodo, poner: (t) => { valor.textContent = t || '—'; } };
}

// ---------- 1. Calculadora (normal + científica) ----------
const TECLAS_CIENTIFICAS = [ // [texto del botón, lo que escribe]; null = alterna grados/radianes
  ['DEG', null], ['π', 'π'], ['e', 'e'], ['Ans', 'ans'], ['xʸ', '^'],
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'ln('], ['log', 'log('],
  ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('], ['√', '√('], ['x²', '^2'],
  ['x!', '!'], ['|x|', 'abs('], ['∛', 'cbrt('], ['eˣ', 'exp('], ['1/x', '1/('],
];
const BORRAR = /([a-z][a-z0-9]*\(|[a-z]+|.)$/; // borra de golpe «sin(», «ans», «pi»…

function montarCalculadora() {
  const raiz = el('div', 'ext-form');
  const pantalla = entrada('', 'Operación');
  pantalla.className = 'ext-calc-pantalla'; pantalla.placeholder = '0';
  const salida = el('div', 'ext-calc-salida'); salida.setAttribute('aria-live', 'polite');
  let grados = true; // sin, cos y tan en grados (DEG) o en radianes (RAD)
  let ans = 0;       // último resultado calculado
  const opciones = () => ({ grados, ans });

  const mostrar = (texto, error = false) => { salida.textContent = texto; salida.classList.toggle('err', error); };
  function igual() {
    try {
      const r = evaluar(pantalla.value, opciones());
      mostrar(`${pantalla.value} =`);
      ans = r;
      pantalla.value = formatearNumero(r);
    } catch (e) { mostrar(e.message, true); }
  }
  function vistaPrevia() { // resultado provisional mientras escribes (sin errores)
    try { if (pantalla.value.trim()) mostrar(`= ${formatearNumero(evaluar(pantalla.value, opciones()))}`); else mostrar(''); }
    catch { mostrar(''); }
  }
  function insertar(t) {
    const a = pantalla.selectionStart ?? pantalla.value.length;
    pantalla.setRangeText(t, a, pantalla.selectionEnd ?? a, 'end');
  }
  function borrar() {
    const a = pantalla.selectionStart ?? pantalla.value.length, b = pantalla.selectionEnd ?? a;
    if (a !== b) { pantalla.setRangeText('', a, b, 'end'); return; }
    const antes = pantalla.value.slice(0, a).replace(BORRAR, '');
    pantalla.value = antes + pantalla.value.slice(a);
    pantalla.setSelectionRange(antes.length, antes.length);
  }
  function pulsar(t) {
    if (t === 'C') { pantalla.value = ''; mostrar(''); }
    else if (t === '⌫') borrar();
    else insertar(t);
    vistaPrevia();
    pantalla.focus();
  }

  const cientificas = el('div', 'ext-teclas sci');
  for (const [texto, escribe] of TECLAS_CIENTIFICAS) {
    if (escribe === null) {
      const modo = boton('DEG', 'Grados o radianes (clic para cambiar)', 'ext-tecla sci-tecla modo');
      modo.addEventListener('click', () => {
        grados = !grados;
        modo.textContent = grados ? 'DEG' : 'RAD';
        vistaPrevia(); pantalla.focus();
      });
      cientificas.append(modo);
      continue;
    }
    const b = boton(texto, texto, 'ext-tecla sci-tecla');
    b.addEventListener('click', () => pulsar(escribe));
    cientificas.append(b);
  }

  const teclas = el('div', 'ext-teclas');
  const DISPOSICION = ['C', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', ',', '%', '+'];
  for (const t of DISPOSICION) {
    const b = boton(t, t === '⌫' ? 'Borrar' : t, `ext-tecla${'÷×−+'.includes(t) ? ' op' : ''}`);
    b.addEventListener('click', () => pulsar(t));
    teclas.append(b);
  }
  const eq = boton('=', 'Calcular', 'ext-tecla op ancha');
  eq.addEventListener('click', igual);
  teclas.append(eq);

  pantalla.addEventListener('input', vistaPrevia);
  pantalla.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); igual(); } });
  raiz.append(
    pantalla, salida, cientificas, teclas,
    el('p', 'ext-nota', 'También puedes escribir: sin cos tan asin acos atan sinh cosh tanh sqrt cbrt ln log log2 exp abs floor ceil round · pi e ans · ^ potencia · ! factorial · 2pi y 3(4+1) multiplican solos.'),
  );
  return raiz;
}

// ---------- 2. Conversor de bases ----------
function montarBases() {
  const raiz = el('div', 'ext-form');
  const num = entrada('107', 'Número');
  const base = selector([['10', 'Decimal (base 10)'], ['2', 'Binario (base 2)'], ['8', 'Octal (base 8)'], ['16', 'Hexadecimal (base 16)']], 'Base del número');
  const msg = el('p', 'ext-msg');
  const sal = { dec: resultado('Decimal'), bin: resultado('Binario'), oct: resultado('Octal'), hex: resultado('Hexadecimal') };
  function actualizar() {
    const r = convertirBase(num.value, Number(base.value));
    msg.textContent = r?.error ?? '';
    for (const k of Object.keys(sal)) sal[k].poner(r && !r.error ? r[k] : '');
  }
  num.addEventListener('input', actualizar);
  base.addEventListener('change', actualizar);
  raiz.append(campo('Número', num), campo('Base del número', base), ...Object.values(sal).map((s) => s.nodo), msg);
  actualizar();
  return raiz;
}

// ---------- 3. Calculadora de unidades (SI → CEI) ----------
function montarUnidades() {
  const raiz = el('div', 'ext-form');
  const num = entrada('320', 'Capacidad anunciada');
  num.inputMode = 'decimal';
  const uni = selector([['MB', 'MB'], ['GB', 'GB'], ['TB', 'TB']], 'Unidad');
  uni.value = 'GB';
  const msg = el('p', 'ext-msg');
  const sal = { bytes: resultado('Bytes reales'), bin: resultado('Lo que muestra el sistema'), dif: resultado('Diferencia aparente') };
  function actualizar() {
    const r = capacidad(num.value, uni.value);
    msg.textContent = r?.error ?? '';
    for (const k of Object.keys(sal)) sal[k].poner(r && !r.error ? r[k] : '');
  }
  num.addEventListener('input', actualizar);
  uni.addEventListener('change', actualizar);
  raiz.append(
    el('p', 'ext-nota', 'Capacidad anunciada por el fabricante (SI, base 1000) frente a la que muestra el sistema (CEI, base 1024).'),
    campo('Capacidad anunciada (SI)', num), campo('Unidad', uni), ...Object.values(sal).map((s) => s.nodo), msg,
  );
  actualizar();
  return raiz;
}

// ---------- 4. Binario ↔ ASCII ----------
function montarAscii() {
  const raiz = el('div', 'ext-form');
  const bin = el('textarea'); bin.rows = 4; bin.spellcheck = false; bin.placeholder = '01001000 01101111 01101100 01100001';
  bin.setAttribute('aria-label', 'Binario');
  const txt = el('textarea'); txt.rows = 3; txt.spellcheck = false; txt.placeholder = 'Hola';
  txt.setAttribute('aria-label', 'Texto');
  const msg = el('p', 'ext-msg');
  const nota = el('p', 'ext-nota');
  const tabla = el('table', 'ext-tabla');

  function pintarTabla(bytes) {
    const cab = el('tr');
    for (const t of ['Carácter', 'Dec', 'Hex', 'Binario']) cab.append(el('th', '', t));
    const cuerpo = el('tbody');
    for (const f of desglose(bytes).slice(0, MAX_FILAS)) {
      const tr = el('tr');
      for (const v of [f.car, f.dec, f.hex, f.bin]) tr.append(el('td', '', String(v)));
      cuerpo.append(tr);
    }
    tabla.replaceChildren(el('thead', '', ''), cuerpo);
    tabla.firstChild.append(cab);
    tabla.hidden = bytes.length === 0;
    nota.textContent = bytes.length > MAX_FILAS ? `Se muestran los primeros ${MAX_FILAS} de ${bytes.length} bytes.` : '';
  }
  bin.addEventListener('input', () => {
    const r = binarioATexto(bin.value);
    if (r.error) { msg.textContent = r.error; return; }
    msg.textContent = r.falta ? `Faltan ${r.falta} bits para completar el último byte.` : '';
    txt.value = r.texto;
    pintarTabla(r.bytes);
  });
  txt.addEventListener('input', () => {
    const bytes = textoABytes(txt.value);
    bin.value = bytesABinario(bytes);
    msg.textContent = '';
    pintarTabla(bytes);
  });

  raiz.append(
    campo('Texto', txt), campo('Binario (8 bits por carácter)', bin), msg, tabla, nota,
    el('p', 'ext-nota', 'Los caracteres que no son ASCII (ñ, á, €…) ocupan 2 o más bytes (UTF-8).'),
  );
  txt.value = 'Hola';
  txt.dispatchEvent(new Event('input'));
  return raiz;
}

const HERRAMIENTAS = [
  { id: 'calc', nombre: 'Calculadora', desc: 'Operaciones con paréntesis, decimales y porcentajes', icono: '+−', montar: montarCalculadora },
  { id: 'bases', nombre: 'Conversor de bases', desc: 'Decimal, binario, octal y hexadecimal', icono: '01', montar: montarBases },
  { id: 'unidades', nombre: 'Calculadora de unidades', desc: 'Capacidad del fabricante frente a la del sistema', icono: 'GB', montar: montarUnidades },
  { id: 'ascii', nombre: 'Binario ↔ ASCII', desc: 'Traduce binario a texto y texto a binario', icono: 'Aa', montar: montarAscii },
];

// ---------- Botón de la barra de actividad + panel ----------
const favoritos = document.getElementById('nav-favoritos');
if (favoritos && !document.getElementById('nav-extensiones')) {
  const NS = 'http://www.w3.org/2000/svg';
  const icono = document.createElementNS(NS, 'svg');
  icono.setAttribute('viewBox', '0 0 24 24'); icono.setAttribute('width', '22'); icono.setAttribute('height', '22');
  icono.setAttribute('aria-hidden', 'true'); icono.setAttribute('focusable', 'false');
  const ruta = document.createElementNS(NS, 'path');
  ruta.setAttribute('fill', 'currentColor');
  ruta.setAttribute('d', 'M3 3h8v8H3zM3 13h8v8H3zM13 13h8v8h-8zM15 3h6v6h-6z'); // cuadrícula con un cuadro «suelto»
  icono.append(ruta);

  const btnNav = el('button', 'activity-icon', '');
  btnNav.id = 'nav-extensiones'; btnNav.type = 'button'; btnNav.title = 'Extensiones';
  btnNav.setAttribute('aria-label', 'Extensiones'); btnNav.setAttribute('aria-expanded', 'false');
  btnNav.append(icono);
  (document.getElementById('nav-chat') || favoritos).after(btnNav); // debajo del chat

  const atras = boton('‹', 'Volver a la lista'); atras.hidden = true;
  const titulo = el('h2', '', 'Extensiones');
  const cerrar = boton('×', 'Cerrar extensiones');
  const cab = el('header', 'ext-cab');
  cab.append(atras, titulo, cerrar);

  const filtro = el('input', 'ext-filtro');
  filtro.type = 'search'; filtro.placeholder = 'Buscar en extensiones'; filtro.autocomplete = 'off';
  filtro.setAttribute('aria-label', 'Buscar en extensiones');
  const lista = el('ul', 'ext-lista');
  const items = HERRAMIENTAS.map((h) => {
    const li = el('li');
    const b = el('button', 'ext-item'); b.type = 'button';
    const txt = el('span', 'ext-item-txt');
    txt.append(el('span', 'ext-item-nom', h.nombre), el('span', 'ext-item-desc', h.desc));
    b.append(el('span', 'ext-chip', h.icono), txt);
    b.addEventListener('click', () => abrirHerramienta(h));
    li.append(b);
    return { li, h };
  });
  lista.append(...items.map((i) => i.li));
  filtro.addEventListener('input', () => {
    const q = filtro.value.trim().toLowerCase();
    for (const { li, h } of items) li.hidden = !!q && !`${h.nombre} ${h.desc}`.toLowerCase().includes(q);
  });

  const cuerpo = el('div', 'ext-cuerpo');
  const portada = el('div', 'ext-portada');
  portada.append(filtro, lista);
  cuerpo.append(portada);

  const panel = el('aside', 'ext-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Extensiones');
  panel.append(cab, cuerpo);
  document.body.append(panel);

  const vistas = new Map(); // id → <section>: se crean al abrir la primera vez y conservan lo escrito
  function volverALista() {
    for (const v of vistas.values()) v.hidden = true;
    portada.hidden = false; atras.hidden = true; titulo.textContent = 'Extensiones';
    filtro.focus();
  }
  function abrirHerramienta(h) {
    if (!vistas.has(h.id)) {
      const v = el('section', 'ext-vista');
      v.append(h.montar());
      vistas.set(h.id, v);
      cuerpo.append(v);
    }
    for (const [id, v] of vistas) v.hidden = id !== h.id;
    portada.hidden = true; atras.hidden = false; titulo.textContent = h.nombre;
    vistas.get(h.id).querySelector('input, textarea, select')?.focus();
  }
  function fijar(abierto) {
    if (abierto) { // el chat ocupa el mismo sitio: si está abierto, se cierra
      const chat = document.getElementById('nav-chat');
      if (chat?.getAttribute('aria-expanded') === 'true') chat.click();
    }
    panel.hidden = !abierto;
    btnNav.classList.toggle('active', abierto);
    btnNav.setAttribute('aria-expanded', String(abierto));
    if (abierto && !portada.hidden) filtro.focus();
  }

  btnNav.addEventListener('click', () => fijar(panel.hidden));
  cerrar.addEventListener('click', () => { fijar(false); btnNav.focus(); });
  atras.addEventListener('click', volverALista);
  // Al abrir el chat se cierra este panel.
  document.addEventListener('click', (e) => { if (!panel.hidden && e.target.closest?.('#nav-chat')) fijar(false); });
  // Esc cierra el panel (en captura, para que no cierre también la pestaña activa de los apuntes).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden || document.querySelector('dialog[open]')) return;
    e.preventDefault(); e.stopPropagation();
    fijar(false); btnNav.focus();
  }, true);
}