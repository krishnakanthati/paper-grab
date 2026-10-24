import test from 'node:test';
import assert from 'node:assert/strict';
import { E, N, S, W, alone, cellOwner, game, go, startWithRoom } from '../helpers.mjs';

test('closing a loop claims everything it encloses and clears the line', () => {
  const G = game(2);
  const h = startWithRoom(G); alone(G);
  const x0 = h.x, y0 = h.y, before = G.counts[1];
  assert.ok(go(G, h, E, 9) && go(G, h, S, 7) && go(G, h, W, 9) && go(G, h, N, 7.5));
  assert.equal(h.trail.length, 0, 'line not cleared');
  assert.equal(h.path.length, 0, 'drawn path not cleared');
  assert.equal(cellOwner(G, x0 + 5, y0 + 3.5), 1, 'cell inside the loop was not claimed');
  assert.ok(G.counts[1] > before + 25, 'barely gained land: ' + (G.counts[1] - before));
  assert.equal(cellOwner(G, x0 + 12, y0 + 3), 0, 'a cell outside the loop was claimed');
});

test('land inside the loop that belonged to someone else is stolen, and its owner is notified via version', () => {
  const G = game(8);
  const h = startWithRoom(G);
  const victim = G.players[1];
  const x0 = Math.floor(h.x), y0 = Math.floor(h.y);
  G.owner[(y0 + 3) * G.NX + x0 + 5] = victim.id;
  const ver = G.ver[victim.id];
  go(G, h, E, 9); go(G, h, S, 7); go(G, h, W, 9); go(G, h, N, 7.5);
  assert.equal(G.owner[(y0 + 3) * G.NX + x0 + 5], 1);
  assert.ok(G.ver[victim.id] > ver, 'victim territory version was not bumped');
});

test('the line starts where you left home and follows the real path', () => {
  const G = game(4);
  const h = startWithRoom(G); alone(G);
  go(G, h, E, 6);
  assert.ok(h.trail.length >= 2);
  assert.ok(h.path.length >= 4 && h.path.length % 2 === 0);
  assert.ok(h.path[0] < h.x, 'path should begin behind the head, at the edge of home');
  assert.ok(Math.abs(h.path[h.path.length - 1] - h.y) < 1e-9 && Math.abs(h.path[h.path.length - 2] - h.x) < 1e-9, 'path should end at the head');
});
