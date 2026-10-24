import test from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../helpers.mjs';
import { HEAD_DEPTH } from '../../src/game/arena.ts';

test('computer players reach the coast, not just the middle of the map', () => {
  let touched = new Set();
  for (const seed of [1, 2, 3]) {
    const G = game(seed);
    G.startGame();
    for (let t = 0; t < 6000; t++) {
      G.tick();
      if (!G.players[0].alive) G.startGame();
      for (const q of G.players) if (q.isBot && q.alive && G.arena.depth(q.x, q.y) < HEAD_DEPTH + 0.4) touched.add(seed + ":" + q.id + ":" + t);
    }
  }
  assert.ok(touched.size >= 2000, 'bot ticks spent on the coast: ' + touched.size);
});
