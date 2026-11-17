'use strict';
/*
 * Pasa los archivos de Cloudinary a Supabase Storage y actualiza sus URLs en la base de datos.
 *   - Apuntes (tabla apuntes)           → bucket «apuntes»
 *   - Archivos adjuntos del chat         → bucket «chat-archivos»
 *
 * Para cada archivo: lo descarga de Cloudinary, lo sube a Supabase, comprueba que la URL nueva
 * responde y solo entonces cambia la URL en la base de datos. NO borra nada de Cloudinary.
 * Se puede repetir: solo toca las filas que aún apuntan a Cloudinary.
 *
 * Necesita dos archivos locales (están en el .gitignore):
 *   supabase-service.json → conexión a la base de datos (el mismo de importar-cuentas.js)
 *   supabase-api.json     → { "url": "https://<proyecto>.supabase.co", "secret_key": "sb_secret_..." }
 *
 * AVISO: Supabase sirve los archivos .html desde Storage como texto plano (no se ven como página).
 * Se suben igualmente; la web tendrá que mostrarlos de otra forma (ver README).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function leerJson(ruta, ayuda) {
  if (!fs.existsSync(ruta)) {
    console.error('Falta el archivo: ' + ruta);
    console.error(ayuda);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

const conexion = leerJson(path.join(__dirname, 'supabase-service.json'), 'Ver README.md.');
const api = leerJson(
  path.join(__dirname, 'supabase-api.json'),
  'Créalo con "url" (la URL del proyecto) y "secret_key" (la clave secreta del panel de Supabase).'
);
const BASE = String(api.url).replace(/\/+$/, '');

const TIPOS = {
  '.html': 'text/html', '.htm': 'text/html', '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain',
};

// Las rutas de Storage no admiten espacios ni acentos: se limpia el nombre.
function limpiarNombre(nombre) {
  const limpio = String(nombre || 'archivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return limpio || 'archivo';
}

function cabecerasClave() {
  const cab = { apikey: api.secret_key };
  if (String(api.secret_key).startsWith('eyJ')) cab.Authorization = 'Bearer ' + api.secret_key; // claves antiguas (JWT)
  return cab;
}

async function migrar(bucket, id, nombre, urlOrigen) {
  const descarga = await fetch(urlOrigen);
  if (!descarga.ok) throw new Error('Cloudinary respondió ' + descarga.status);
  const contenido = Buffer.from(await descarga.arrayBuffer());
  if (!contenido.length) throw new Error('El archivo descargado está vacío');

  const extension = path.extname(nombre).toLowerCase();
  const tipo = TIPOS[extension] || descarga.headers.get('content-type') || 'application/octet-stream';
  const ruta = 'migrado/' + id + '/' + limpiarNombre(nombre);

  const subida = await fetch(BASE + '/storage/v1/object/' + bucket + '/' + ruta, {
    method: 'POST',
    headers: { ...cabecerasClave(), 'Content-Type': tipo, 'x-upsert': 'true' },
    body: contenido,
  });
  if (!subida.ok) throw new Error('Supabase Storage respondió ' + subida.status + ': ' + (await subida.text()));

  const urlNueva = BASE + '/storage/v1/object/public/' + bucket + '/' + ruta;
  const prueba = await fetch(urlNueva);
  if (!prueba.ok) throw new Error('La URL nueva no responde (' + prueba.status + ')');
  const tamanoNuevo = (await prueba.arrayBuffer()).byteLength;
  if (tamanoNuevo !== contenido.length) throw new Error('El tamaño no coincide tras la subida');

  return { urlNueva, bytes: contenido.length };
}

(async () => {
  const client = new Client({
    host: conexion.host,
    user: conexion.user,
    password: conexion.password,
    database: conexion.database || 'postgres',
    port: conexion.port || 5432,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const apuntes = (await client.query(
    "select id, nombre, url from public.apuntes where url like 'https://res.cloudinary.com/%'"
  )).rows;
  const mensajes = (await client.query(
    "select id, archivo from public.chat_mensajes where archivo->>'url' like 'https://res.cloudinary.com/%'"
  )).rows;
  console.log('Por migrar: ' + apuntes.length + ' apuntes y ' + mensajes.length + ' archivos de chat.\n');

  let bien = 0, mal = 0;

  for (const a of apuntes) {
    try {
      const r = await migrar('apuntes', a.id, a.nombre, a.url);
      await client.query('update public.apuntes set url = $1 where id = $2', [r.urlNueva, a.id]);
      console.log('OK  apunte  ' + a.nombre + ' (' + r.bytes + ' bytes)');
      bien++;
    } catch (error) {
      console.error('ERROR apunte ' + a.nombre + ': ' + error.message);
      mal++;
    }
  }

  for (const m of mensajes) {
    const nombre = m.archivo.nombre || 'archivo';
    try {
      const r = await migrar('chat-archivos', m.id, nombre, m.archivo.url);
      await client.query(
        "update public.chat_mensajes set archivo = jsonb_set(archivo, '{url}', to_jsonb($1::text)) where id = $2",
        [r.urlNueva, m.id]
      );
      console.log('OK  chat    ' + nombre + ' (' + r.bytes + ' bytes)');
      bien++;
    } catch (error) {
      console.error('ERROR chat ' + nombre + ': ' + error.message);
      mal++;
    }
  }

  await client.end();
  console.log('\nMigrados: ' + bien + ' · Con error: ' + mal);
  if (mal) process.exit(1);
})().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
