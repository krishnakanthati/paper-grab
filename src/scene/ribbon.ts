// A polyline turned into a flat ribbon of triangles lying on the ground (X = x, Z = y, Y up): constant width, mitred corners (the
// miter is limited so a sharp turn cannot spike), optionally closed into a loop. Pure maths on plain arrays, so it is testable in Node
// and cheap enough to rebuild every tick for a long line.

export interface Ribbon { positions: Float32Array; indices: Uint32Array; vertexCount: number }

/**
 * `pts` is flat [x0, z0, x1, z1, ...]. Returns two vertices per point (left and right of the line) and the triangles between them.
 * `closed` joins the last point back to the first.
 */
export function buildRibbon(pts: number[], width: number, y: number, closed = false, miterLimit = 2): Ribbon {
  const n = pts.length / 2;
  const positions = new Float32Array(n * 2 * 3);
  if (n < 2) return { positions, indices: new Uint32Array(0), vertexCount: 0 };
  for (let i = 0; i < n; i++) ribbonPair(pts, i, n, width, y, closed, positions, i * 6, miterLimit);
  return { positions, indices: ribbonIndices(n, closed), vertexCount: n * 2 };
}

/** The triangle indices for a ribbon of `n` points (two vertices per point). */
export function ribbonIndices(n: number, closed = false): Uint32Array {
  const segs = n < 2 ? 0 : closed ? n : n - 1, indices = new Uint32Array(segs * 6);
  for (let i = 0; i < segs; i++) {
    const a = 2 * i, b = 2 * ((i + 1) % n), o = i * 6;
    indices[o] = a; indices[o + 1] = a + 1; indices[o + 2] = b;
    indices[o + 3] = a + 1; indices[o + 4] = b + 1; indices[o + 5] = b;
  }
  return indices;
}

/**
 * The two vertices (left and right of the line) for point `i` of `n`, written into `out` at offset `o` (x, y, z, x, y, z): the miter
 * between the segment before and the one after, limited so a sharp turn cannot spike. Ends use their one segment.
 */
export function ribbonPair(pts: number[], i: number, n: number, width: number, y: number, closed: boolean, out: Float32Array, o: number, miterLimit = 2) {
  const half = width / 2;
  const p = closed ? (i + n - 1) % n : Math.max(0, i - 1), q = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  let ax = pts[2 * i] - pts[2 * p], az = pts[2 * i + 1] - pts[2 * p + 1], bx = pts[2 * q] - pts[2 * i], bz = pts[2 * q + 1] - pts[2 * i + 1];
  let la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
  if (la < 1e-9) { ax = bx; az = bz; la = lb; }
  if (lb < 1e-9) { bx = ax; bz = az; lb = la; }
  ax /= la || 1; az /= la || 1; bx /= lb || 1; bz /= lb || 1;
  const n1x = -az, n1z = ax, n2x = -bz, n2z = bx;                          // the normal of each of the two segments meeting here, and their average (the miter direction)
  let mx = n1x + n2x, mz = n1z + n2z;
  const ml = Math.hypot(mx, mz);
  if (ml < 1e-6) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
  const cos = Math.max(0.2, mx * n1x + mz * n1z);                           // how much longer the miter is than the half width
  const scale = Math.min(miterLimit, 1 / cos) * half;
  out[o] = pts[2 * i] + mx * scale; out[o + 1] = y; out[o + 2] = pts[2 * i + 1] + mz * scale;
  out[o + 3] = pts[2 * i] - mx * scale; out[o + 4] = y; out[o + 5] = pts[2 * i + 1] - mz * scale;
}

/** The signed area of a flat polygon (positive = clockwise on a y-down screen), to know which way a ribbon's triangles face. */
export function polygonArea(pts: number[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; }
  return a / 2;
}
