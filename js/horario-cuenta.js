/* global filterBar -- const global declarada en js/horario.js, que debe cargarse antes */
// Necesita que js/horario.js se cargue ANTES: usa `filterBar` (const global declarada allí).
// Por eso en horario.html va como <script type="module">, que se ejecuta después de los scripts normales.
/* ============================================================
   CONVALIDADAS: marcar asignaturas convalidadas/aprobadas.
   El acceso (header, modal, login y registro) ya NO vive aquí: lo gestiona
   firebase-init.js para todas las páginas (mismas cuentas que en el resto).
   Este módulo solo escucha la sesión: con sesión muestra el botón 🎓 y carga
   /guarda las convalidadas del usuario (tabla convalidaciones de Supabase, con RLS por usuario).
   ============================================================ */
// Misma URL (con ?v) que la del <script> de horario.html: así es un único módulo.
import { auth, watchAuth, supabase } from "./firebase-init.js?v=165a238c";

// Tabla `convalidaciones` de Supabase: una fila por usuario { user_id, materias[], ts }.
async function cargarConvalidadas(uid) {
  try {
    const { data, error } = await supabase.from('convalidaciones').select('materias').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data?.materias || [];
  } catch (e) { console.warn('No se pudo leer convalidaciones:', e); return []; }
}
async function guardarConvalidadas(uid, lista) {
  try {
    const { error } = await supabase.from('convalidaciones').upsert({ user_id: uid, materias: lista, ts: Date.now() });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('No se pudo guardar convalidaciones:', e); return false; }
}

let convalidadas = new Set();
window.__modoEdicion = false;

const gradBtn = document.getElementById('gradBtn');
const avisoEl = document.getElementById('edicion-aviso');

/* ---------- Sesión: el botón 🎓 solo existe con sesión iniciada ---------- */
function pintaSesion(user) {
  gradBtn.hidden = !user;
  if (!user) {
    window.__modoEdicion = false;
    pintaModoEdicion();
  }
}

/* ---------- Modo edición de convalidadas ---------- */
gradBtn.addEventListener('click', () => {
  window.__modoEdicion = !window.__modoEdicion;
  pintaModoEdicion();
});

function pintaModoEdicion() {
  gradBtn.classList.toggle('activo', window.__modoEdicion);
  filterBar.classList.toggle('modo-edicion', window.__modoEdicion);
  avisoEl.hidden = !window.__modoEdicion;
}

function pintaConvalidadasChips() {
  filterBar.querySelectorAll('.chip[data-filter]').forEach(chip => {
    const code = chip.dataset.filter;
    chip.classList.toggle('convalidada', code !== '__all__' && convalidadas.has(code));
  });
}

function pintaConvalidadasHorario() {
  document.querySelectorAll('.entry[data-code]').forEach(el => {
    const code = el.dataset.code;
    el.classList.toggle('convalidada', !!code && convalidadas.has(code));
  });
}

window.__toggleConvalidada = function (code) {
  const user = auth.currentUser;
  if (!user) return;
  if (convalidadas.has(code)) convalidadas.delete(code); else convalidadas.add(code);
  pintaConvalidadasChips();
  pintaConvalidadasHorario();
  guardarConvalidadas(user.uid, [...convalidadas]);
};

watchAuth(async (user) => {
  pintaSesion(user);
  convalidadas = new Set(user ? await cargarConvalidadas(user.uid) : []);
  pintaConvalidadasChips();
  pintaConvalidadasHorario();
});
