// calculadoras.js
// Lógica pura de las herramientas de «Extensiones» (sin DOM, para poder probarla en tests/).
// La interfaz está en extensiones.js.

// ---------- Calculadora normal ----------
// + − × ÷ con paréntesis, decimales (punto o coma), % (= dividir entre 100) y menos unario.
// Es un analizador propio: no usa eval().
export function evaluar(texto) {
  const t = String(texto).replace(/\s+/g, '').replace(/,/g, '.')
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const fallo = () => { throw new Error('Operación no válida'); };
  if (!t || t.length > 200) fallo();
  if (/[\d.,]\s+[\d.,]/.test(String(texto))) fallo(); // «2 3» no es 23
  let i = 0;

  const porcentaje = (v) => { while (t[i] === '%') { i++; v /= 100; } return v; };
  function primario() {
    if (t[i] === '(') {
      i++;
      const v = suma();
      if (t[i] !== ')') fallo();
      i++;
      return porcentaje(v);
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i));
    if (!m) fallo();
    i += m[0].length;
    return porcentaje(Number(m[0]));
  }
  function unario() {
    if (t[i] === '-') { i++; return -unario(); }
    if (t[i] === '+') { i++; return unario(); }
    return primario();
  }
  function producto() {
    let v = unario();
    while (t[i] === '*' || t[i] === '/') {
      const op = t[i++];
      const d = unario();
      v = op === '*' ? v * d : v / d;
    }
    return v;
  }
  function suma() {
    let v = producto();
    while (t[i] === '+' || t[i] === '-') {
      const op = t[i++];
      const d = producto();
      v = op === '+' ? v + d : v - d;
    }
    return v;
  }

  const r = suma();
  if (i < t.length) fallo();
  if (!Number.isFinite(r)) throw new Error('No se puede dividir entre cero');
  return Number(r.toPrecision(12)); // quita ruido como 0.1 + 0.2 = 0.30000000000000004
}

export const formatearNumero = (n) => String(n).replace('.', ',');

// ---------- Conversor de bases (misma lógica que js/unidad1.js) ----------
const VALIDO = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i };
const PREFIJO = { 2: '0b', 8: '0o', 16: '0x' };

export function agrupar(s, n) {
  while (s.length % n) s = '0' + s;
  const grupos = [];
  for (let i = 0; i < s.length; i += n) grupos.push(s.slice(i, i + n));
  return grupos.join(' ');
}

// null = vacío; { error } = no válido; si no, { dec, bin, oct, hex }.
export function convertirBase(texto, base) {
  const t = String(texto).trim();
  if (!t) return null;
  if (t.length > 40 || !VALIDO[base]?.test(t)) return { error: `Valor no válido para la base ${base}.` };
  const n = BigInt(base === 10 ? t : PREFIJO[base] + t);
  return { dec: n.toString(10), bin: agrupar(n.toString(2), 4), oct: n.toString(8), hex: n.toString(16).toUpperCase() };
}

// ---------- Capacidad del fabricante (SI) → la que muestra el sistema (CEI) (misma lógica que js/unidadesMedida.js) ----------
const EXP = { MB: 2, GB: 3, TB: 4 };
const BINARIA = { MB: 'MiB', GB: 'GiB', TB: 'TiB' };
export const fmt = (x, dec) => x.toLocaleString('es-ES', { maximumFractionDigits: dec });

export function capacidad(texto, unidad) {
  const t = String(texto).trim();
  if (!t) return null;
  const v = parseFloat(t.replace(',', '.'));
  if (!isFinite(v) || v <= 0 || !EXP[unidad]) return { error: 'Introduce un número mayor que 0.' };
  const bytes = v * 1000 ** EXP[unidad];
  const bin = bytes / 1024 ** EXP[unidad];
  return { bytes: `${fmt(bytes, 0)} B`, bin: `${fmt(bin, 2)} ${BINARIA[unidad]}`, dif: `−${fmt((1 - bin / v) * 100, 1)} %` };
}

// ---------- Binario ↔ ASCII ----------
// Los caracteres no ASCII (ñ, á, €…) se codifican en UTF-8, que ocupa 2 o más bytes.
export const textoABytes = (texto) => new TextEncoder().encode(texto);
export const bytesABinario = (bytes) => [...bytes].map((b) => b.toString(2).padStart(8, '0')).join(' ');

// → { error } | { bytes, texto, falta } (falta = bits que faltan para completar el último byte)
export function binarioATexto(entrada) {
  const limpio = String(entrada).replace(/\s+/g, '');
  if (/[^01]/.test(limpio)) return { error: 'Solo se admiten ceros, unos y espacios.' };
  const resto = limpio.length % 8;
  const bytes = new Uint8Array((limpio.length - resto) / 8);
  for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(limpio.slice(k * 8, k * 8 + 8), 2);
  return { bytes, texto: new TextDecoder().decode(bytes), falta: resto ? 8 - resto : 0 };
}

const NOMBRES = { 0: 'NUL', 9: 'TAB', 10: 'LF', 13: 'CR', 27: 'ESC', 32: '␠', 127: 'DEL' };
export function desglose(bytes) {
  return [...bytes].map((b) => ({
    car: NOMBRES[b] ?? (b > 32 && b < 127 ? String.fromCharCode(b) : b < 32 ? 'CTRL' : 'UTF-8'),
    dec: b,
    hex: b.toString(16).toUpperCase().padStart(2, '0'),
    bin: b.toString(2).padStart(8, '0'),
  }));
}
