import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game/index.ts';
import { capture, insidePath } from '../../src/game/capture.ts';
import { rng } from '../helpers.mjs';

const N = 40;
const squareShape = { id: 'SQ', name: 'square', nx: N, ny: N, mask: Buffer.alloc(Math.ceil((N * N) / 8), 0xff).toString('base64') };

// land with a moat of water all round, like a real arena: only then is there a coast for "all the way round the edge" to mean anything
const MOAT = 3;
const moatShape = (() => {
  const bits = new Uint8Array(Math.ceil((N * N) / 8));
  for (let y = MOAT; y < N - MOAT; y++) for (let x = MOAT; x < N - MOAT; x++) { const i = y * N + x; bits[i >> 3] |= 0x80 >> (i & 7); }
  return { id: 'MOAT', name: 'moat', nx: N, ny: N, mask: Buffer.from(bits).toString('base64') };
})();

/** A game on an all-land square, alone, with the human owning a 3x3 patch at (x, y). */
function setup(x, y, shape = squareShape, botCount = 0) {
  const G = createGame(rng(5), {}, undefined, { shape, botCount });
  G.startGame();
  G.owner.fill(0);
  const p = G.players[0];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(y + dy) * G.NX + x + dx] = 1;
  return { G, p };
}
/** Lay a closed rectangular ring of trail cells (x0..x1, y0..y1) and the matching walked path, starting and ending at (sx, sy). */
function ring(G, p, x0, y0, x1, y1) {
  const cells = [], path = [];
  const add = (x, y) => { cells.push(y * G.NX + x); path.push(x + 0.5, y + 0.5); };
  for (let x = x0; x <= x1; x++) add(x, y0);
  for (let y = y0 + 1; y <= y1; y++) add(x1, y);
  for (let x = x1 - 1; x >= x0; x--) add(x, y1);
  for (let y = y1 - 1; y > y0; y--) add(x0, y);
  p.trail = cells; p.path = path;
  for (const c of cells) G.trail[c] |= 1 << p.id;
}

test('a loop that encloses MORE than the land outside it claims the inside, not the strip beside the coast', () => {
  const { G, p } = setup(3, 3);
  ring(G, p, 2, 2, 37, 37);                                      // right round the rim: inside is ~1200 cells, the outside only the 2-cell border strip
  capture(G, p);
  assert.ok(G.owner[20 * G.NX + 20] === 1, 'the middle of the map must be claimed');
  assert.ok(G.owner[10 * G.NX + 30] === 1);
  assert.equal(G.owner[0 * G.NX + 0], 0, 'the strip outside the loop stays unclaimed');
  assert.equal(G.owner[39 * G.NX + 20], 0);
});

test('an ordinary small loop still claims just its inside', () => {
  const { G, p } = setup(10, 10);
  ring(G, p, 9, 9, 18, 18);
  capture(G, p);
  assert.equal(G.owner[14 * G.NX + 14], 1);
  assert.equal(G.owner[25 * G.NX + 25], 0, 'far land stays unclaimed');
  assert.equal(G.owner[5 * G.NX + 5], 0);
});

test('a line cell the drawn outline only grazes is given back instead of bleeding past the outline', () => {
  const { G, p } = setup(10, 10);
  ring(G, p, 9, 9, 18, 18);
  const stray = 8 * G.NX + 14;                                   // a cell above the top edge: its centre is a whole cell from the walked path
  p.trail.push(stray); G.trail[stray] |= 1 << p.id;
  capture(G, p);
  assert.equal(G.owner[stray], 0, 'the grazed cell is not claimed');
  assert.equal(G.owner[9 * G.NX + 14], 1, 'the line itself still is');
  assert.equal(G.owner[14 * G.NX + 14], 1, 'and so is the inside');
});

test('insidePath is a plain even-odd test', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.ok(insidePath(sq, 5, 5));
  assert.ok(!insidePath(sq, 15, 5));
  assert.ok(!insidePath(sq, -1, -1));
});

test('going all the way round the edge wins: the strip beside the coast is claimed too, so you own everything', () => {
  const { G, p } = setup(8, 8, moatShape);
  let won = 0; G.events.onWin = () => won++;
  ring(G, p, MOAT + 1, MOAT + 1, N - MOAT - 2, N - MOAT - 2);    // one cell in from the coast, all the way round
  capture(G, p);
  let notMine = 0; for (let i = 0; i < G.owner.length; i++) if (G.land[i] && G.owner[i] !== 1) notMine++;
  assert.equal(notMine, 0, 'every land cell is yours');
  G.countsDirty = true; G.running = true; G.tick();
  assert.equal(won, 1, 'and the round is won');
});

test('a big loop that leaves land deep inland unclaimed is not a win', () => {
  const { G, p } = setup(10, 10, moatShape);
  ring(G, p, 8, 8, 30, 30);                                      // leaves a wide band all round, well away from the coast
  capture(G, p);
  let notMine = 0; for (let i = 0; i < G.owner.length; i++) if (G.land[i] && G.owner[i] !== 1) notMine++;
  assert.ok(notMine > 0);
});

test('only the player can win this way: a bot closing a loop round the rim gets the coastal gap like anyone, but never ends the round', () => {
  const { G } = setup(8, 8, moatShape, 1);
  let won = 0; G.events.onWin = () => won++;
  const bot = G.players[1];
  bot.alive = true;
  G.owner.fill(0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(8 + dy) * G.NX + 8 + dx] = bot.id;
  ring(G, bot, MOAT + 1, MOAT + 1, N - MOAT - 2, N - MOAT - 2);
  capture(G, bot);
  assert.equal(G.owner[MOAT * G.NX + 20], bot.id, 'the gap beside its line is its own now');
  G.countsDirty = true; G.running = true; G.tick();
  assert.equal(won, 0, 'and a computer player never wins the round for you');
});

test('a loop that has everyone inside it wins, even if it does not hug the coast', () => {
  const { G, p } = setup(10, 10, moatShape, 2);
  let won = 0; G.events.onWin = () => won++;
  G.players[1].x = 20; G.players[1].y = 20; G.players[2].x = 25; G.players[2].y = 12;       // both bots are inside the loop
  ring(G, p, 6, 6, 33, 33);                                      // well inside the coast: a wide band of land is left outside
  capture(G, p);
  let notMine = 0; for (let i = 0; i < G.owner.length; i++) if (G.land[i] && G.owner[i] !== 1) notMine++;
  assert.equal(notMine, 0, 'the rest is yours too');
  G.countsDirty = true; G.running = true; G.tick();
  assert.equal(won, 1);
});

test('a loop with somebody left outside it is not a win', () => {
  const { G, p } = setup(10, 10, moatShape, 2);
  G.players[1].x = 20; G.players[1].y = 20; G.players[2].x = 4.5; G.players[2].y = 4.5;      // one bot is outside the loop
  ring(G, p, 6, 6, 33, 33);
  capture(G, p);
  assert.ok([...G.owner].some((o, i) => G.land[i] && o !== 1), 'land is left unclaimed');
});

import { WIN_SHARE } from '../../src/config.ts';
test('owning the board but for a sliver is a win: what the bar shows as 100% really is one, and the sliver becomes yours', () => {
  const { G } = setup(8, 8, moatShape, 1);
  let won = 0; G.events.onWin = () => won++;
  G.players[1].alive = false; G.players[1].respawnIn = 1e9;
  const land = []; G.land.forEach((l, i) => { if (l) land.push(i); });
  const keep = Math.ceil(land.length * (WIN_SHARE + 0.002));         // a hair over the threshold
  land.forEach((i, k) => { G.owner[i] = k < keep ? 1 : G.players[1].id; });
  G.countsDirty = true; G.running = true; G.tick();
  assert.equal(won, 1, 'won');
  assert.equal(G.owner.filter((o, i) => G.land[i] && o !== 1).length, 0, 'the leftover sliver is yours too');
});

test('just under the threshold is not a win', () => {
  const { G } = setup(8, 8, moatShape, 1);
  let won = 0; G.events.onWin = () => won++;
  G.players[1].alive = false; G.players[1].respawnIn = 1e9;
  const land = []; G.land.forEach((l, i) => { if (l) land.push(i); });
  const keep = Math.floor(land.length * (WIN_SHARE - 0.01));
  land.forEach((i, k) => { G.owner[i] = k < keep ? 1 : G.players[1].id; });
  G.countsDirty = true; G.running = true; G.tick();
  assert.equal(won, 0);
});

test('a line that hugs the coast also claims the thin gap of land between it and the water (no pale slivers left along the edge)', () => {
  const { G, p } = setup(8, 8, moatShape);
  G.owner.fill(0);
  const y = MOAT + 1, x0 = 7, x1 = 30;
  for (const [cx, cy] of [[x0 - 1, y], [x0, y], [x1, y], [x1 + 1, y]]) for (let dy = -1; dy <= 1; dy++) G.owner[(cy + dy) * G.NX + cx] = 1;     // own land at both ends
  const cells = [], path = [];
  for (let x = x0 + 1; x < x1; x++) { cells.push(y * G.NX + x); path.push(x + 0.5, y + 0.5); }
  p.trail = cells; p.path = path;
  for (const c of cells) G.trail[c] |= 1 << p.id;
  const gapRow = MOAT;                                           // the row of land right against the water, above the line
  for (let x = x0 + 1; x < x1; x++) assert.notEqual(G.owner[gapRow * G.NX + x], 1, 'it starts out unclaimed');
  capture(G, p);
  for (let x = x0 + 1; x < x1; x++) assert.equal(G.owner[gapRow * G.NX + x], 1, `the gap cell at x=${x} is claimed with the line`);
});

test('a line far from the coast does not claim anything beside it, so interior play is unchanged', () => {
  const { G, p } = setup(20, 20);
  ring(G, p, 15, 15, 25, 25);
  const outside = G.owner[14 * G.NX + 20];
  capture(G, p);
  assert.equal(G.owner[14 * G.NX + 20], outside, 'the cell just outside the loop is left alone');
  assert.equal(G.owner[20 * G.NX + 20], 1);
});

import { lineContacts } from '../../src/game/combat.ts';
test('touching your own earlier line, even after a long loop, claims nothing: land is only claimed by getting home', () => {
  const { G, p } = setup(6, 6, moatShape);
  G.owner.fill(0); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(6 + dy) * G.NX + 6 + dx] = 1;       // home, far from the circle
  const x0 = 10, y0 = 10, x1 = 30, y1 = 30, cells = [], path = [];
  const add = (x, y) => { path.push(x + 0.5, y + 0.5); const c = Math.floor(y + 0.5) * G.NX + Math.floor(x + 0.5); if (cells[cells.length - 1] !== c) cells.push(c); };
  for (let x = x0; x <= x1; x += 0.5) add(x, y0);
  for (let y = y0; y <= y1; y += 0.5) add(x1, y);
  for (let x = x1; x >= x0; x -= 0.5) add(x, y1);
  for (let y = y1; y >= y0 + 1.5; y -= 0.5) add(x0, y);
  for (let x = x0; x <= x0 + 1; x += 0.5) add(x, y0 + 1);                // back across the start of the line
  p.trail = cells; p.path = path; p.x = p.px = x0 + 1.0; p.y = p.py = y0 + 1.0;
  for (const c of cells) G.trail[c] |= 1 << p.id;
  const lenBefore = p.trail.length;
  lineContacts(G);
  assert.notEqual(G.owner[20 * G.NX + 20], 1, 'the middle must not be claimed by crossing your own line');
  assert.equal(p.trail.length, lenBefore, 'and the line stays open');
  assert.ok(p.alive);
});
