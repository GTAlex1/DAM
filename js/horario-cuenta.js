// Necesita que js/horario.js se cargue ANTES: usa `filterBar` (const global declarada allí).
// Por eso en horario.html va como <script type="module">, que se ejecuta después de los scripts normales.
/* ============================================================
   CUENTA (Firebase): las mismas cuentas de usuario/contraseña
   que en entornos-desarrollo.html (mismo proyecto Firebase, así
   que si ya iniciaste sesión allí, aquí ya te reconoce solo).
   Además: marcar asignaturas convalidadas/aprobadas.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOU5RrEN0LA_cvnOXexBUJAxC8Md2NvE8",
  authDomain: "damm-29df1.firebaseapp.com",
  projectId: "damm-29df1",
  storageBucket: "damm-29df1.firebasestorage.app",
  messagingSenderId: "44798070440",
  appId: "1:44798070440:web:e6a1ff169820c4a9ff3c9d",
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// Mismo esquema usuario -> correo interno que en entornos-desarrollo.html,
// para que sea literalmente la misma cuenta en las dos páginas.
const DOMINIO_USUARIO = 'alumnos.dam-notes.local';
function usuarioAEmail(bruto) {
  const u = bruto.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return u ? `${u}@${DOMINIO_USUARIO}` : null;
}
function nombreDeUsuario(user) {
  if (user.displayName) return user.displayName;
  return (user.email || '').split('@')[0];
}

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

/* ---------- Widget de cuenta ---------- */
const btn = document.getElementById('cuentaBtn');
const pop = document.getElementById('cuentaPop');
const vistaLogueado = document.getElementById('cuentaLogueado');
const vistaAnon = document.getElementById('cuentaAnon');
const mailEl = document.getElementById('cuentaMail');
const emailInput = document.getElementById('cuentaEmail');
const passInput = document.getElementById('cuentaPass');
const errorEl = document.getElementById('cuentaError');
const gradBtn = document.getElementById('gradBtn');
const avisoEl = document.getElementById('edicion-aviso');

btn.addEventListener('click', () => { pop.hidden = !pop.hidden; });
document.addEventListener('click', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true;
});

function limpiarError() { errorEl.hidden = true; }
function mostrarError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

function mapErrorAuth(codigo) {
  const m = {
    'auth/invalid-email': 'Ese nombre de usuario no es válido.',
    'auth/user-not-found': 'No existe ninguna cuenta con ese usuario.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese nombre de usuario ya está en uso. Prueba a iniciar sesión, o elige otro.',
    'auth/weak-password': 'La contraseña necesita al menos 6 caracteres.',
  };
  return m[codigo] || 'Algo ha fallado. Inténtalo de nuevo.';
}

document.getElementById('cuentaEntrar').addEventListener('click', async () => {
  limpiarError();
  const email = usuarioAEmail(emailInput.value);
  if (!email) { mostrarError('Escribe un nombre de usuario.'); return; }
  try { await signInWithEmailAndPassword(auth, email, passInput.value); }
  catch (e) { mostrarError(mapErrorAuth(e.code)); }
});

document.getElementById('cuentaCrear').addEventListener('click', async () => {
  limpiarError();
  const usuario = emailInput.value.trim();
  const email = usuarioAEmail(usuario);
  if (!email) { mostrarError('Escribe un nombre de usuario.'); return; }
  if (passInput.value.length < 6) { mostrarError('La contraseña necesita al menos 6 caracteres.'); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, passInput.value);
    await updateProfile(cred.user, { displayName: usuario });
  } catch (e) { mostrarError(mapErrorAuth(e.code)); }
});

document.getElementById('cuentaSalir').addEventListener('click', () => { signOut(auth); });

function pintaCuenta(user) {
  if (user) {
    btn.classList.add('logueado');
    vistaLogueado.hidden = false;
    vistaAnon.hidden = true;
    mailEl.textContent = nombreDeUsuario(user);
    gradBtn.hidden = false;
  } else {
    btn.classList.remove('logueado');
    vistaLogueado.hidden = true;
    vistaAnon.hidden = false;
    emailInput.value = ''; passInput.value = '';
    gradBtn.hidden = true;
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

onAuthStateChanged(auth, async (user) => {
  pintaCuenta(user);
  convalidadas = new Set(user ? await cargarConvalidadas(user.uid) : []);
  pintaConvalidadasChips();
  pintaConvalidadasHorario();
});
