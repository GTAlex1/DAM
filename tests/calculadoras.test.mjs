import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluar, convertirBase, capacidad, agrupar, textoABytes, bytesABinario, binarioATexto, desglose,
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
