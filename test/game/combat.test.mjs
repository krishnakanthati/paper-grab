import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeads } from '../../src/game/combat.ts';
import { alone, cellOwner, game, giveLand, startWithRoom } from '../helpers.mjs';

// Freeze a scene with two heads touching and run only the head-collision rule on it (no movement involved).
function duel(seed, setup) {
  const G = game(seed);
  startWithRoom(G); alone(G);
  const a = G.players[0], b = G.players[1];
  b.alive = true; b.respawnIn = 0;
  a.x = Math.floor(a.x) + 0.5; a.y = Math.floor(a.y) + 0.5;
  b.x = a.x + 0.7; b.y = a.y;                                    // the next cell over, close enough to touch
  a.px = a.x; a.py = a.y; b.px = b.x; b.py = b.y;
  setup(G, a, b);
  resolveHeads(G);
  return { G, a, b };
}
const ownCell = (G, p) => { G.owner[Math.floor(p.y) * G.NX + Math.floor(p.x)] = p.id; };
const clearCell = (G, p) => { G.owner[Math.floor(p.y) * G.NX + Math.floor(p.x)] = 0; };

test('safe zone: an intruder touching your head while you stand on your own land dies, you do not', () => {
  const { a, b } = duel(11, (G, a, b) => { ownCell(G, a); clearCell(G, b); b.trailStartTick = 5; });
  assert.equal(a.alive, true);
  assert.equal(b.alive, false);
});

test('safe zone works the other way round too', () => {
  const { a, b } = duel(12, (G, a, b) => { clearCell(G, a); ownCell(G, b); a.trailStartTick = 5; });
  assert.equal(a.alive, false);
  assert.equal(b.alive, true);
});

test('two players both standing on their own land cannot hurt each other', () => {
  const { a, b } = duel(13, (G, a, b) => { ownCell(G, a); ownCell(G, b); });
  assert.ok(a.alive && b.alive);
});

test('head-on outside land: the older line loses', () => {
  const { a, b } = duel(14, (G, a, b) => { clearCell(G, a); clearCell(G, b); a.trailStartTick = 10; b.trailStartTick = 20; });
  assert.equal(a.alive, false);
  assert.equal(b.alive, true);
});

test('head-on outside land with equal lines: both die', () => {
  const { a, b } = duel(15, (G, a, b) => { clearCell(G, a); clearCell(G, b); a.trailStartTick = 10; b.trailStartTick = 10; });
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
});

test('anyone touching your exposed line cuts you', () => {
  const G = game(16);
  startWithRoom(G); alone(G);
  const owner = G.players[2], rival = G.players[1];
  rival.alive = owner.alive = true; rival.thinkIn = owner.thinkIn = 1e9;
  // `owner` is out on open floor, away from any home, with an open line; `rival` runs into it
  const rx = Math.floor(G.players[0].x) + 6, ry = Math.floor(G.players[0].y) + 4;
  owner.x = rx + 8.5; owner.y = ry + 6.5; owner.px = owner.x; owner.py = owner.y; owner.angle = owner.target = 0;
  giveLand(G, owner, rx - 3, ry); giveLand(G, rival);
  for (let i = 0; i < 4; i++) { G.trail[ry * G.NX + rx + i] |= 1 << owner.id; owner.trail.push(ry * G.NX + rx + i); }
  owner.path = [rx, ry + 0.5, rx + 4, ry + 0.5, owner.x, owner.y];
  rival.x = rx - 0.4; rival.y = ry + 0.5; rival.px = rival.x; rival.py = rival.y; rival.angle = rival.target = 0;
  for (let i = 0; i < 6 && owner.alive; i++) G.tick();
  assert.equal(owner.alive, false, 'the line owner survived a rival running through their line');
  assert.equal(owner.trail.length, 0);
  assert.equal(G.trail[ry * G.NX + rx] & (1 << owner.id), 0, 'the dead player\'s line was left on the floor');
});

test('eliminations are counted for the player who made them', () => {
  const { a, b } = duel(41, (G, a, b) => { ownCell(G, a); clearCell(G, b); });
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(b.kills, 0);
});

test('a both-die crash counts a kill for each side, and dying alone counts none', () => {
  const { a, b } = duel(42, (G, a, b) => { clearCell(G, a); clearCell(G, b); a.trailStartTick = 10; b.trailStartTick = 10; });
  assert.equal(a.kills, 1);
  assert.equal(b.kills, 1);
});

// ---- geometric line contacts: the head's circle against the line as drawn ----
import { distToPath, lineContacts } from '../../src/game/combat.ts';

function lineScene(seed, dy, rivalX = 3.5) {
  const G = game(seed);
  startWithRoom(G); alone(G);
  const owner = G.players[2], rival = G.players[1];
  rival.alive = owner.alive = true; rival.thinkIn = owner.thinkIn = 1e9;
  const rx = Math.floor(G.players[0].x) + 6, ry = Math.floor(G.players[0].y) + 4;
  // `owner`'s line: a horizontal run through the middle of row `ry`, then a long last segment to its (far away) head
  owner.x = rx + 8.5; owner.y = ry + 6.5; owner.px = owner.x; owner.py = owner.y; owner.angle = owner.target = 0;
  giveLand(G, owner, rx - 3, ry); giveLand(G, rival);
  owner.trail = []; for (let i = 0; i < 6; i++) { G.trail[ry * G.NX + rx + i] |= 1 << owner.id; owner.trail.push(ry * G.NX + rx + i); }
  owner.path = [rx, ry + 0.5, rx + 6, ry + 0.5, owner.x, owner.y];
  rival.x = rx + rivalX; rival.y = ry + 0.5 + dy; rival.px = rival.x; rival.py = rival.y; rival.angle = rival.target = 0;
  return { G, owner, rival, rx, ry };
}

test('brushing a line (head body overlapping the drawn line) cuts its owner', () => {
  const { G, owner } = lineScene(51, 0.55);
  lineContacts(G);
  assert.equal(owner.alive, false);
});

test('passing close but not touching the drawn line is safe, even in a cell the line passes through', () => {
  const { G, owner, rival } = lineScene(52, 1.05);
  lineContacts(G);
  assert.equal(owner.alive, true, 'cut from a distance: the head never touched the line');
  assert.equal(rival.alive, true);
});

test('being inside a trail cell is not enough: the corner of the cell far from the line does not cut', () => {
  const G = game(53);
  startWithRoom(G); alone(G);
  const owner = G.players[2], rival = G.players[1];
  rival.alive = owner.alive = true; rival.thinkIn = owner.thinkIn = 1e9;
  const rx = Math.floor(G.players[0].x) + 6, ry = Math.floor(G.players[0].y) + 4;
  owner.x = rx + 8.5; owner.y = ry + 6.5; owner.px = owner.x; owner.py = owner.y;
  giveLand(G, owner, rx - 3, ry); giveLand(G, rival);
  owner.trail = [ry * G.NX + rx + 3]; G.trail[ry * G.NX + rx + 3] |= 1 << owner.id;
  owner.path = [rx + 2, ry + 0.02, rx + 4, ry + 0.02, owner.x, owner.y];          // the line hugs the TOP edge of that cell
  rival.x = rx + 3.5; rival.y = ry + 0.97; rival.px = rival.x; rival.py = rival.y;   // the rival sits in the BOTTOM of the same cell
  rival.angle = rival.target = 0;
  assert.equal(G.trail[Math.floor(rival.y) * G.NX + Math.floor(rival.x)] & (1 << owner.id), 1 << owner.id, 'scene check: the rival stands in a cell the line is marked in');
  lineContacts(G);
  assert.equal(owner.alive, true, 'the old cell-based rule would have cut here');
});

test('the line segment attached to its owner\'s head is excluded from contacts (heads meeting is a head-on crash instead)', () => {
  const path = [0, 0, 2, 0, 2, 5];                                  // the last segment runs from (2,0) up to the owner's head at (2,5)
  assert.ok(distToPath(path, 2.3, 4, 0) < 0.31, 'with the head segment, a point beside it is close');
  assert.ok(distToPath(path, 2.3, 4, 1) > 3.9, 'without it, the only line left is far away');
});

test('distToPath measures the distance to the nearest segment, ignoring the last `skip` segments', () => {
  const path = [0, 0, 10, 0, 10, 10];
  assert.ok(Math.abs(distToPath(path, 5, 3, 0) - 3) < 1e-9);
  assert.ok(Math.abs(distToPath(path, 12, 5, 0) - 2) < 1e-9);
  assert.ok(Math.abs(distToPath(path, 12, 5, 1) - Math.hypot(2, 5)) < 1e-9, 'skipping the last segment should leave only the first');
  assert.equal(distToPath([1, 1, 2, 2], 0, 0, 1), Infinity, 'a path with only skipped segments has no distance');
});
