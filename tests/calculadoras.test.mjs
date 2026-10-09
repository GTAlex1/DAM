import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluar, factorial, convertirBase, capacidad, agrupar, textoABytes, bytesABinario, binarioATexto, desglose,
} from '../js/calculadoras.js';

test('evaluar: precedencia, paréntesis y decimales', () => {
  assert.equal(evaluar('2+3*4'), 14);
  assert.equal(evaluar('(2+3)*4'), 20);
  assert.equal(evaluar('10 ÷ 4'), 2.5);
  assert.equal(evaluar('6 × 7'), 42);
  assert.equal(evaluar('0,1+0,2'), 0.3); // coma decimal y sin ruido de coma flotante
  assert.equal(evaluar('-3+5'), 2);
  assert.equal(evaluar('2--3'), 5);
  assert.equal(evaluar('50%'), 0.5);
});

test('evaluar: rechaza lo que no es una operación (y no ejecuta código)', () => {
  for (const mala of ['', '2*(3', '2+', 'abc', '2 3', '1/0', 'alert(1)', '2**3', '7'.repeat(201)]) {
    assert.throws(() => evaluar(mala), mala);
  }
});

test('convertirBase: decimal, binario, hexadecimal', () => {
  const r = convertirBase('107', 10);
  assert.deepEqual(r, { dec: '107', bin: '0110 1011', oct: '153', hex: '6B' });
  assert.equal(convertirBase('ff', 16).dec, '255');
  assert.equal(convertirBase('1010', 2).dec, '10');
  assert.equal(convertirBase('  ', 10), null);
});

test('convertirBase: valores no válidos', () => {
  assert.match(convertirBase('12', 2).error, /base 2/);
  assert.match(convertirBase('xyz', 16).error, /base 16/);
  assert.ok(convertirBase('1'.repeat(41), 10).error);
});

test('agrupar: de 4 en 4 rellenando por la izquierda', () => {
  assert.equal(agrupar('101', 4), '0101');
  assert.equal(agrupar('1101011', 4), '0110 1011');
});

test('capacidad: 320 GB anunciados', () => {
  const r = capacidad('320', 'GB');
  assert.equal(r.bytes, '320.000.000.000 B');
  assert.equal(r.bin, '298,02 GiB');
  assert.equal(r.dif, '−6,9 %');
  assert.equal(capacidad('', 'GB'), null);
  assert.ok(capacidad('0', 'GB').error);
  assert.ok(capacidad('abc', 'TB').error);
  assert.equal(capacidad('1,5', 'TB').bin.endsWith('TiB'), true);
});

test('binario ↔ texto: ida y vuelta', () => {
  assert.equal(bytesABinario(textoABytes('Hi')), '01001000 01101001');
  const r = binarioATexto('01001000 01101001');
  assert.equal(r.texto, 'Hi');
  assert.equal(r.falta, 0);
  assert.equal(binarioATexto(bytesABinario(textoABytes('¡Qué tal, ñu!'))).texto, '¡Qué tal, ñu!');
  assert.equal(textoABytes('ñ').length, 2); // UTF-8: los no ASCII ocupan más de un byte
});

test('binario → texto: bits incompletos y errores', () => {
  assert.equal(binarioATexto('01001000 011').falta, 5);
  assert.equal(binarioATexto('01001000 011').texto, 'H');
  assert.equal(binarioATexto('').texto, '');
  assert.ok(binarioATexto('0120').error);
});

test('desglose: carácter, decimal, hexadecimal y binario', () => {
  assert.deepEqual(desglose(textoABytes('A ')), [
    { car: 'A', dec: 65, hex: '41', bin: '01000001' },
    { car: '␠', dec: 32, hex: '20', bin: '00100000' },
  ]);
  assert.equal(desglose([10])[0].car, 'LF');
  assert.equal(desglose([200])[0].car, 'UTF-8');
});

test('evaluar: potencias, factorial, porcentaje y constantes', () => {
  assert.equal(evaluar('5^2'), 25);
  assert.equal(evaluar('5²'), 25);
  assert.equal(evaluar('2^3^2'), 512); // asociativa por la derecha
  assert.equal(evaluar('-2^2'), -4);
  assert.equal(evaluar('2^-2'), 0.25);
  assert.equal(evaluar('5!'), 120);
  assert.equal(evaluar('0!'), 1);
  assert.equal(evaluar('3!+2'), 8);
  assert.equal(evaluar('pi'), 3.14159265359);
  assert.equal(evaluar('2π'), 6.28318530718);
  assert.equal(evaluar('e'), 2.71828182846);
  assert.equal(evaluar('ans*2', { ans: 21 }), 42);
  assert.equal(evaluar('1e-7'), 1e-7); // así se muestran los resultados muy pequeños
  assert.equal(evaluar('2e3'), 2000);
  assert.equal(evaluar('2e'), 5.43656365692); // 2·e
  assert.equal(factorial(170) > 1e306, true);
});

test('evaluar: funciones (grados por defecto)', () => {
  const casos = {
    'sin(30)': 0.5, 'cos(60)': 0.5, 'tan(45)': 1, 'sin(180)': 0, 'cos(90)': 0,
    'asin(0.5)': 30, 'acos(0.5)': 60, 'atan(1)': 45,
    'sqrt(16)': 4, '√(81)': 9, 'cbrt(27)': 3, 'ln(e)': 1, 'log(1000)': 3, 'log2(8)': 3,
    'exp(0)': 1, 'abs(-5)': 5, 'floor(2.7)': 2, 'ceil(2.1)': 3, 'round(2.5)': 3, 'sinh(0)': 0,
    '2sin(30)': 1, '3(4+1)': 15, 'sqrt(9)sqrt(4)': 6, 'SIN(30)': 0.5, 'sqrt(2)^2': 2,
  };
  for (const [expr, esperado] of Object.entries(casos)) assert.equal(evaluar(expr), esperado, expr);
});

test('evaluar: radianes', () => {
  const rad = { grados: false };
  assert.equal(evaluar('sin(pi/2)', rad), 1);
  assert.equal(evaluar('cos(pi)', rad), -1);
  assert.equal(evaluar('sin(pi)', rad), 0);
  assert.equal(evaluar('atan(1)', rad), 0.785398163397);
});

test('evaluar: errores de dominio y sintaxis', () => {
  for (const mala of ['sqrt(-1)', 'ln(0)', 'asin(2)', '171!', '2.5!', '(-3)!', 'tan(90)', 'foo(2)',
    'sin30', 'constructor(2)', 'sin(', '2^', '10^400']) {
    assert.throws(() => evaluar(mala), mala);
  }
  assert.throws(() => evaluar('tan(pi/2)', { grados: false }));
  assert.throws(() => evaluar('foo(2)'), /desconocida/);
});
