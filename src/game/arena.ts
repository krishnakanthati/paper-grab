// The arena grid: the world-shaped set of playable cells, a smooth distance-like field for gliding along its
// curved coast, and small cell helpers.
import { EDGE_HUG } from '../config.ts';
import { decodeMask, type ArenaShape } from '../data/shape.ts';
import { marchingSquares, type Loop } from '../geometry/index.ts';
import type { Arena, Ctx, Player } from './types.ts';

export const idx = (g: { NX: number }, x: number, y: number) => y * g.NX + x;
export const cellOf = (g: { NX: number }, p: Player) => idx(g, Math.floor(p.x), Math.floor(p.y));

// The boundary is a smoothed signed distance field: positive inland (distance in cells from the coast), negative at sea,
// zero exactly at the coast. Because it measures real distance, "stay D cells from the coast" is a true constant gap:
//   - heads hug the contour at depth HEAD_DEPTH,
//   - the coast on screen is drawn from the zero contour of the very same field (arena.coast()),
// so the gap between a head's path and the drawn edge is the same everywhere, at every bend.
const SIGMA = 1.0;                // smoothing of the distance field (cells): rounds the coast, removes the cell staircase
export const HEAD_DEPTH = EDGE_HUG;   // how far inland a head's centre stays (see config)
const COAST_STEP = 0.3;           // sampling step (cells) when extracting the coast outline

/** Felzenszwalb exact squared Euclidean distance transform of one row/column. */
function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

/** Squared distance from every cell to the nearest cell where `isSource` is true. */
function squaredDistance(NX: number, NY: number, isSource: (i: number) => boolean): Float64Array {
  const INF = 1e12, d = new Float64Array(NX * NY);
  for (let i = 0; i < d.length; i++) d[i] = isSource(i) ? 0 : INF;
  const m = Math.max(NX, NY), f = new Float64Array(m), o = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) f[y] = d[y * NX + x];
    edt1d(f, NY, o, v, z);
    for (let y = 0; y < NY; y++) d[y * NX + x] = o[y];
  }
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) f[x] = d[y * NX + x];
    edt1d(f, NX, o, v, z);
    for (let x = 0; x < NX; x++) d[y * NX + x] = o[x];
  }
  return d;
}

function gaussianKernel(): number[] {
  const r = Math.ceil(SIGMA * 3), k: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * SIGMA * SIGMA)); k.push(v); sum += v; }
  return k.map(v => v / sum);
}

/** Signed distance to the coast (cells), then lightly blurred. The map keeps an ocean margin, so clamping the edges is safe. */
function distanceField(land: Uint8Array, NX: number, NY: number): Float32Array {
  const toWater = squaredDistance(NX, NY, i => land[i] === 0), toLand = squaredDistance(NX, NY, i => land[i] === 1);
  const sdf = new Float32Array(NX * NY);
  for (let i = 0; i < sdf.length; i++) sdf[i] = land[i] ? Math.sqrt(toWater[i]) - 0.5 : -(Math.sqrt(toLand[i]) - 0.5);
  const k = gaussianKernel(), r = (k.length - 1) / 2;
  const tmp = new Float32Array(NX * NY), out = new Float32Array(NX * NY);
  for (let y = 0; y < NY; y++)
    for (let x = 0; x < NX; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += sdf[y * NX + Math.min(NX - 1, Math.max(0, x + i))] * k[i + r];
      tmp[y * NX + x] = s;
    }
  for (let y = 0; y < NY; y++)
    for (let x = 0; x < NX; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[Math.min(NY - 1, Math.max(0, y + i)) * NX + x] * k[i + r];
      out[y * NX + x] = s;
    }
  return out;
}

export interface BuiltArena { land: Uint8Array; landCount: number; arena: Arena }

const cache = new Map<string, BuiltArena>();
/** A shape never changes, so it is built once and shared by every game that uses it (the build is the slow part of starting one). */
export function buildArena(shape: ArenaShape): BuiltArena {
  let b = cache.get(shape.id);
  if (!b) { b = buildArenaOnce(shape); cache.set(shape.id, b); }
  return b;
}

function buildArenaOnce(shape: ArenaShape): BuiltArena {
  const NX = shape.nx, NY = shape.ny;
  const land = decodeMask(shape);
  let landCount = 0;
  for (let i = 0; i < land.length; i++) landCount += land[i];
  const field = distanceField(land, NX, NY);

  // Catmull-Rom bicubic sample; (x, y) are cell coordinates, values live at cell centres. Bilinear would put a kink
  // in the gradient at every cell boundary and make a sliding head's direction wobble; bicubic is smooth in value and slope.
  const at = (cx: number, cy: number) => field[Math.min(NY - 1, Math.max(0, cy)) * NX + Math.min(NX - 1, Math.max(0, cx))];
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const rowAt = (yy: number, x0: number, tx: number) => cubic(at(x0 - 1, yy), at(x0, yy), at(x0 + 1, yy), at(x0 + 2, yy), tx);
  const sample = (x: number, y: number) => {
    const fx = x - 0.5, fy = y - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    return cubic(rowAt(y0 - 1, x0, tx), rowAt(y0, x0, tx), rowAt(y0 + 1, x0, tx), rowAt(y0 + 2, x0, tx), ty);
  };
  // The coast as drawn (zero contour of the smooth field) and an exact distance to it. Near the coast, "depth" is the
  // true Euclidean distance to the drawn line, so a head hugging depth D is exactly D from the edge at every bend and
  // sharp tip. The smooth field is used only far from the coast, where precision does not matter.
  const loops = marchingSquares(sample, NX, NY, 0, COAST_STEP);
  const segs: number[] = [];                                // flat [ax, ay, bx, by, ...]
  for (const l of loops) {
    const n = l.pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      segs.push(l.pts[i * 2], l.pts[i * 2 + 1], l.pts[j * 2], l.pts[j * 2 + 1]);
    }
  }
  // Segments bucketed per 1-cell square into flat arrays (start offsets + a list of segment ids): a lookup is two array reads,
  // not a Map hit, and this is by far the hottest code in the game (every head asks "how far from the coast?" many times a tick).
  const GW = NX + 2, GH = NY + 2;                           // a one-cell apron, so a segment lying exactly on the grid edge is still found
  const cellIndex = (cx: number, cy: number) => (cy + 1) * GW + (cx + 1);
  const eachCell = (k: number, visit: (index: number) => void) => {
    const ax = segs[k * 4], ay = segs[k * 4 + 1], bx = segs[k * 4 + 2], by = segs[k * 4 + 3];
    const x0 = Math.max(-1, Math.floor(Math.min(ax, bx))), x1 = Math.min(NX, Math.floor(Math.max(ax, bx)));
    const y0 = Math.max(-1, Math.floor(Math.min(ay, by))), y1 = Math.min(NY, Math.floor(Math.max(ay, by)));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) visit(cellIndex(cx, cy));
  };
  const cellStart = new Int32Array(GW * GH + 1);
  const segCount = segs.length / 4;
  for (let k = 0; k < segCount; k++) eachCell(k, i => { cellStart[i + 1]++; });
  for (let i = 0; i < GW * GH; i++) cellStart[i + 1] += cellStart[i];
  const cellSegs = new Int32Array(cellStart[GW * GH]), fill = cellStart.slice(0, GW * GH);
  for (let k = 0; k < segCount; k++) eachCell(k, i => { cellSegs[fill[i]++] = k; });

  let nearX = 0, nearY = 0;                                 // the closest point on the coast found by the last exactDistance call
  const exactDistance = (x: number, y: number): number => {
    const cx = Math.floor(x), cy = Math.floor(y);
    let best2 = Infinity;
    for (let r = 1; r <= 4; r++) {                          // widen the search ring only while nothing close enough was found
      for (let yy = Math.max(-1, cy - r); yy <= Math.min(NY, cy + r); yy++) {
        const edgeRow = Math.abs(yy - cy) === r;
        for (let xx = Math.max(-1, cx - r); xx <= Math.min(NX, cx + r); xx++) {
          if (r > 1 && !edgeRow && Math.abs(xx - cx) !== r) continue;                     // after the first pass, only the new ring
          const c = cellIndex(xx, yy);
          for (let q = cellStart[c], end = cellStart[c + 1]; q < end; q++) {
            const k = cellSegs[q] * 4, ax = segs[k], ay = segs[k + 1], dx = segs[k + 2] - ax, dy = segs[k + 3] - ay, l2 = dx * dx + dy * dy;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
            const px = ax + t * dx, py = ay + t * dy, d2 = (x - px) * (x - px) + (y - py) * (y - py);
            if (d2 < best2) { best2 = d2; nearX = px; nearY = py; }
          }
        }
      }
      if (best2 <= r * r) break;                            // anything not yet searched is farther than r cells
    }
    return Math.sqrt(best2);
  };
  const FAR = 2.6;                                          // beyond this many cells from the coast the smooth field is good enough
  const depth = (x: number, y: number): number => {
    const c = sample(x, y);
    if (c > FAR || c < -FAR) return c;
    const d = exactDistance(x, y);
    return Number.isFinite(d) ? (c >= 0 ? d : -d) : c;
  };

  const E = 0.1;
  // (A closed-form gradient from the nearest coast point was tried and rejected: it changed how heads slide round tips and
  // bends, and the coast tests caught it. The finite difference of depth below is smoother there, so it stays.)
  const gradient = (x: number, y: number): [number, number] =>
    [(depth(x + E, y) - depth(x - E, y)) / (2 * E), (depth(x, y + E) - depth(x, y - E)) / (2 * E)];   // unit length: it is a distance

  const arena: Arena = {
    inside(x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      // Distance alone decides where a head may stand: the drawn coast is a smooth curve and can bulge a little past the
      // cell mask at bends, so requiring a land CELL as well made the head refuse legal steps and reverse there.
      return cx >= 0 && cy >= 0 && cx < NX && cy < NY && depth(x, y) >= HEAD_DEPTH - 1e-6;
    },
    depth,
    inward(x, y) {
      const [gx, gy] = gradient(x, y);
      const g = Math.hypot(gx, gy);
      if (g < 1e-5) { const dx = NX / 2 - x, dy = NY / 2 - y, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
      return [gx / g, gy / g];
    },
    snap(x, y) {
      // Newton steps along the gradient onto depth == HEAD_DEPTH (+ a hair, so the result is legal)
      const target = HEAD_DEPTH + 0.002;
      for (let i = 0; i < 4; i++) {
        const [gx, gy] = gradient(x, y), g = Math.hypot(gx, gy);
        if (g < 1e-4) break;
        const d = (target - depth(x, y)) / g;
        x += (gx / g) * d; y += (gy / g) * d;
      }
      return [x, y];
    },
    coast: () => loops,
  };
  return { land, landCount, arena };
}

/** Territory changed for this player: tell the renderer (version) and force a recount. */
export function bump(g: Ctx, id: number) { g.ver[id]++; g.countsDirty = true; }

export function recount(g: Ctx) {
  g.countsDirty = false;
  g.counts.fill(0);
  for (let i = 0; i < g.owner.length; i++) if (g.owner[i]) g.counts[g.owner[i]]++;
}
