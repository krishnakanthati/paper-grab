import test from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../helpers.mjs';

const { NX, NY } = game();                                       // the default arena is the world

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const at = (G, x, y) => (x >= 0 && y >= 0 && x < NX && y < NY ? G.land[y * NX + x] : 0);

test('the arena is the world: one connected landmass of a sensible size', () => {
  const G = game();
  assert.ok(G.landCount > 20000 && G.landCount < 32000, 'land cells ' + G.landCount);
  const seen = new Uint8Array(NX * NY), st = [G.land.indexOf(1)]; seen[st[0]] = 1; let n = 0;
  while (st.length) {
    const c = st.pop(); n++;
    for (const [dx, dy] of N4) { const x = (c % NX) + dx, y = ((c / NX) | 0) + dy; const k = y * NX + x; if (at(G, x, y) && !seen[k]) { seen[k] = 1; st.push(k); } }
  }
  assert.equal(n, G.landCount, 'not all land is connected');
});

test('nothing in the arena reads as an obstacle: no spurs, no diagonal pinch points, no small enclosed pockets', () => {
  const G = game();
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    if (!at(G, x, y)) continue;
    const nb = N4.filter(([dx, dy]) => at(G, x + dx, y + dy)).length;
    assert.ok(nb >= 2, `spur at ${x},${y}`);
    if (at(G, x + 1, y + 1) && !at(G, x + 1, y) && !at(G, x, y + 1)) assert.fail(`diagonal pinch at ${x},${y}`);
  }
  // enclosed water must not exist at all: every water cell reaches the map border
  const seen = new Uint8Array(NX * NY), st = [];
  for (let x = 0; x < NX; x++) for (const y of [0, NY - 1]) if (!G.land[y * NX + x]) { seen[y * NX + x] = 1; st.push(y * NX + x); }
  for (let y = 0; y < NY; y++) for (const x of [0, NX - 1]) if (!G.land[y * NX + x] && !seen[y * NX + x]) { seen[y * NX + x] = 1; st.push(y * NX + x); }
  while (st.length) {
    const c = st.pop();
    for (const [dx, dy] of N4) { const x = (c % NX) + dx, y = ((c / NX) | 0) + dy; if (x < 0 || y < 0 || x >= NX || y >= NY) continue; const k = y * NX + x; if (!G.land[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
  }
  let pockets = 0; for (let i = 0; i < NX * NY; i++) if (!G.land[i] && !seen[i]) pockets++;
  assert.ok(pockets < 250 * 3, 'enclosed water cells: ' + pockets);
});

test('inside() only accepts points on land, well away from the coast; inward() points inland', () => {
  const G = game();
  let checked = 0;
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const col = (xx, ys) => ys.every(yy => G.land[yy * NX + xx] === 1), wet = (xx, ys) => ys.every(yy => G.land[yy * NX + xx] === 0);
    if (col(x, [y - 1, y, y + 1]) && col(x - 1, [y - 1, y, y + 1]) && wet(x + 1, [y - 1, y, y + 1]) && wet(x + 2, [y - 1, y, y + 1])) {   // a straight east-facing coast, three cells long
      assert.equal(G.arena.inside(x + 0.8, y + 0.5), false, 'a point hanging over the coast counts as inside');
      assert.equal(G.arena.inside(x - 1 + 0.5, y + 0.5), true, 'a point one cell inland should be inside');
      const [ix] = G.arena.inward(x + 0.8, y + 0.5);
      assert.ok(ix < -0.3, 'inward does not point west on an east-facing coast: ' + ix.toFixed(2));
      if (++checked > 40) return;
    }
  }
  assert.ok(checked > 5);
});

test('everyone spawns inside the world on their own round patch', () => {
  const G = game(3);
  G.startGame();
  assert.equal(G.players.length, 8);
  for (const p of G.players) {
    assert.ok(p.alive);
    assert.ok(G.arena.inside(p.x, p.y));
    assert.ok(G.counts[p.id] >= 16 && G.counts[p.id] <= 25, 'patch size ' + G.counts[p.id]);
  }
});

test('the part of the world a head can stand in is one connected region: no neck or pocket it cannot fit through', () => {
  const G = game();
  const enterable = (x, y) => x >= 0 && y >= 0 && x < NX && y < NY && G.land[y * NX + x] === 1 && G.arena.inside(x + 0.5, y + 0.5);
  let total = 0, start = -1;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if (enterable(x, y)) { total++; if (start < 0) start = y * NX + x; }
  assert.ok(total > G.landCount * 0.8, 'only ' + total + ' of ' + G.landCount + ' land cells are enterable at all');
  const seen = new Uint8Array(NX * NY), st = [start]; seen[start] = 1; let n = 0;
  while (st.length) {                                          // flood over legal head positions, stepping to the 8 neighbouring cell centres
    const c = st.pop(); n++; const cx = c % NX, cy = (c / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cx + dx, y = cy + dy, k = y * NX + x;
      if (!enterable(x, y) || seen[k]) continue;
      seen[k] = 1; st.push(k);
    }
  }
  assert.equal(n, total, `a head can only reach ${n} of the ${total} enterable cells: part of the world is cut off`);
});

test('every land cell lies in a region at least 5 cells wide (the generator\'s round width rule)', () => {
  const G = game();
  const R = 2, disc = []; for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx * dx + dy * dy <= R * R + R) disc.push([dx, dy]);
  const land = (x, y) => x >= 0 && y >= 0 && x < NX && y < NY && G.land[y * NX + x] === 1;
  const fits = (cx, cy) => disc.every(([dx, dy]) => land(cx + dx, cy + dy));
  let bad = 0;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++)
    if (land(x, y) && !disc.some(([dx, dy]) => fits(x + dx, y + dy))) bad++;
  assert.equal(bad, 0, bad + ' land cells are in passages narrower than 5 cells');
});

test('no land touches the map border', () => {
  const G = game();
  for (let x = 0; x < NX; x++) for (const y of [0, 1, 2, NY - 1, NY - 2, NY - 3]) assert.equal(G.land[y * NX + x], 0, `land at ${x},${y}`);
  for (let y = 0; y < NY; y++) for (const x of [0, 1, 2, NX - 1, NX - 2, NX - 3]) assert.equal(G.land[y * NX + x], 0, `land at ${x},${y}`);
});
