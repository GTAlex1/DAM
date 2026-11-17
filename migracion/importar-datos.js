'use strict';
/*
 * Importa los datos de Firestore (salida/firestore.json) a las tablas de Supabase.
 * Debe ejecutarse DESPUÉS de importar-cuentas.js, que crea salida/mapa-uids.json
 * (UID de Firebase → id de Supabase).
 *
 * Usa supabase-service.json (el mismo de importar-cuentas.js). Todo ocurre en tu equipo.
 * Es todo o nada: si algo falla, no se guarda nada. Si ya hay perfiles importados,
 * se niega a repetirse para no duplicar mensajes ni eventos.
 *
 * Lo que NO importa a propósito:
 *   - Entradas que apuntan a cuentas que ya no existen (por ejemplo, un registro huérfano del directorio).
 *   - Documentos de progreso vacíos.
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

const conexion = leerJson(path.join(__dirname, 'supabase-service.json'), 'Ver README.md.');
const firestore = leerJson(path.join(__dirname, 'salida', 'firestore.json'), 'Ejecuta antes node exportar-firebase.js.');
const mapa = leerJson(path.join(__dirname, 'salida', 'mapa-uids.json'), 'Ejecuta antes node importar-cuentas.js.');
const col = firestore.colecciones;

const aviso = [];
const resumen = {};
const nuevoId = (uidFirebase) => (uidFirebase && mapa[uidFirebase]) || null;
const jsonb = (v) => JSON.stringify(v === undefined ? null : v);
const nulo = (v) => (v === undefined ? null : v);

async function insertar(client, tabla, columnas, filas, tipos = {}) {
  for (const fila of filas) {
    const marcadores = columnas.map((c, i) => '$' + (i + 1) + (tipos[c] ? '::' + tipos[c] : ''));
    await client.query(
      'insert into public.' + tabla + ' (' + columnas.join(', ') + ') values (' + marcadores.join(', ') + ')',
      columnas.map((c) => fila[c])
    );
  }
  resumen[tabla] = (resumen[tabla] || 0) + filas.length;
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

  try {
    await client.query('begin');

    const previo = await client.query('select count(*) as n from public.perfiles');
    if (Number(previo.rows[0].n) > 0) {
      throw new Error('Ya hay perfiles importados. Para no duplicar datos, el script no se repite.');
    }

    // ---------- perfiles ----------
    const perfiles = [];
    for (const d of col.usuarios || []) {
      const id = nuevoId(d.id);
      if (!id) { aviso.push('Perfil sin cuenta, omitido: ' + d.datos.nombre); continue; }
      perfiles.push({
        id, firebase_uid: d.id, nombre: d.datos.nombre, email: d.datos.email,
        creado: d.datos.creado, actualizado: d.datos.actualizado,
      });
    }
    await insertar(client, 'perfiles', ['id', 'firebase_uid', 'nombre', 'email', 'creado', 'actualizado'], perfiles);

    // ---------- roles ----------
    // Propietario = quien concedió los roles de Admin inferior.
    const rolesDocs = col.roles || [];
    const uidPropietario = rolesDocs.length ? rolesDocs[0].datos.asignado_por : null;
    const roles = [];
    if (uidPropietario && nuevoId(uidPropietario)) {
      roles.push({ user_id: nuevoId(uidPropietario), rol: 'propietario', asignado_por: null, actualizado: new Date().toISOString() });
      const p = (col.usuarios || []).find((u) => u.id === uidPropietario);
      console.log('Propietario: ' + (p ? p.datos.nombre : '(sin perfil)'));
    } else {
      aviso.push('No he podido identificar al propietario: asigna su rol a mano.');
    }
    for (const d of rolesDocs) {
      if (d.id === uidPropietario) continue;
      const id = nuevoId(d.id);
      if (!id) { aviso.push('Rol sin cuenta, omitido.'); continue; }
      roles.push({ user_id: id, rol: 'admin_inferior', asignado_por: nuevoId(d.datos.asignado_por), actualizado: d.datos.actualizado });
    }
    await insertar(client, 'roles', ['user_id', 'rol', 'asignado_por', 'actualizado'], roles);

    // ---------- directorio ----------
    const directorio = [];
    for (const d of col.directorio || []) {
      const id = nuevoId(d.id);
      if (!id) { aviso.push('Directorio: registro sin cuenta, omitido (' + d.datos.nombre + ').'); continue; }
      directorio.push({ user_id: id, nombre: d.datos.nombre });
    }
    await insertar(client, 'directorio', ['user_id', 'nombre'], directorio);

    // ---------- apuntes ----------
    await insertar(client, 'apuntes',
      ['firebase_id', 'nombre', 'url', 'tipo', 'asignatura', 'orden', 'creado_por', 'fecha'],
      (col.apuntes || []).map((d) => ({
        firebase_id: d.id, nombre: d.datos.nombre, url: d.datos.url, tipo: d.datos.tipo,
        asignatura: d.datos.asignatura, orden: d.datos.orden, creado_por: nuevoId(d.datos.creado_por),
        fecha: d.datos.fecha,
      })));

    // ---------- calendario ----------
    const idEvento = {};
    const eventos = [];
    for (const d of col.calendario_eventos || []) {
      const id = randomUUID();
      idEvento[d.id] = id;
      const e = d.datos;
      const dueno = nuevoId(e.usuario_uid);
      if (!dueno) { aviso.push('Evento sin dueño, omitido: ' + e.titulo); delete idEvento[d.id]; continue; }
      eventos.push({
        id, firebase_id: d.id, tipo: e.tipo, fecha: e.fecha, asignatura: e.asignatura, titulo: e.titulo,
        ambito: e.ambito, usuario_id: dueno, hora: nulo(e.hora), lugar: nulo(e.lugar),
        temario: nulo(e.temario), descripcion: nulo(e.descripcion), creado: e.creado,
      });
    }
    await insertar(client, 'calendario_eventos',
      ['id', 'firebase_id', 'tipo', 'fecha', 'asignatura', 'titulo', 'ambito', 'usuario_id', 'hora', 'lugar', 'temario', 'descripcion', 'creado'],
      eventos);

    // Las tareas hechas guardan ids de evento de Firestore: se traducen a los nuevos.
    const hechas = [];
    for (const d of col.calendario_hechas || []) {
      const id = nuevoId(d.id);
      if (!id) continue;
      const nuevas = {};
      for (const [viejo, valor] of Object.entries(d.datos.hechas || {})) {
        if (idEvento[viejo]) nuevas[idEvento[viejo]] = valor;
      }
      hechas.push({ user_id: id, hechas: jsonb(nuevas), actualizado: d.datos.actualizado });
    }
    await insertar(client, 'calendario_hechas', ['user_id', 'hechas', 'actualizado'], hechas, { hechas: 'jsonb' });

    // ---------- progreso: progreso/<sello>/usuarios/<uid> ----------
    const progreso = [];
    for (const d of col.progreso || []) {
      const partes = d.ruta.split('/');
      if (partes.length !== 4 || d.datos.v === undefined) continue; // documentos vacíos o ajenos
      const id = nuevoId(partes[3]);
      if (!id) { aviso.push('Progreso sin cuenta, omitido.'); continue; }
      progreso.push({
        sello: partes[1], user_id: id, v: d.datos.v, alumno: d.datos.alumno || '',
        ej: jsonb(d.datos.ej || {}), q: jsonb(d.datos.q || {}), ts: d.datos.ts,
      });
    }
    await insertar(client, 'progreso', ['sello', 'user_id', 'v', 'alumno', 'ej', 'q', 'ts'], progreso, { ej: 'jsonb', q: 'jsonb' });

    // ---------- convalidaciones y favoritos ----------
    await insertar(client, 'convalidaciones', ['user_id', 'materias', 'ts'],
      (col.convalidaciones || []).filter((d) => nuevoId(d.id))
        .map((d) => ({ user_id: nuevoId(d.id), materias: d.datos.materias || [], ts: d.datos.ts })),
      { materias: 'text[]' });
    await insertar(client, 'favoritos', ['user_id', 'rutas', 'ts'],
      (col.favoritos || []).filter((d) => nuevoId(d.id))
        .map((d) => ({ user_id: nuevoId(d.id), rutas: d.datos.rutas || [], ts: d.datos.ts })),
      { rutas: 'text[]' });

    // ---------- chats: chats/<id> y chats/<id>/mensajes/<id> ----------
    const chats = [];
    const mensajes = [];
    for (const d of col.chats || []) {
      const partes = d.ruta.split('/');
      if (partes.length === 2 && d.id !== 'general') {
        chats.push({
          id: d.id, nombre: d.datos.nombre,
          miembros: (d.datos.miembros || []).map(nuevoId).filter(Boolean),
          creador: nuevoId(d.datos.creador), creado: d.datos.creado,
        });
      } else if (partes.length === 4) {
        const autor = nuevoId(d.datos.uid);
        mensajes.push({
          chat_id: partes[1], user_id: autor, autor: d.datos.autor, texto: d.datos.texto || '',
          archivo: d.datos.archivo ? jsonb(d.datos.archivo) : null, creado: d.datos.creado,
        });
      }
    }
    await insertar(client, 'chats', ['id', 'nombre', 'miembros', 'creador', 'creado'], chats, { miembros: 'uuid[]' });
    mensajes.sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
    await insertar(client, 'chat_mensajes', ['chat_id', 'user_id', 'autor', 'texto', 'archivo', 'creado'], mensajes, { archivo: 'jsonb' });

    // ---------- orden del árbol: site/order ----------
    const orden = (col.site || []).find((d) => d.id === 'order');
    if (orden) {
      await client.query("insert into public.sitio_orden (id, datos) values ('order', $1::jsonb)", [jsonb(orden.datos)]);
      resumen.sitio_orden = 1;
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    console.error('Error: no se ha guardado nada.\n' + error.message);
    await client.end();
    process.exit(1);
  }
  await client.end();

  console.log('\nImportado:');
  for (const [tabla, n] of Object.entries(resumen)) console.log('  ' + tabla + ': ' + n);
  if (aviso.length) { console.log('\nAvisos:'); aviso.forEach((a) => console.log('  - ' + a)); }
})().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
