'use strict';
/*
 * Exporta TODOS los datos del proyecto Firebase «damm» (damm-29df1) a JSON:
 *   - salida/firestore.json       → todas las colecciones y subcolecciones de Firestore
 *   - salida/auth-usuarios.json   → las cuentas de Authentication (incluye correos y hashes de contraseña)
 *
 * El script SOLO LEE: no modifica ni borra nada en Firebase.
 * Uso: ver migracion/README.md
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ID_PROYECTO = 'damm-29df1';
const RUTA_CLAVE =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
const CARPETA_SALIDA = path.join(__dirname, 'salida');

if (!fs.existsSync(RUTA_CLAVE)) {
  console.error('No encuentro la clave de cuenta de servicio en: ' + RUTA_CLAVE);
  console.error('Descárgala desde la consola de Firebase (ver README.md) y guárdala con ese nombre.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(RUTA_CLAVE, 'utf8'))),
  projectId: ID_PROYECTO,
});
const db = admin.firestore();

// Convierte los tipos propios de Firestore a valores que JSON entiende.
//   Timestamp → texto ISO 8601 · GeoPoint → {lat, lng} · Referencia → su ruta · Bytes → base64
function convertir(valor) {
  if (valor === null || valor === undefined) return valor;
  if (valor instanceof admin.firestore.Timestamp) return valor.toDate().toISOString();
  if (valor instanceof admin.firestore.GeoPoint) return { lat: valor.latitude, lng: valor.longitude };
  if (valor instanceof admin.firestore.DocumentReference) return valor.path;
  if (Buffer.isBuffer(valor) || valor instanceof Uint8Array) return Buffer.from(valor).toString('base64');
  if (Array.isArray(valor)) return valor.map(convertir);
  if (typeof valor === 'object') {
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) salida[clave] = convertir(v);
    return salida;
  }
  return valor;
}

// Exporta una colección y, de forma recursiva, todas sus subcolecciones.
// Se usa listDocuments() para no perder subcolecciones colgando de documentos «fantasma»
// (por ejemplo progreso/{sello}, que no existe como documento pero sí tiene hijos).
async function exportarColeccion(coleccion) {
  const documentos = [];
  const referencias = await coleccion.listDocuments();
  for (const ref of referencias) {
    const doc = await ref.get();
    if (doc.exists) {
      documentos.push({ id: ref.id, ruta: ref.path, datos: convertir(doc.data()) });
    }
    for (const sub of await ref.listCollections()) {
      documentos.push(...(await exportarColeccion(sub)));
    }
  }
  return documentos;
}

async function exportarFirestore() {
  const resultado = {};
  for (const coleccion of await db.listCollections()) {
    process.stdout.write('Firestore · ' + coleccion.id + ' … ');
    resultado[coleccion.id] = await exportarColeccion(coleccion);
    console.log(resultado[coleccion.id].length + ' documentos');
  }
  return resultado;
}

async function exportarAuth() {
  const usuarios = [];
  let siguientePagina;
  do {
    const pagina = await admin.auth().listUsers(1000, siguientePagina);
    for (const u of pagina.users) usuarios.push(u.toJSON());
    siguientePagina = pagina.pageToken;
  } while (siguientePagina);
  return usuarios;
}

function guardar(nombre, contenido) {
  fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
  const destino = path.join(CARPETA_SALIDA, nombre);
  // Permisos 600: solo tu usuario puede leer el archivo.
  fs.writeFileSync(destino, JSON.stringify(contenido, null, 2), { encoding: 'utf8', mode: 0o600 });
  console.log('Guardado: ' + destino);
}

(async () => {
  const exportadoEn = new Date().toISOString();

  const firestore = await exportarFirestore();
  guardar('firestore.json', { proyecto: ID_PROYECTO, exportadoEn, colecciones: firestore });

  process.stdout.write('Authentication … ');
  const usuarios = await exportarAuth();
  console.log(usuarios.length + ' usuarios');
  guardar('auth-usuarios.json', { proyecto: ID_PROYECTO, exportadoEn, usuarios });

  console.log('\nListo. Estos archivos contienen datos personales: no los subas al repositorio.');
})().catch((error) => {
  console.error('Error durante la exportación:', error);
  process.exit(1);
});
