import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCountries } from '../../src/data/countries.ts';
import { decodeMask } from '../../src/data/shape.ts';
import { createGame } from '../../src/game/index.ts';
import { rng } from '../helpers.mjs';

const countries = parseCountries(JSON.parse(fs.readFileSync(new URL('../../public/countries.json', import.meta.url), 'utf8')));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

test('the catalogue is big, has unique ids and names, and every entry is complete', () => {
  assert.ok(countries.length >= 150, 'only ' + countries.length + ' countries');
  assert.equal(new Set(countries.map(c => c.id)).size, countries.length, 'duplicate ids');
  assert.equal(new Set(countries.map(c => c.name)).size, countries.length, 'duplicate names');
  for (const c of countries) {
    assert.ok(c.id && c.name && c.continent, c.id);
    assert.ok(/^#[0-9a-f]{6}$/i.test(c.shape.backdrop), `${c.name}: bad backdrop ${c.shape.backdrop}`);
    assert.ok(c.outline.length >= 1 && c.outline.every(r => r.length >= 4), `${c.name}: bad outline`);
    for (const ring of c.outline) for (const [lon, lat] of ring) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, `${c.name}: point out of range`);
    assert.ok(c.centre[0] >= -180 && c.centre[0] <= 180 && c.centre[1] >= -90 && c.centre[1] <= 90, `${c.name}: bad centre`);
  }
  for (const known of ['Mexico', 'Chile', 'Japan', 'India', 'Brazil', 'United States of America', 'Russia', 'Australia']) assert.ok(countries.some(c => c.name === known), 'missing ' + known);
});

test('every country is a valid arena: right mask size, enough land, an ocean margin, ONE connected landmass, no spurs or pinch points', () => {
  for (const c of countries) {
    const { nx, ny } = c.shape, land = decodeMask(c.shape);
    assert.equal(land.length, nx * ny);
    assert.ok(nx <= 300 && ny <= 300 && nx >= 20 && ny >= 20, `${c.name}: grid ${nx}x${ny}`);
    let count = 0; for (const v of land) count += v;
    assert.ok(count >= 1100, `${c.name}: only ${count} land cells`);
    assert.ok(count <= 9000, `${c.name}: ${count} land cells is too many`);
    const at = (x, y) => (x >= 0 && y >= 0 && x < nx && y < ny ? land[y * nx + x] : 0);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (!at(x, y)) continue;
      assert.ok(x >= 3 && y >= 3 && x < nx - 3 && y < ny - 3, `${c.name}: land inside the ocean margin at ${x},${y}`);
      assert.ok(N4.filter(([dx, dy]) => at(x + dx, y + dy)).length >= 2, `${c.name}: spur at ${x},${y}`);
      assert.ok(!(at(x + 1, y + 1) && !at(x + 1, y) && !at(x, y + 1)), `${c.name}: diagonal pinch at ${x},${y}`);
    }
    const seen = new Uint8Array(nx * ny), st = [land.indexOf(1)]; seen[st[0]] = 1; let n = 0;
    while (st.length) { const k = st.pop(); n++; for (const [dx, dy] of N4) { const x = (k % nx) + dx, y = ((k / nx) | 0) + dy; if (at(x, y) && !seen[y * nx + x]) { seen[y * nx + x] = 1; st.push(y * nx + x); } } }
    assert.equal(n, count, `${c.name}: ${count - n} land cells are cut off from the main landmass`);
  }
});

test('every country can actually be played: arena builds, every player spawns inside it, and the game runs without breaking its invariants', () => {
  for (const c of countries) {
    const G = createGame(rng(7), {}, undefined, { shape: c.shape });
    G.startGame();
    assert.ok(G.botCount >= 1, `${c.name}: no bots`);
    assert.equal(G.players.length, G.botCount + 1);
    for (const p of G.players) { assert.ok(p.alive, `${c.name}: player ${p.id} did not spawn`); assert.ok(G.arena.inside(p.x, p.y), `${c.name}: player ${p.id} spawned outside`); }
    for (let t = 0; t < 150; t++) {
      if (t % 20 === 0) G.setTarget(t / 7);
      G.tick();
      if (!G.players[0].alive) G.startGame();
      for (const q of G.players) if (q.alive) assert.ok(G.arena.inside(q.x, q.y) || q.blocked === false, `${c.name}: a head left the arena`);
    }
    const cnt = new Array(G.players.length + 2).fill(0);
    for (let i = 0; i < G.owner.length; i++) if (G.owner[i]) { assert.ok(G.land[i], `${c.name}: land owned on water`); cnt[G.owner[i]]++; }
    for (let id = 1; id <= G.players.length; id++) assert.equal(cnt[id], G.counts[id], `${c.name}: stale count for ${id}`);
  }
});

test('the whole catalogue is small enough to ship (under 700 KB) and parses fast', () => {
  const size = fs.statSync(new URL('../../public/countries.json', import.meta.url)).size;
  assert.ok(size < 700 * 1024, 'countries.json is ' + (size / 1024).toFixed(0) + ' KB');
  const t0 = performance.now();
  parseCountries(JSON.parse(fs.readFileSync(new URL('../../public/countries.json', import.meta.url), 'utf8')));
  assert.ok(performance.now() - t0 < 200, 'parsing took ' + (performance.now() - t0).toFixed(0) + ' ms');
});

test('a thin country keeps its shape (Chile is a long strip, not a few blobs) and small ones are scaled up to a playable size', () => {
  const chile = countries.find(c => c.name === 'Chile').shape;
  assert.ok(chile.ny / chile.nx > 3, `Chile should be much taller than wide: ${chile.nx}x${chile.ny}`);
  for (const name of ['Luxembourg', 'Israel', 'Belgium']) {
    const c = countries.find(x => x.name === name);
    if (!c) continue;
    let land = 0; for (const v of decodeMask(c.shape)) land += v;
    assert.ok(land >= 1100, `${name} is too small to play (${land} cells)`);
  }
});
