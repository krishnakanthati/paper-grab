import test from 'node:test';
import assert from 'node:assert/strict';


test('every flip in the air is worth one point', async () => {
  const { points } = await import('../../src/progress/unlocks.ts');
  assert.equal(points(2, 1, 0), 5);
  assert.equal(points(2, 1, 4), 9);
});
