import test from 'node:test';
import assert from 'node:assert/strict';
import { E, N, S, W, alone, cellOwner, game, go, startWithRoom } from '../helpers.mjs';

// east, south, west, then north back up across the first leg: the line crosses itself
function crossOwnLine(G, h) {
  const x0 = h.x, y0 = h.y;
  const ok = go(G, h, E, 8) && go(G, h, S, 4) && go(G, h, W, 4) && go(G, h, N, 5.5);
  return { ok, x0, y0 };
}

test('by default crossing your own line is harmless, and the pocket it walls off is claimed', () => {
  const G = game(3);
  const h = startWithRoom(G); alone(G);
  const { ok, x0, y0 } = crossOwnLine(G, h);
  assert.ok(ok && h.alive, 'died crossing own line');
  assert.equal(new Set(h.trail).size, h.trail.length, 'an own-line cell was added twice');
  assert.ok(go(G, h, W, 4.5));                                  // back home
  assert.equal(h.trail.length, 0);
  assert.equal(cellOwner(G, x0 + 6, y0 + 2), 1, 'pocket walled off by the crossing was not claimed');
});

test('with selfCollisionKills on, crossing your own line eliminates you', () => {
  let reason = null;
  const G = game(3, { onGameOver: (r) => { reason = r; } }, { selfCollisionKills: true });
  const h = startWithRoom(G); alone(G);
  const { ok } = crossOwnLine(G, h);
  assert.equal(ok, false);
  assert.equal(h.alive, false);
  assert.match(reason, /own line/);
});

test('tight turns never count as hitting your own fresh line', () => {
  const G = game(5, {}, { selfCollisionKills: true });
  const h = startWithRoom(G); alone(G);
  go(G, h, E, 5);
  for (let i = 0; i < 22; i++) { h.target = h.angle + 0.9; G.tick(); }   // turn as hard as possible, but less than one full lap of the circle
  assert.ok(h.alive, 'a tight turn was counted as hitting the own line')
});
