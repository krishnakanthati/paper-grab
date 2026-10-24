import test from 'node:test';
import assert from 'node:assert/strict';
import { characterCost, characterUnlocked, points, newUnlocks, nextUnlock, TRAILS, trailUnlocked, FREE_CHARACTERS, CONQUER_POINTS } from '../../src/progress/unlocks.ts';
import { strokesFor } from '../../src/render/trailStyle.ts';
import { rng } from '../helpers.mjs';

const names = Array.from({ length: 17 }, (_, i) => 'c' + i);

test('unlocks: the first characters and the plain trail are free, the rest cost more one by one', () => {
  for (let i = 0; i < FREE_CHARACTERS; i++) assert.equal(characterCost(i), 0);
  for (let i = FREE_CHARACTERS; i < 17; i++) assert.ok(characterCost(i) > characterCost(i - 1));
  assert.equal(trailUnlocked('plain', 0), true);
  assert.equal(trailUnlocked('gold', 0), false);
  assert.equal(points(4, 2), 4 + 2 * CONQUER_POINTS);
  assert.equal(characterUnlocked(FREE_CHARACTERS, 0), false);
  assert.equal(characterUnlocked(FREE_CHARACTERS, characterCost(FREE_CHARACTERS)), true);
});

test('unlocks: announcements and the next goal to aim at', () => {
  assert.deepEqual(newUnlocks(names, 0, 0), []);
  const got = newUnlocks(names, 1, 3);
  assert.ok(got.includes('c6') && got.includes('candy trail'));
  assert.deepEqual(nextUnlock(names, 0), { name: 'c6', cost: 2 });
  assert.equal(nextUnlock(names, 10_000), null);
  assert.ok(TRAILS.every(t => t.cost >= 0));
});

test('trail styles: every style gives opaque [width, colour] pairs, and rainbow changes along the line', () => {
  for (const t of TRAILS) {
    const st = strokesFor(t.id, 0xef4b4b, 3);
    assert.equal(st.length, 2);
    for (const [w, c] of st) { assert.ok(w > 0); assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff); }
  }
  assert.notDeepEqual(strokesFor('rainbow', 1, 0), strokesFor('rainbow', 1, 4));
  assert.deepEqual(strokesFor('nonsense', 0xef4b4b), strokesFor('plain', 0xef4b4b));
});

