// The path a leader has walked, remembered so captives can follow exactly where it went: `at(back)` is the point that
// far behind the head along that path, and the direction of travel there. Pure maths, no Three.js.
export interface TrailPoint { x: number; y: number; angle: number }

export class Trail {
  private pts: number[] = [];                  // flat [x0,y0,...], oldest first
  private hx = 0; private hy = 0; private has = false;
  readonly step: number;

  constructor(step: number) { this.step = step; }

  /** Record the head's position; the path only grows once the head has moved `step` since the last remembered point. */
  push(x: number, y: number) {
    this.hx = x; this.hy = y;
    if (!this.has) { this.pts.push(x, y); this.has = true; return; }
    const n = this.pts.length;
    if (Math.hypot(x - this.pts[n - 2], y - this.pts[n - 1]) >= this.step) this.pts.push(x, y);
  }

  /** Forget the old path (a new life, or the head jumped). */
  reset() { this.pts = []; this.has = false; }

  /** Drop path older than `keep` cells behind the head, so memory stays small however long the game runs. */
  trim(keep: number) {
    let acc = 0, i = this.pts.length - 2, px = this.hx, py = this.hy;
    for (; i >= 0; i -= 2) { acc += Math.hypot(px - this.pts[i], py - this.pts[i + 1]); px = this.pts[i]; py = this.pts[i + 1]; if (acc > keep) break; }
    if (i > 2) this.pts.splice(0, i - 2);
  }

  /** The point `back` cells behind the head along the walked path. Before the path is that long it is the oldest point. */
  at(back: number): TrailPoint {
    let px = this.hx, py = this.hy, left = Math.max(0, back);
    let angle = 0;
    for (let i = this.pts.length - 2; i >= 0; i -= 2) {
      const x = this.pts[i], y = this.pts[i + 1], seg = Math.hypot(px - x, py - y);
      if (seg > 1e-9) angle = Math.atan2(py - y, px - x);       // the direction we were travelling along this stretch
      if (seg >= left && seg > 1e-9) { const t = left / seg; return { x: px + (x - px) * t, y: py + (y - py) * t, angle }; }
      left -= seg; px = x; py = y;
    }
    return { x: px, y: py, angle };
  }

  /** The points `offset + spacing`, `offset + 2*spacing`, ... `count` of them behind the head, found in ONE walk back along the path (cheaper than `count` separate `at` calls). */
  slots(count: number, spacing: number, offset = 0): TrailPoint[] {
    const out: TrailPoint[] = [];
    let px = this.hx, py = this.hy, angle = 0, walked = 0, next = offset + spacing;
    for (let i = this.pts.length - 2; i >= 0 && out.length < count; i -= 2) {
      const x = this.pts[i], y = this.pts[i + 1], seg = Math.hypot(px - x, py - y);
      if (seg > 1e-9) {
        angle = Math.atan2(py - y, px - x);
        while (out.length < count && walked + seg >= next) { const t = (next - walked) / seg; out.push({ x: px + (x - px) * t, y: py + (y - py) * t, angle }); next += spacing; }
      }
      walked += seg; px = x; py = y;
    }
    while (out.length < count) out.push({ x: px, y: py, angle });       // the path is not that long yet: the rest wait at its start
    return out;
  }
}
