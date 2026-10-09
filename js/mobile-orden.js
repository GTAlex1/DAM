// mobile-orden.js — aplica a las asignaturas el mismo orden que la web de escritorio (guardado en Firebase).
const claveDe = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export async function ordenar(lista, root) {
  let guardado = {};
  try {
    const { loadOrder } = await import('./firebase-init.js?v=aaf9a4ae');
    guardado = (await loadOrder()) ?? {};
  } catch { /* sin orden guardado: se mantiene el orden natural */ }

  const claves = [];
  const vistas = new Set();
  for (const curso of root.children ?? []) {
    if (curso.type !== 'folder') continue;
    const nombres = (curso.children ?? []).filter((c) => c.type === 'folder').map((c) => c.name);
    const previo = guardado[`root/${curso.name}`]; // misma clave que usa app.js
    const orden = Array.isArray(previo) ? previo.filter((n) => typeof n === 'string' && nombres.includes(n)) : [];
    for (const n of [...orden, ...nombres]) {
      const k = claveDe(n);
      if (!vistas.has(k)) { vistas.add(k); claves.push(k); }
    }
  }
  const pos = (a) => { const i = claves.indexOf(a.clave); return i < 0 ? Infinity : i; };
  return [...lista].sort((a, b) => pos(a) - pos(b));
}
