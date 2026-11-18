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
- Se mantiene la misma API pública que `firebase-core.js`/`firebase-init.js` para tocar lo mínimo
  en el resto de archivos.

## Fases (marcar al terminar cada una)

- [ ] **A. Núcleo y cuentas.** `js/supabase-core.js` (inicio de sesión, registro, cierre de sesión,
      perfil, roles, favoritos, orden del árbol), `js/firebase-init.js` pasa a reexportar desde él,
      CSP de `index.html` y de las páginas de `DAM/1-DAM/`, `service-worker.js`.
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
