// firebase-init.js
// Conexión con Firebase: autenticación (para saber quién puede editar el
// orden de carpetas/archivos) y Firestore (donde se guarda ese orden).
//
// IMPORTANTE — antes de publicar:
// 1. Sustituye AUTHORIZED_UID más abajo por el UID real de tu usuario
//    (Firebase Console → Authentication → Users → columna "User UID").
// 2. Crea ese usuario en Firebase Console → Authentication → Users → Add user
//    (con email + contraseña) si todavía no existe.
// 3. Activa el proveedor "Email/Password" en Authentication → Sign-in method.
// 4. Crea una base Firestore (modo producción) y sube las reglas de
//    firestore.rules que te he preparado junto a este archivo.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOU5RrEN0LA_cvnOXexBUJAxC8Md2NvE8",
  authDomain: "damm-29df1.firebaseapp.com",
  projectId: "damm-29df1",
  storageBucket: "damm-29df1.firebasestorage.app",
  messagingSenderId: "44798070440",
  appId: "1:44798070440:web:e6a1ff169820c4a9ff3c9d",
};

// 👇 CAMBIA ESTO por tu UID real (ver instrucciones arriba).
export const AUTHORIZED_UID = "KxbZfGljpRdTIQlnOPDqjUs61v73";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

const ORDER_DOC = doc(db, "site", "order");

export function isAuthorized(user) {
  return !!user && user.uid === AUTHORIZED_UID;
}

export function watchAuth(callback) {
  onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}

/** Devuelve el mapa { pathKey: [nombres en orden] } guardado, o {} si no hay nada. */
export async function loadOrder() {
  try {
    const snap = await getDoc(ORDER_DOC);
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.warn("No se pudo leer el orden guardado:", e);
    return {};
  }
}

/** Fusiona (merge) el nuevo orden de una carpeta concreta con el documento existente. */
export async function saveOrderForPath(pathKey, orderedNames) {
  await setDoc(ORDER_DOC, { [pathKey]: orderedNames }, { merge: true });
}
