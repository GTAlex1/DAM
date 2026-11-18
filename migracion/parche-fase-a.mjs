// Aplica a index.html y service-worker.js los cambios de la fase A de la migración.
// Es idempotente: si ya están aplicados, no toca nada. Uso (desde la raíz del repo):
//     node migracion/parche-fase-a.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const PROYECTO = 'ywiprpasiafezfaajnfl';

function parchear(ruta, cambios) {
  let texto = readFileSync(ruta, 'utf8');
  let tocado = false;
  for (const { antes, despues, yaAplicado } of cambios) {
    if (texto.includes(yaAplicado)) continue;
    if (!texto.includes(antes)) {
      console.warn(`AVISO ${ruta}: no encuentro este texto, revísalo a mano:\n  ${antes}`);
      continue;
    }
    texto = texto.replace(antes, despues);
    tocado = true;
  }
  if (tocado) writeFileSync(ruta, texto, 'utf8');
  console.log(`${ruta}: ${tocado ? 'actualizado' : 'ya estaba al día'}`);
}

// Política de seguridad (CSP): permite el cliente de Supabase (jsDelivr) y las llamadas a la API.
parchear('index.html', [
  {
    antes: "script-src 'self' 'unsafe-inline' https://www.gstatic.com;",
    despues: "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://cdn.jsdelivr.net;",
    yaAplicado: 'https://cdn.jsdelivr.net',
  },
  {
    antes: "img-src 'self' data: blob: https://res.cloudinary.com;",
    despues: `img-src 'self' data: blob: https://res.cloudinary.com https://${PROYECTO}.supabase.co;`,
    yaAplicado: `img-src 'self' data: blob: https://res.cloudinary.com https://${PROYECTO}.supabase.co`,
  },
  {
    antes: "connect-src 'self' https://api.github.com",
    despues: `connect-src 'self' https://${PROYECTO}.supabase.co wss://${PROYECTO}.supabase.co https://api.github.com`,
    yaAplicado: `connect-src 'self' https://${PROYECTO}.supabase.co`,
  },
]);

// Service worker: el cliente de Supabase lleva versión fija en la URL, así que va «caché primero».
parchear('service-worker.js', [
  {
    antes: "  const esSdk = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/');",
    despues:
      "  const esSdk =\n    (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||\n    (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@supabase/')); // versión fija en la URL",
    yaAplicado: "url.pathname.startsWith('/npm/@supabase/')",
  },
]);
