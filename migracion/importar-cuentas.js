'use strict';
/*
 * Migra las cuentas de Firebase Authentication a Supabase Auth CONSERVANDO las contraseñas.
 *
 * Supabase Auth sabe comprobar los hashes scrypt de Firebase si se guardan en el formato
 *   $fbscrypt$v=1,n=<mem_cost>,r=<rounds>,p=1,ss=<separador de sal>,sk=<clave de firma>$<sal>$<hash>
 * Este script construye ese formato a partir de salida/auth-usuarios.json y de los parámetros
 * de hash del proyecto, e inserta cada cuenta en auth.users y auth.identities.
 *
 * Todo ocurre en tu equipo: los hashes no salen de aquí salvo hacia tu propia base de datos.
 *
 * Necesita dos archivos locales (están en el .gitignore):
 *   supabase-service.json  → { "host", "user", "password", "database", "port" }
 *   parametros-hash.json   → { "base64_signer_key", "base64_salt_separator", "rounds", "mem_cost" }
 *
 * Es seguro repetirlo: las cuentas que ya existan (mismo correo) no se duplican.
 * Resultado: salida/mapa-uids.json (UID de Firebase → id nuevo de Supabase; no contiene secretos).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { Client } = require('pg');

function leerJson(ruta, ayuda) {
  if (!fs.existsSync(ruta)) {
    console.error('Falta el archivo: ' + ruta);
    console.error(ayuda);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

const conexion = leerJson(
  path.join(__dirname, 'supabase-service.json'),
  'Créalo con host, user, password, database y port (ver README.md).'
);
const params = leerJson(
  path.join(__dirname, 'parametros-hash.json'),
  'Créalo con base64_signer_key, base64_salt_separator, rounds y mem_cost (ver README.md).'
);
const { usuarios } = leerJson(
  path.join(__dirname, 'salida', 'auth-usuarios.json'),
  'Ejecuta antes node exportar-firebase.js.'
);

for (const campo of ['base64_signer_key', 'base64_salt_separator', 'rounds', 'mem_cost']) {
  if (params[campo] === undefined || params[campo] === '') {
    console.error('parametros-hash.json no tiene el campo: ' + campo);
    process.exit(1);
  }
}

// Firebase puede entregar sal y hash en base64 "seguro para URL" (con - y _). Supabase espera base64 estándar.
function aBase64Estandar(texto) {
  let t = String(texto).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return t;
}

function construirHash(u) {
  if (!u.passwordHash || !u.passwordSalt) return '';
  return (
    '$fbscrypt$v=1' +
    ',n=' + Number(params.mem_cost) +
    ',r=' + Number(params.rounds) +
    ',p=1' +
    ',ss=' + params.base64_salt_separator +
    ',sk=' + params.base64_signer_key +
    '$' + aBase64Estandar(u.passwordSalt) +
    '$' + aBase64Estandar(u.passwordHash)
  );
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

  const mapa = {};
  let creadas = 0, existentes = 0, sinContrasena = 0, sinCorreo = 0;

  try {
    await client.query('begin');
    for (const u of usuarios) {
      if (!u.email) {
        sinCorreo++;
        console.warn('Cuenta sin correo, se omite: ' + u.uid);
        continue;
      }
      const existente = await client.query(
        'select id from auth.users where lower(email) = lower($1)',
        [u.email]
      );
      if (existente.rows.length) {
        mapa[u.uid] = existente.rows[0].id;
        existentes++;
        continue;
      }

      const id = randomUUID();
      const cifrada = construirHash(u);
      if (!cifrada) sinContrasena++;
      const creada = u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime) : new Date();

      await client.query(
        `insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, is_super_admin, banned_until, created_at, updated_at
         ) values (
           '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(),
           '', '', '', '',
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, $4, $5, $5
         )`,
        [id, u.email, cifrada, u.disabled ? 'infinity' : null, creada]
      );

      await client.query(
        `insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
         values ($1, $2, $3::jsonb, 'email', $4, $4)`,
        [
          id,
          id,
          JSON.stringify({ sub: id, email: u.email, email_verified: true, phone_verified: false }),
          creada,
        ]
      );

      mapa[u.uid] = id;
      creadas++;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    console.error('Error: no se ha guardado nada.', error.message);
    await client.end();
    process.exit(1);
  }
  await client.end();

  fs.mkdirSync(path.join(__dirname, 'salida'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'salida', 'mapa-uids.json'),
    JSON.stringify(mapa, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );

  console.log('Cuentas creadas: ' + creadas);
  console.log('Ya existían: ' + existentes);
  if (sinContrasena) console.log('Sin contraseña (tendrán que crearla): ' + sinContrasena);
  if (sinCorreo) console.log('Omitidas por no tener correo: ' + sinCorreo);
  console.log('Guardado: salida/mapa-uids.json');
})().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
