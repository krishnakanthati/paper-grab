import { createGame } from '../src/game/index.ts';
import { SPEED, TICK_HZ } from '../src/config.ts';

export const STEP = SPEED / TICK_HZ;          // cells moved per tick

export function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** Face `angle` and move roughly `cells` cells (instant turn: tests script exact geometry). */
export function go(G, p, angle, cells) {
  p.angle = p.target = angle;
  for (let i = 0, n = Math.ceil(cells / STEP); i < n; i++) { G.tick(); if (!p.alive) return false; }
  return true;
}
export const E = 0, S = Math.PI / 2, W = Math.PI, N = -Math.PI / 2;

/** Restart until the human spawns with a big clear patch of open land around it. */
export function startWithRoom(G, radius = 13) {
  for (let t = 0; t < 2000; t++) {
    G.startGame();
    const h = G.players[0];
    let ok = true;
    for (let dy = -radius; dy <= radius && ok; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(h.x) + dx, y = Math.floor(h.y) + dy;
        if (x < 0 || y < 0 || x >= G.NX || y >= G.NY || !G.arena.inside(x + 0.5, y + 0.5) || (G.owner[y * G.NX + x] && G.owner[y * G.NX + x] !== 1)) { ok = false; break; }
      }
    for (const o of G.players.slice(1)) if (Math.hypot(o.x - h.x, o.y - h.y) < radius + 4) ok = false;
    if (ok) return h;
  }
  throw new Error('no roomy spawn found');
}

/** Remove every other player so a scripted scenario can't be interfered with by bots. */
export function alone(G) {
  for (const p of G.players.slice(1)) {
    p.alive = false; p.respawnIn = 1e9;
    for (const i of p.trail) G.trail[i] = 0;                     // others' lines are gone entirely
    p.trail = []; p.path = [];
  }
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] > 1) G.owner[i] = 0;
  G.countsDirty = true;                                          // we edited ownership by hand
}

/** Give a player a small patch of their own land at their head (so they aren't eliminated for having none). */
export function giveLand(G, p, x = p.x, y = p.y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(Math.floor(y) + dy) * G.NX + Math.floor(x) + dx] = p.id;
  G.countsDirty = true;
}

export const game = (seed = 1, events = {}, rules) => createGame(rng(seed), events, rules, { botCount: 7 });
export const cellOwner = (G, x, y) => G.owner[Math.floor(y) * G.NX + Math.floor(x)];
