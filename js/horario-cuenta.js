// Necesita que js/horario.js se cargue ANTES: usa `filterBar` (const global declarada allí).
// Por eso en horario.html va como <script type="module">, que se ejecuta después de los scripts normales.
/* ============================================================
   CONVALIDADAS: marcar asignaturas convalidadas/aprobadas.
   El acceso (header, modal, login y registro) ya NO vive aquí: lo gestiona
   firebase-init.js para todas las páginas (mismas cuentas que en el resto).
   Este módulo solo escucha la sesión: con sesión muestra el botón 🎓 y carga
   /guarda las convalidadas del usuario (rules: convalidaciones/{uid}).
   ============================================================ */
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
// Misma URL (con ?v) que la del <script> de horario.html: así es un único módulo.
import { auth, watchAuth } from "./firebase-init.js?v=3";

// Misma app de Firebase que usa firebase-init.js (no se inicializa otra).
const db = getFirestore(auth.app);

function convalidacionesRef(uid) { return doc(db, 'convalidaciones', uid); }
async function cargarConvalidadas(uid) {
  try {
    const snap = await getDoc(convalidacionesRef(uid));
    return snap.exists() ? (snap.data().materias || []) : [];
  } catch (e) { console.warn('No se pudo leer convalidaciones:', e); return []; }
}
async function guardarConvalidadas(uid, lista) {
  try { await setDoc(convalidacionesRef(uid), { materias: lista, ts: Date.now() }); return true; }
  catch (e) { console.warn('No se pudo guardar convalidaciones:', e); return false; }
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
