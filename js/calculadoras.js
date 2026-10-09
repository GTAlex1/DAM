// calculadoras.js
// Lógica pura de las herramientas de «Extensiones» (sin DOM, para poder probarla en tests/).
// La interfaz está en extensiones.js.

// ---------- Calculadora (normal + científica) ----------
// + − × ÷ ^ ! % con paréntesis, decimales (punto o coma), constantes (pi, e, ans) y funciones.
// Es un analizador propio: no usa eval().
// Opciones: grados (true por defecto: sin/cos/tan y sus inversas trabajan en grados; false = radianes)
// y ans (último resultado, para la constante «ans»).
const FUNCIONES = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
};
const TRIGONOMETRICAS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];
const limpia = (x) => (Math.abs(x) < 1e-12 ? 0 : x); // sin(180°) = 1,2e-16 → 0

export function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('El factorial solo existe para enteros entre 0 y 170');
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

export function evaluar(texto, { grados = true, ans = 0 } = {}) {
  const t = String(texto).toLowerCase().replace(/\s+/g, '').replace(/,/g, '.')
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3');
  const fallo = (mensaje = 'Operación no válida') => { throw new Error(mensaje); };
  if (!t || t.length > 200) fallo();
  if (/[\d.,]\s+[\d.,]/.test(String(texto))) fallo(); // «2 3» no es 23
  let i = 0;
  const rad = (x) => (grados ? (x * Math.PI) / 180 : x);
  const aAngulo = (x) => (grados ? (x * 180) / Math.PI : x);

  function funcion(nombre, x) {
    if (Object.hasOwn(FUNCIONES, nombre)) return FUNCIONES[nombre](x);
    switch (nombre) {
      case 'sin': return limpia(Math.sin(rad(x)));
      case 'cos': return limpia(Math.cos(rad(x)));
      case 'tan':
        if (Math.abs(Math.cos(rad(x))) < 1e-12) fallo('La tangente no está definida en ese ángulo');
        return limpia(Math.tan(rad(x)));
      case 'asin': return aAngulo(Math.asin(x));
      case 'acos': return aAngulo(Math.acos(x));
      default: return aAngulo(Math.atan(x));
    }
  }
  function primario() {
    if (t[i] === '(') {
      i++;
      const v = suma();
      if (t[i] !== ')') fallo();
      i++;
      return v;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(t.slice(i)); // admite 1e-7 (así se escriben los resultados pequeños)
    if (num) { i += num[0].length; return Number(num[0]); }
    const nom = /^(?:log2|[a-z]+)/.exec(t.slice(i));
    if (!nom) fallo();
    const n = nom[0];
    i += n.length;
    if (n === 'pi') return Math.PI;
    if (n === 'e') return Math.E;
    if (n === 'ans') return ans;
    if (!Object.hasOwn(FUNCIONES, n) && !TRIGONOMETRICAS.includes(n)) fallo(`Función desconocida: ${n}`);
    if (t[i] !== '(') fallo(`Falta el paréntesis después de ${n}`);
    i++;
    const x = suma();
    if (t[i] !== ')') fallo();
    i++;
    return funcion(n, x);
  }
  function postfijo() { // 5!  50%
    let v = primario();
    while (t[i] === '%' || t[i] === '!') v = t[i++] === '%' ? v / 100 : factorial(v);
    return v;
  }
  function potencia() { // asociativa por la derecha: 2^3^2 = 2^9
    const base = postfijo();
    if (t[i] !== '^') return base;
    i++;
    return base ** unario();
  }
  function unario() { // -2^2 = -(2^2)
    if (t[i] === '-') { i++; return -unario(); }
    if (t[i] === '+') { i++; return unario(); }
    return potencia();
  }
  const empiezaFactor = () => t[i] === '(' || (t[i] >= 'a' && t[i] <= 'z');
  function producto() {
    let v = unario();
    for (;;) {
      if (t[i] === '*' || t[i] === '/') {
        const op = t[i++];
        const d = unario();
        v = op === '*' ? v * d : v / d;
      } else if (empiezaFactor()) v *= unario(); // multiplicación implícita: 2pi, 3(4+1), 2sin(30)
      else return v;
    }
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
  if (Number.isNaN(r)) fallo('Resultado fuera del dominio (p. ej. la raíz de un negativo)');
  if (!Number.isFinite(r)) fallo('División entre cero o número demasiado grande');
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