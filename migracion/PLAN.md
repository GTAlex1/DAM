# Plan de migración de la web: Firebase → Supabase

Estado de partida (hecho): proyecto Supabase `damm` creado, esquema con políticas de seguridad,
cuentas y datos importados, buckets `apuntes` y `chat-archivos`. La web **sigue usando Firebase**
hasta completar las fases; todo el trabajo va en la rama `migracion-supabase`.

Decisiones:
- Los archivos viejos de Cloudinary (1 apunte y 3 fotos del chat) se quedan donde están. Las URLs de
  Cloudinary siguen permitidas en la base de datos. Los archivos nuevos van a Supabase Storage.
- Supabase sirve los `.html` de Storage como texto plano: los apuntes HTML se muestran descargando
  el texto y metiéndolo en un `iframe` con `sandbox` y `srcdoc`.
- El cliente se carga como módulo ES desde jsDelivr con versión fija (supabase-js 2.117.3).
- `js/firebase-core.js` conserva su nombre y su API pública, pero ahora es el núcleo de Supabase
  (se renombrará en la fase E). Exporta `db = null` como pieza TEMPORAL hasta migrar los módulos
  que aún usan Firestore.
- Para probar desde la rama hay que desactivar «Confirm email» en Supabase (las cuentas «por
  usuario» tienen un correo ficticio que no recibe mensajes). YA DESACTIVADO.
- Los `?v=` de los imports los recalcula la Action al fusionar; en la rama pueden quedar
  desactualizados (no afecta a las pruebas). El service worker está en la versión `v3`.

## Fases (marcar al terminar cada una)

- [~] **A. Núcleo y cuentas.** HECHO y subido: `js/firebase-core.js` (inicio de sesión, registro,
      cierre de sesión, perfil, roles, favoritos, orden del árbol), CSP de `index.html` y
      `service-worker.js` (el parche `migracion/parche-fase-a.mjs` ya está aplicado; se puede
      borrar). PENDIENTE: que el usuario pruebe inicio de sesión, registro de una cuenta nueva y
      «Mi cuenta». Plan B si el registro rechaza el dominio ficticio `.local`: crear las cuentas
      nuevas con una función de servidor.
- [ ] **B. Calendario y horario.** `js/calendario.js`, `js/horario-cuenta.js`,
      `DAM/1-DAM/Calendario.html`, `DAM/1-DAM/Horario.html`.
- [ ] **C. Chat.** `js/chat-core.js`, `js/chat-ui.js` con Realtime.
- [ ] **D. Apuntes y subida de archivos.** `js/apuntes.js`, subida a Storage, visor de HTML con
      `srcdoc`, progreso de las apps de apuntes.
- [ ] **E. Móvil, pruebas y cierre.** `js/mobile-*.js`, `js/app.js`, `npm test` y `npm run lint`,
      README, retirar Firebase y fusionar la rama.

## Seguridad al terminar

Borrar `migracion/serviceAccountKey.json` y revocar la clave en Google Cloud; revocar la clave
`sb_secret_` y cambiar la contraseña de la base de datos de Supabase si se usó; no subir nunca
`migracion/salida/`.
