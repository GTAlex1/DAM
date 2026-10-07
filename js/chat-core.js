// chat-core.js — datos comunes del chat (móvil y escritorio) y registro automático en el directorio.
// El directorio (directorio/{uid} = { nombre }) es lo que permite elegir compañeros al crear un grupo.
//  · Cada usuario se registra solo al iniciar sesión (no hace falta abrir el chat).
//  · El Admin Principal NO se registra (es invisible) y, al iniciar sesión, rellena el directorio con
//    todos los usuarios que aún no estén.
const SDK = 'https://www.gstatic.com/firebasejs/10.13.0/';

export const nombreDe = (u) => (u.displayName || '').trim() || (u.email || '').split('@')[0] || 'Alumno';

let fb = null;
export async function cargarFirebase() {
  if (fb) return fb;
  const [fi, fs, fa] = await Promise.all([
    import('./firebase-init.js?v=11feeaf4'), import(`${SDK}firebase-firestore.js`), import(`${SDK}firebase-auth.js`)]);
  fb = { fi, auth: fi.auth, fs, fa, db: fs.getFirestore(fi.auth.app), yo: null, admin: false };
  return fb;
}

async function sincronizar(f, u) {
  const { fs, db, fi } = f;
  let nombre = '';
  try { nombre = String(fi.nombreVisible?.(u) ?? ''); } catch { /* sin nombre visible */ }
  nombre = (nombre.trim() || nombreDe(u)).slice(0, 60);
  if (!f.admin) {
    const clave = `damDirectorio:${u.uid}:${nombre}`;
    try { if (localStorage.getItem(clave)) return; } catch { /* sin almacenamiento */ }
    await fs.setDoc(fs.doc(db, 'directorio', u.uid), { nombre });
    try { localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento */ }
    return;
  }
  const [usuarios, directorio] = await Promise.all([fs.getDocs(fs.collection(db, 'usuarios')), fs.getDocs(fs.collection(db, 'directorio'))]);
  const actual = new Map(directorio.docs.map((d) => [d.id, d.data().nombre]));
  const tareas = [];
  usuarios.forEach((d) => {
    const n = String(d.data().nombre ?? '').trim().slice(0, 60);
    if (d.id === u.uid || !n || actual.get(d.id) === n) return;
    tareas.push(fs.setDoc(fs.doc(db, 'directorio', d.id), { nombre: n }));
  });
  await Promise.allSettled(tareas);
}

(async () => {
  try {
    const f = await cargarFirebase();
    f.fa.onAuthStateChanged(f.auth, (u) => {
      f.yo = u;
      f.admin = !!u && f.fi.isAuthorized?.(u) === true;
      if (u) sincronizar(f, u).catch((err) => console.warn('Directorio del chat:', err));
    });
  } catch (err) { console.warn('Chat: Firebase no disponible', err); }
})();
