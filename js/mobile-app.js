// mobile-app.js
// Navegación de la UI móvil (≤1100px). No toca la lógica de escritorio de app.js.
// Medidas de seguridad:
//   · Lista blanca de vistas y acciones: nada que venga del DOM o del storage se usa sin validar.
//   · Delegación de eventos con un único listener; solo se aceptan clics reales (isTrusted).
//   · Cero innerHTML: todo texto dinámico entra con textContent.
//   · Storage dentro de try/catch (modo privado, cuota) y validado al leer.
//   · La comunicación con los futuros componentes se hace con CustomEvent, sin eval ni handlers inline
//     (la CSP del proyecto ya bloquea orígenes externos).

const VISTAS = Object.freeze(['inicio', 'apuntes', 'horario', 'calendario', 'chat', 'cuenta']);
const ACCIONES = Object.freeze(['buscar']);
const CLAVE_VISTA = 'm-vista';

const esVista = (v) => typeof v === 'string' && VISTAS.includes(v);
const esAccion = (a) => typeof a === 'string' && ACCIONES.includes(a);

function leerVistaGuardada() {
  try {
    const v = sessionStorage.getItem(CLAVE_VISTA);
    return esVista(v) ? v : null;
  } catch { return null; }
}

function guardarVista(vista) {
  try { sessionStorage.setItem(CLAVE_VISTA, vista); } catch { /* storage no disponible: se ignora */ }
}

function saludo(fecha = new Date()) {
  const h = fecha.getHours();
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function mostrarVista(raiz, vista, { enfocar = false, contexto = null } = {}) {
  if (!esVista(vista)) return;                       // valor no permitido: no se hace nada

  for (const seccion of raiz.querySelectorAll('[data-m-view]')) {
    seccion.hidden = seccion.dataset.mView !== vista;
  }
  for (const tab of raiz.querySelectorAll('[data-m-tab]')) {
    if (tab.dataset.mTab === vista) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  raiz.dataset.mVista = vista;
  guardarVista(vista);

  if (enfocar) {                                      // accesibilidad: anuncia la nueva pantalla
    raiz.querySelector(`[data-m-view="${vista}"] .m-title`)?.focus({ preventScroll: true });
  }
  // Los componentes de cada pantalla escuchan este evento para cargarse bajo demanda.
  raiz.dispatchEvent(new CustomEvent('m:vista', { detail: { vista, contexto } }));
}

function iniciar(raiz) {
  const elSaludo = raiz.querySelector('#m-saludo');
  if (elSaludo) elSaludo.textContent = saludo();

  raiz.addEventListener('click', (e) => {
    if (!e.isTrusted) return;                         // ignora clics sintéticos (element.click(), scripts)
    const origen = e.target instanceof Element ? e.target : null;
    if (!origen) return;

    const tab = origen.closest('[data-m-tab]');
    if (tab && raiz.contains(tab)) {
      mostrarVista(raiz, tab.dataset.mTab, { enfocar: true });
      return;
    }

    const boton = origen.closest('[data-m-action]');
    if (boton && raiz.contains(boton) && esAccion(boton.dataset.mAction)) {
      raiz.dispatchEvent(new CustomEvent('m:accion', { detail: { accion: boton.dataset.mAction } }));
    }
  });

  // Navegación pedida por los componentes (p. ej. pulsar una asignatura en Inicio).
  // Se valida la vista; el contexto solo pasa si es un objeto plano y cada componente lo vuelve a validar.
  raiz.addEventListener('m:ir', (e) => {
    const { vista, contexto } = e.detail ?? {};
    if (!esVista(vista)) return;
    const ctx = contexto && typeof contexto === 'object' ? { ...contexto } : null;
    mostrarVista(raiz, vista, { enfocar: true, contexto: ctx });
  });

  mostrarVista(raiz, leerVistaGuardada() ?? 'inicio');
  cargarInicioSiProcede(raiz);
}

// Inicio hace peticiones (árbol de archivos + Firestore): solo se carga en modo móvil, y una vez.
function cargarInicioSiProcede(raiz) {
  const mq = window.matchMedia('(max-width: 1100px)');
  let cargado = false;
  const intentar = () => {
    if (cargado || !mq.matches) return;
    cargado = true;
    import('./mobile-inicio.js?v=bff7fc72')
      .then((m) => m.iniciarInicio(raiz))
      .catch((err) => { cargado = false; console.error('No se pudo cargar la pantalla Inicio', err); });
  };
  intentar();
  mq.addEventListener('change', intentar);
}

const raiz = document.getElementById('mobile-app');
if (raiz) iniciar(raiz);