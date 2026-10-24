// Corner and staircase smoothing for closed polylines (flat [x0, y0, x1, y1, ...]).

// Taubin lambda|mu smoothing: a shrinking pass followed by a slightly stronger expanding pass, repeated.
export function taubin(p: number[], pairs: number): number[] {
  const n = p.length / 2;
  let a = p.slice(), b = new Array<number>(p.length);
  const pass = (src: number[], dst: number[], k: number) => {
    for (let i = 0; i < n; i++) {
      const pv = ((i + n - 1) % n) * 2, nx = ((i + 1) % n) * 2, c = i * 2;
      dst[c] = src[c] + k * ((src[pv] + src[nx]) / 2 - src[c]);
      dst[c + 1] = src[c + 1] + k * ((src[pv + 1] + src[nx + 1]) / 2 - src[c + 1]);
    }
  };
  for (let s = 0; s < pairs; s++) { pass(a, b, 0.5); pass(b, a, -0.53); }
  return a;
}

export function chaikinN(p: number[], times: number): number[] {
  for (let i = 0; i < times; i++) p = chaikin(p);
  return p;
}

export function chaikin(p: number[]): number[] {
  const n = p.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1];
    out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
  }
  return out;
}

/** Insert the midpoint of every edge of a closed loop, `times` times (each pass doubles the point count). */
export function densify(p: number[], times: number): number[] {
  for (let t = 0; t < times; t++) {
    const n = p.length / 2, out: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j * 2]) / 2, (p[i * 2 + 1] + p[j * 2 + 1]) / 2);
    }
    p = out;
  }
  return p;
}

/** Chaikin corner-cutting for an OPEN polyline: smooths the bends but keeps both end points exactly where they are. */
export function chaikinOpen(p: number[], times: number): number[] {
  for (let t = 0; t < times; t++) {
    const n = p.length / 2;
    if (n < 3) return p;
    const out: number[] = [p[0], p[1]];
    for (let i = 0; i < n - 1; i++) {
      const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[i * 2 + 2], by = p[i * 2 + 3];
      if (i > 0) out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by);
      if (i < n - 2) out.push(0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
    }
    out.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
    p = out;
  }
  return p;
}
