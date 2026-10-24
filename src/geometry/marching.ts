// Marching squares: extracts the closed outline(s) where a smooth scalar field crosses a level, as polygons with the
// inside (value above the level) on the right, in the same convention as trace.ts (outer loops have positive area).
// Used to draw the coast as the exact zero level of the same field the heads hug, so the gap between a head's path
// and the drawn edge is a true constant.
import type { Loop } from './trace.ts';

export function marchingSquares(
  sample: (x: number, y: number) => number, w: number, h: number, level: number, step: number,
): Loop[] {
  const gw = Math.ceil(w / step) + 1, gh = Math.ceil(h / step) + 1;
  const v = new Float32Array(gw * gh);
  // a tiny nudge keeps every grid corner strictly above or below the level: no degenerate zero-length segments
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) v[j * gw + i] = sample(i * step, j * step) - level + 1e-6;

  // an edge point is identified by its grid edge: horizontal (i,j)-(i+1,j) = 2*(j*gw+i), vertical (i,j)-(i,j+1) = 2*(j*gw+i)+1
  const pt = new Map<number, [number, number]>();
  const edgePoint = (key: number): [number, number] => {
    let p = pt.get(key);
    if (p) return p;
    const horizontal = (key & 1) === 0, cell = key >> 1, i = cell % gw, j = (cell / gw) | 0;
    const a = v[j * gw + i], b = horizontal ? v[j * gw + i + 1] : v[(j + 1) * gw + i];
    const t = a / (a - b);
    p = horizontal ? [(i + t) * step, j * step] : [i * step, (j + t) * step];
    pt.set(key, p);
    return p;
  };

  const next = new Map<number, number>();                  // edge point -> the edge point the outline continues to
  const link = (p: number, q: number, corners: Array<[number, number]>) => {
    const [px, py] = edgePoint(p), [qx, qy] = edgePoint(q);
    // orient so an inside corner (the one nearest this segment) is on the right-hand side
    const mx = (px + qx) / 2, my = (py + qy) / 2;
    let c = corners[0], best = Infinity;
    for (const k of corners) { const d = Math.hypot(k[0] - mx, k[1] - my); if (d < best) { best = d; c = k; } }
    const cross = (qx - px) * (c[1] - py) - (qy - py) * (c[0] - px);
    if (cross > 0) next.set(p, q); else next.set(q, p);
  };

  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const tl = v[j * gw + i], tr = v[j * gw + i + 1], br = v[(j + 1) * gw + i + 1], bl = v[(j + 1) * gw + i];
      const sTL = tl > 0, sTR = tr > 0, sBR = br > 0, sBL = bl > 0;
      if (sTL === sTR && sTR === sBR && sBR === sBL) continue;
      const T = 2 * (j * gw + i), R = 2 * (j * gw + i + 1) + 1, B = 2 * ((j + 1) * gw + i), L = 2 * (j * gw + i) + 1;
      const inside: Array<[number, number]> = [];
      if (sTL) inside.push([i * step, j * step]);
      if (sTR) inside.push([(i + 1) * step, j * step]);
      if (sBR) inside.push([(i + 1) * step, (j + 1) * step]);
      if (sBL) inside.push([i * step, (j + 1) * step]);
      const crossings: number[] = [];
      if (sTL !== sTR) crossings.push(T);
      if (sTR !== sBR) crossings.push(R);
      if (sBL !== sBR) crossings.push(B);
      if (sTL !== sBL) crossings.push(L);
      if (crossings.length === 2) link(crossings[0], crossings[1], inside);
      else {                                                   // saddle: two inside corners on a diagonal; the centre value decides which way they connect
        const centreInside = (tl + tr + br + bl) / 4 > 0;
        if (sTL) {                                             // TL and BR inside
          if (centreInside) { link(T, R, [[i * step, j * step], [(i + 1) * step, (j + 1) * step]]); link(B, L, [[i * step, j * step], [(i + 1) * step, (j + 1) * step]]); }
          else { link(T, L, [[i * step, j * step]]); link(B, R, [[(i + 1) * step, (j + 1) * step]]); }
        } else {                                               // TR and BL inside
          if (centreInside) { link(T, L, [[(i + 1) * step, j * step], [i * step, (j + 1) * step]]); link(B, R, [[(i + 1) * step, j * step], [i * step, (j + 1) * step]]); }
          else { link(T, R, [[(i + 1) * step, j * step]]); link(B, L, [[i * step, (j + 1) * step]]); }
        }
      }
    }

  const loops: Loop[] = [];
  const done = new Set<number>();
  for (const start of next.keys()) {
    if (done.has(start)) continue;
    const pts: number[] = [];
    let k = start;
    for (let guard = 0; guard < next.size + 2; guard++) {
      done.add(k);
      const p = edgePoint(k);
      pts.push(p[0], p[1]);
      const n = next.get(k);
      if (n === undefined || n === start) break;
      k = n;
    }
    let area = 0;
    for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; }
    area /= 2;
    if (pts.length >= 6) loops.push({ pts, hole: area < 0, area: Math.abs(area) });
  }
  return loops;
}
