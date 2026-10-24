#!/usr/bin/env node
// Builds public/countries.json: every country as a playable arena shape, plus simplified outlines for the picker.
//
// Source: Natural Earth 110m admin-0 countries (public domain). Each country is projected (equirectangular, scaled by
// cos(latitude) so shapes look right), rasterized at a size chosen to give a comfortable playable area, then cleaned the
// same way the world map is: thin channels and small enclosed pockets filled, narrow necks and spurs removed, diagonal
// pinch points fixed, nearby islands joined by wide bridges, only the largest connected landmass kept, and an ocean
// margin left all round. Thin countries (Chile, Vietnam...) automatically use a narrower width rule so they survive.
//
//   node tools/make_countries.mjs            # downloads the data if needed, writes public/countries.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache', 'ne_110m_admin_0_countries.geojson');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const OUT = path.join(here, '..', 'public', 'countries.json');

const TARGET_CELLS = 6500;   // land cells a country should have (a world arena has ~6700)
const MIN_CELLS = 1100;      // below this the arena is too small to play: scale it up
const MAX_DIM = 300;         // largest grid side
const MARGIN = 3;            // ocean cells left around the map
const HOLE_FILL = 250;       // enclosed water smaller than this becomes land
const BRIDGE_MAX = 16;       // join landmasses closer than this many cells
const MIN_ISLAND = 40;       // islands smaller than this are dropped unless bridged
// Antarctica, plus territories whose borders or status are disputed (the game is for a broad audience and takes no side): these are
// not offered as playable countries. Their land still appears on the world map.
const SKIP = new Set(['ATA', 'PSX', 'TWN', 'SAH', 'CYN', 'SOL', 'KOS', 'FLK']);
const BACKDROPS = ['#fcc90d', '#ff8a5b', '#5ec7a4', '#6aa7ff', '#ff6f91', '#b48cff', '#7ed957', '#ffb347', '#4fc3dc', '#f0647a', '#9ccc65', '#ffd166'];

if (!fs.existsSync(CACHE)) {
  console.error('downloading', URL);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, Buffer.from(await (await fetch(URL)).arrayBuffer()));
}
const data = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

// ---------- geometry helpers ----------
const polygonsOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };

function dp(points, tol) {                      // Douglas-Peucker on an open polyline
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const t = l2 ? Math.max(0, Math.min(1, ((points[i][0] - ax) * dx + (points[i][1] - ay) * dy) / l2)) : 0;
      const d = Math.hypot(points[i][0] - (ax + t * dx), points[i][1] - (ay + t * dy));
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------- rasterization (scanline, 3x3 supersampling) ----------
function rasterize(polys, nx, ny, toCell) {
  const S = 3, sx = nx * S, sy = ny * S, sub = new Uint8Array(sx * sy);
  for (const rings of polys) {
    const edges = [];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x0, y0] = toCell(r[j]), [x1, y1] = toCell(r[i]);
      if (y0 !== y1) edges.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]);
    }
    for (let j = 0; j < sy; j++) {
      const y = (j + 0.5) / S, xs = [];
      for (const [x0, y0, x1, y1] of edges) if (y >= y0 && y < y1) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] * S - 0.5)), b = Math.min(sx - 1, Math.floor(xs[k + 1] * S - 0.5));
        for (let c = a; c <= b; c++) sub[j * sx + c] = 1;
      }
    }
  }
  const land = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let hits = 0;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) hits += sub[(y * S + dy) * sx + x * S + dx];
    land[y * nx + x] = hits >= 3 ? 1 : 0;
  }
  return land;
}

// ---------- cleanup ----------
const discOffsets = (r) => { const o = []; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r + r) o.push([dx, dy]); return o; };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Grid {
  constructor(nx, ny, cells) { this.nx = nx; this.ny = ny; this.c = cells; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.nx && y < this.ny ? this.c[y * this.nx + x] : 0; }
  count() { let n = 0; for (const v of this.c) n += v; return n; }
  clone() { return new Grid(this.nx, this.ny, this.c.slice()); }
  dilate(offs) { const o = new Uint8Array(this.c.length); for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) { for (const [dx, dy] of offs) if (this.get(x + dx, y + dy)) { o[y * this.nx + x] = 1; break; } } return new Grid(this.nx, this.ny, o); }
  erode(offs) { const o = new Uint8Array(this.c.length); for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) { let all = 1; for (const [dx, dy] of offs) if (!this.get(x + dx, y + dy)) { all = 0; break; } o[y * this.nx + x] = all; } return new Grid(this.nx, this.ny, o); }
  components() {
    const { nx, ny, c } = this, seen = new Uint8Array(c.length), out = [];
    for (let i = 0; i < c.length; i++) {
      if (!c[i] || seen[i]) continue;
      const comp = [], st = [i]; seen[i] = 1;
      while (st.length) { const k = st.pop(); comp.push(k); const x = k % nx, y = (k / nx) | 0; for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a; if (c[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
      out.push(comp);
    }
    return out;
  }
  fillHoles(maxSize) {
    const { nx, ny, c } = this, seen = new Uint8Array(c.length);
    for (let i = 0; i < c.length; i++) {
      if (c[i] || seen[i]) continue;
      const comp = [], st = [i]; seen[i] = 1; let border = false;
      while (st.length) { const k = st.pop(); comp.push(k); const x = k % nx, y = (k / nx) | 0; if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) border = true; for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a; if (!c[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
      if (!border && comp.length < maxSize) for (const k of comp) c[k] = 1;
    }
  }
  tidy() {                                     // fill diagonal-only pinch points, remove cells with fewer than two land neighbours
    const { nx, ny, c } = this; let changed = true;
    while (changed) {
      changed = false;
      for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
        const a = c[y * nx + x], b = c[y * nx + x + 1], d = c[(y + 1) * nx + x], e = c[(y + 1) * nx + x + 1];
        if (a && e && !b && !d) { c[y * nx + x + 1] = 1; changed = true; } else if (b && d && !a && !e) { c[y * nx + x] = 1; changed = true; }
      }
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        if (!c[y * nx + x]) continue;
        let n = 0; for (const [dx, dy] of N4) n += this.get(x + dx, y + dy);
        if (n < 2) { c[y * nx + x] = 0; changed = true; }
      }
    }
  }
  clearMargin() { const { nx, ny, c } = this; for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (x < MARGIN || y < MARGIN || x >= nx - MARGIN || y >= ny - MARGIN) c[y * nx + x] = 0; }
  carve(a, b, offs) {                          // a wide land bridge between two cells
    const { nx, ny } = this; let x = a % nx, y = (a / nx) | 0; const x1 = b % nx, y1 = (b / nx) | 0; const path = [[x, y]];
    while (x !== x1 || y !== y1) { if (x !== x1 && Math.abs(x1 - x) >= Math.abs(y1 - y)) x += x1 > x ? 1 : -1; else if (y !== y1) y += y1 > y ? 1 : -1; else x += x1 > x ? 1 : -1; path.push([x, y]); }
    for (const [px, py] of path) for (const [dx, dy] of offs) { const X = px + dx, Y = py + dy; if (X >= 0 && Y >= 0 && X < nx && Y < ny) this.c[Y * nx + X] = 1; }
  }
}

function cleanup(raw, r) {
  const offs = r > 0 ? discOffsets(r) : null;
  let g = raw.clone();
  if (offs) g = g.dilate(offs).erode(offs);                  // closing: fill narrow channels and bays
  g.clearMargin();
  g.fillHoles(HOLE_FILL);
  if (offs) g = g.erode(offs).dilate(offs);                  // opening: remove land narrower than the width rule
  g.clearMargin();
  g.tidy();
  const bridge = discOffsets(Math.max(1, r));
  for (let guard = 0; guard < 40; guard++) {               // join nearby landmasses with wide bridges, drop the rest
    const comps = g.components().sort((a, b) => b.length - a.length);
    if (comps.length < 2) break;
    const main = comps[0]; let best = null;
    for (const comp of comps.slice(1)) {
      if (comp.length < MIN_ISLAND) continue;
      for (let i = 0; i < comp.length; i += 2) for (let j = 0; j < main.length; j += 2) {
        const ax = comp[i] % g.nx, ay = (comp[i] / g.nx) | 0, bx = main[j] % g.nx, by = (main[j] / g.nx) | 0, d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
        if (!best || d < best.d) best = { d, a: comp[i], b: main[j] };
      }
    }
    if (!best || best.d > BRIDGE_MAX) break;
    g.carve(best.a, best.b, bridge);
  }
  g.clearMargin(); g.tidy();
  const keep = g.components().sort((a, b) => b.length - a.length)[0] ?? [];
  const out = new Uint8Array(g.c.length); for (const k of keep) out[k] = 1;
  const res = new Grid(g.nx, g.ny, out); res.tidy();
  const final = res.components().sort((a, b) => b.length - a.length)[0] ?? [];
  const fin = new Uint8Array(g.c.length); for (const k of final) fin[k] = 1;
  return new Grid(g.nx, g.ny, fin);
}

/** Crop the grid to the land plus the ocean margin: distant territories that were dropped must not leave a huge empty grid. */
function crop(grid) {
  const { nx, ny, c } = grid; let x0 = nx, x1 = -1, y0 = ny, y1 = -1;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (c[y * nx + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return grid;
  x0 = Math.max(0, x0 - MARGIN); y0 = Math.max(0, y0 - MARGIN); x1 = Math.min(nx - 1, x1 + MARGIN); y1 = Math.min(ny - 1, y1 + MARGIN);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = c[(y + y0) * nx + x + x0];
  return new Grid(w, h, out);
}

function encode(grid) {
  const bytes = new Uint8Array(Math.ceil(grid.c.length / 8));
  for (let i = 0; i < grid.c.length; i++) if (grid.c[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  return Buffer.from(bytes).toString('base64');
}

function buildShape(polys, lon0, lon1, lat0, lat1) {
  const latMid = (lat0 + lat1) / 2, kx = Math.cos((latMid * Math.PI) / 180);
  const projArea = polys.reduce((s, rings) => s + rings.reduce((t, r, i) => t + (i === 0 ? 1 : -1) * ringArea(r.map(([x, y]) => [x * kx, y])), 0), 0);
  let scale = Math.sqrt(TARGET_CELLS / Math.max(projArea, 1e-6));                // cells per projected degree
  for (let attempt = 0; attempt < 4; attempt++) {
    const wDeg = (lon1 - lon0) * kx, hDeg = lat1 - lat0;
    const m = Math.max(wDeg * scale, hDeg * scale);
    if (m + 2 * MARGIN > MAX_DIM) scale *= (MAX_DIM - 2 * MARGIN) / m;
    const nx = Math.ceil(wDeg * scale) + 2 * MARGIN, ny = Math.ceil(hDeg * scale) + 2 * MARGIN;
    const toCell = ([lon, lat]) => [(lon - lon0) * kx * scale + MARGIN, (lat1 - lat) * scale + MARGIN];
    const raw = new Grid(nx, ny, rasterize(polys, nx, ny, toCell)), rawCount = raw.count();
    let best = null;
    for (const r of [2, 1, 0]) {                                                  // the widest width rule that keeps most of the country
      const g = cleanup(raw, r);
      best = { g, r };
      if (g.count() >= 0.55 * rawCount) break;
    }
    if (best.g.count() >= MIN_CELLS || attempt === 3 || m + 2 * MARGIN >= MAX_DIM) { const g = crop(best.g); return { nx: g.nx, ny: g.ny, grid: g, r: best.r }; }
    scale *= 1.35;                                                                // too small to play: zoom in
  }
}

// ---------- main ----------
const countries = [];
for (const f of data.features) {
  const p = f.properties, id = p.ADM0_A3;
  if (SKIP.has(id)) continue;
  let polys = polygonsOf(f.geometry).map(rings => rings.map(r => r.map(([x, y]) => [x, y])));
  const lons = polys.flat(2).map(pt => pt[0]);
  const crosses = Math.max(...lons) > 170 && Math.min(...lons) < -170;          // spans the antimeridian (Russia, Fiji, ...)
  const arenaPolys = crosses ? polys.map(rings => rings.map(r => r.map(([x, y]) => [x < 0 ? x + 360 : x, y]))) : polys;
  const pts = arenaPolys.flat(2);
  const lon0 = Math.min(...pts.map(q => q[0])), lon1 = Math.max(...pts.map(q => q[0])), lat0 = Math.min(...pts.map(q => q[1])), lat1 = Math.max(...pts.map(q => q[1]));
  const shape = buildShape(arenaPolys, lon0, lon1, lat0, lat1);
  const land = shape.grid.count();
  if (land < 400) { console.error('skipping (too small after cleanup):', p.NAME, land); continue; }

  // simplified outline for the picker, in true lon/lat (not shifted)
  const rings = polys.flatMap(poly => poly.slice(0, 1)).filter(r => ringArea(r) > 0.02 || polys.length === 1);
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  const outline = (rings.length ? rings : polys.flatMap(poly => poly.slice(0, 1)).slice(0, 1))
    .map(r => dp(r, 0.2).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])).filter(r => r.length >= 4);
  const big = polys.flatMap(poly => poly.slice(0, 1)).sort((a, b) => ringArea(b) - ringArea(a))[0];
  let cx = 0, cy = 0; for (const [x, y] of big) { cx += x; cy += y; } cx /= big.length; cy /= big.length;

  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  countries.push({ i: id, n: p.NAME, c: p.CONTINENT, w: shape.nx, h: shape.ny, r: shape.r, l: land, m: encode(shape.grid), b: BACKDROPS[h % BACKDROPS.length], p: outline, k: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10] });
  process.stderr.write(`${p.NAME.padEnd(34)} ${String(shape.nx).padStart(3)}x${String(shape.ny).padEnd(3)} land ${String(land).padStart(5)} width-rule ${shape.r}\n`);
}
countries.sort((a, b) => a.n.localeCompare(b.n));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: 1, countries }));
console.error(`\nwrote ${path.relative(process.cwd(), OUT)}: ${countries.length} countries, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
