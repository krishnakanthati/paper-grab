import test from 'node:test';
import assert from 'node:assert/strict';
import { game, rng } from '../helpers.mjs';

test('20000 randomised ticks keep every invariant, and bots claim real land', () => {
  const r = rng(12345);
  const G = game(12345);
  G.startGame();
  let maxBot = 0, bumps = 0, ver = G.ver.slice();
  for (let t = 0; t < 20000; t++) {
    const h = G.players[0];
    if (h.alive && t % 15 === 0) G.setTarget(r() * Math.PI * 2 - Math.PI);
    G.tick();
    if (!G.players[0].alive) G.startGame();
    if (t % 5) continue;                                         // full-grid checks every 5th tick keep the test quick
    const cnt = new Array(10).fill(0);
    for (const q of G.players) {
      assert.ok(G.arena.inside(q.x, q.y) || !q.alive, 'a head left the arena');
      if (!q.alive) { assert.equal(q.trail.length, 0); assert.equal(q.path.length, 0); continue; }
      assert.equal(new Set(q.trail).size, q.trail.length, 'duplicate line cell');
      for (const i of q.trail) { assert.equal((G.trail[i] >> q.id) & 1, 1, 'a line cell is missing its marker'); assert.ok(G.land[i]); }
      assert.equal(q.path.length === 0, q.trail.length === 0, 'drawn path and cell line disagree');
    }
    for (let i = 0; i < G.owner.length; i++) {
      for (let id = 1; id <= 8; id++) if ((G.trail[i] >> id) & 1) assert.ok(G.players[id - 1].alive, 'line cell of a dead player');
      if (G.owner[i]) { assert.ok(G.land[i], 'land owned outside the arena'); assert.ok(G.players[G.owner[i] - 1].alive, 'land of a dead player'); cnt[G.owner[i]]++; }
    }
    for (let id = 1; id <= 8; id++) { assert.equal(cnt[id], G.counts[id], 'cached count is stale for player ' + id); if (id > 1) maxBot = Math.max(maxBot, cnt[id]); }
    for (let id = 0; id < G.ver.length; id++) if (G.ver[id] !== ver[id]) { bumps++; ver[id] = G.ver[id]; }
  }
  assert.ok(maxBot > 250, 'bots barely expanded: ' + maxBot);
  assert.ok(bumps > 100, 'territory versions never moved, the renderer would never refresh');
});

test('performance guard: a logic tick stays far below the 33ms budget', () => {
  const G = game(99);
  G.startGame();
  const t0 = performance.now();
  for (let i = 0; i < 3000; i++) { G.tick(); if (!G.players[0].alive || !G.running) G.startGame(); }      // a won round ends like a lost one: the game never keeps ticking a finished round
  const avg = (performance.now() - t0) / 3000;
  assert.ok(avg < 3, 'average tick is ' + avg.toFixed(2) + ' ms');
});
