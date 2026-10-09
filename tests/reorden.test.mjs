import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReordenPropio } from '../js/utils.js';

const f = (id, creado_por, orden) => ({ id, creado_por, orden });
const grupo = [f('A', 'yo', 0), f('X', 'otro', 1), f('B', 'yo', 2), f('C', 'yo', 3)];

test('planReordenPropio: intercambia solo con MIS archivos, saltando los ajenos', () => {
  assert.deepEqual(planReordenPropio(grupo, 'B', -1, 'yo'), [{ id: 'B', orden: 0 }, { id: 'A', orden: 2 }]);
  assert.deepEqual(planReordenPropio(grupo, 'A', 1, 'yo'), [{ id: 'A', orden: 2 }, { id: 'B', orden: 0 }]);
});

test('planReordenPropio: nunca escribe en archivos ajenos y respeta los extremos', () => {
  for (const [id, delta] of [['A', -1], ['C', 1], ['X', 1], ['X', -1], ['Z', 1]]) {
    assert.deepEqual(planReordenPropio(grupo, id, delta, 'yo'), [], `${id} ${delta}`);
  }
  for (const id of ['A', 'B', 'C']) {
    for (const delta of [-1, 1]) {
      for (const c of planReordenPropio(grupo, id, delta, 'yo')) assert.notEqual(c.id, 'X');
    }
  }
  assert.deepEqual(planReordenPropio(grupo, 'A', 1, 'otro'), []); // un archivo mío no lo mueve otro usuario
});

test('planReordenPropio: empates y documentos sin orden se desempatan sin valores negativos', () => {
  const t = [f('A', 'yo', 1), f('B', 'yo', 1)];
  assert.deepEqual(planReordenPropio(t, 'B', -1, 'yo'), [{ id: 'A', orden: 2 }]); // B queda antes
  assert.deepEqual(planReordenPropio(t, 'A', 1, 'yo'), [{ id: 'A', orden: 2 }]);  // A queda después
  const sin = [f('A', 'yo', undefined), f('B', 'yo', 0)];
  for (const c of planReordenPropio(sin, 'B', -1, 'yo')) assert.ok(Number.isInteger(c.orden) && c.orden >= 0);
});
