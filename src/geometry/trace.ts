// Boundary tracing: turns a set of grid cells into closed outline loops, interior always on the right (y-down).
import { densify, taubin } from './smoothing.ts';

export interface Loop {
  pts: number[];     // flat [x0, y0, x1, y1, ...] in cell units, already smoothed
  hole: boolean;     // true for a boundary around empty space inside the region
  area: number;      // absolute area of the raw (unsmoothed) loop, in cells
}

export function traceLoops(
  w: number, h: number, inside: (x: number, y: number) => boolean, smoothing = 60,
): Loop[] {
  const ins = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  const V = w + 1;

  // unit edges, each stored as [startVertex, endVertex]; interior is on the right-hand side
  const from: number[] = [], to: number[] = [];
  const byStart = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const e = from.length, a = y0 * V + x0;
    from.push(a); to.push(y1 * V + x1);
    const list = byStart.get(a);
    if (list) list.push(e); else byStart.set(a, [e]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!ins(x, y)) continue;
      if (!ins(x, y - 1)) add(x, y, x + 1, y);
      if (!ins(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!ins(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!ins(x - 1, y)) add(x, y + 1, x, y);
    }

  const used = new Uint8Array(from.length);
  const dirOf = (e: number): [number, number] => {
    const a = from[e], b = to[e];
    return [(b % V) - (a % V), ((b / V) | 0) - ((a / V) | 0)];
  };

  const loops: Loop[] = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const raw: number[] = [];
    let e = e0;
    for (;;) {
      used[e] = 1;
      raw.push(from[e] % V, (from[e] / V) | 0);
      const end = to[e];
      const [dx, dy] = dirOf(e);
      // at a pinch point (two cells touching only diagonally) prefer the right turn, keeping them separate shapes
      let next = -1, bestCross = -2;
      for (const c of byStart.get(end) ?? []) {
        if (used[c] && c !== e0) continue;
        const [cx, cy] = dirOf(c);
        const cross = dx * cy - dy * cx;
        if (cross > bestCross) { bestCross = cross; next = c; }
      }
      if (next === -1 || next === e0) break;
      e = next;
    }

    let area = 0;                                      // shoelace; positive = clockwise on a y-down screen = outer boundary
    for (let i = 0; i < raw.length; i += 2) {
      const j = (i + 2) % raw.length;
      area += raw[i] * raw[j + 1] - raw[j] * raw[i + 1];
    }
    area /= 2;

    // 2x more points, then many Taubin passes (tuned by measurement): the smoothing reaches over several cells, so
    // 1-cell staircases flatten into true curves and small patches become round, while the shape keeps its size
    const pts = smoothing === 0 ? raw : taubin(densify(raw, 1), smoothing);
    loops.push({ pts, hole: area < 0, area: Math.abs(area) });
  }
  return loops;
}
