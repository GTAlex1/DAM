// ============================================================================
// Firebase + App Check + AI Logic (Gemini Developer API) — proyecto "damm"
// npm install firebase
// ============================================================================

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

// -----------------------------------------------------------------------
// 1. Configuración de tu proyecto (la que ya tenías)
// -----------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCOU5RrEN0LA_cvnOXexBUJAxC8Md2NvE8",
  authDomain: "damm-29df1.firebaseapp.com",
  projectId: "damm-29df1",
  storageBucket: "damm-29df1.firebasestorage.app",
  messagingSenderId: "44798070440",
  appId: "1:44798070440:web:fc9250dbfae5e0ffff3c9d"
};

const app = initializeApp(firebaseConfig);

// -----------------------------------------------------------------------
// 2. App Check con tu clave de sitio de reCAPTCHA v3
//    OJO: si estás probando en localhost, App Check bloqueará las llamadas
//    a menos que actives el modo debug (líneas siguientes). En producción
//    (tu dominio real), borra o comenta esas dos líneas de debug.
// -----------------------------------------------------------------------

// --- SOLO PARA DESARROLLO LOCAL (localhost) ---
// Descomenta la siguiente línea mientras pruebas en tu propio ordenador.
// Al recargar la página, la consola del navegador imprimirá un token de
// depuración: pégalo en Firebase Console > App Check > tu app > "Gestionar
// tokens de depuración" para autorizar tu máquina.
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6Ld0MtUtAAAAAKnGrsWmBdjg8Y0pYAzIAfOHExtf"),
  isTokenAutoRefreshEnabled: true
});

// -----------------------------------------------------------------------
// 3. AI Logic (Gemini Developer API — capa gratuita)
// -----------------------------------------------------------------------
const ai = getAI(app, { backend: new GoogleAIBackend() });

// Revisa en la consola de Firebase (AI Logic > Modelos) el nombre exacto
// del modelo disponible en tu proyecto; "gemini-2.5-flash" es el habitual
// para empezar por rapidez y por estar dentro del límite gratuito.
const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

// -----------------------------------------------------------------------
// 4. Prueba mínima: comprobar que todo responde
//    Llama a probarIA() desde la consola del navegador o desde un botón.
// -----------------------------------------------------------------------
export async function probarIA() {
  const resultado = await model.generateContent("Responde solo con: Hola, todo funciona.");
  console.log(resultado.response.text());
  return resultado.response.text();
}

// -----------------------------------------------------------------------
// 5. Punto de partida para el repaso de Entidad/Relación.
//    De momento devuelve el texto tal cual del modelo; cuando funcione,
//    lo convertimos en un JSON estructurado (entidades/relaciones) para
//    conectarlo con EntidadRelacion.js.
// -----------------------------------------------------------------------
export async function resolverEnunciadoER(enunciado) {
  const prompt =
    "Eres profesor de Bases de Datos. Te doy un enunciado para modelar en " +
    "Entidad/Relación. Identifica las entidades con sus atributos (marca la " +
    "clave primaria) y las relaciones con su cardinalidad (1:1, 1:N o N:M), " +
    "explicando en una frase por qué. Responde en español, de forma breve " +
    "y estructurada.\n\nEnunciado:\n" + enunciado;

  const resultado = await model.generateContent(prompt);
  return resultado.response.text();
}

export { app, ai, model };
