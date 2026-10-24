// An immediate-mode drawer for flat shapes lying on the ground (X = a cell's x, Z = a cell's y, Y up): polygons, lines, circles and
// rings with their own colour and alpha, rebuilt every frame into ONE buffer geometry (one draw call, no allocation once it has grown
// to size). It stands in for PixiJS's Graphics for the small, changing things: the shield bubble, particles, the paper-plane slash.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, ShapeUtils, Vector2 } from 'three';

const CIRCLE_SEGMENTS = 28;

export class GroundBatch {
  readonly mesh: Mesh;
  private geo = new BufferGeometry();
  private pos = new Float32Array(3 * 1024);
  private col = new Float32Array(4 * 1024);
  private n = 0;                                 // vertices written so far this frame
  y: number;                                     // height above the floor everything is drawn at
  private r = 1; private g = 1; private b = 1;

  constructor(y = 0.4, renderOrder = 10) {
    this.y = y;
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 4).setUsage(35048));
    this.geo.setDrawRange(0, 0);
    const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder;
  }

  get vertexCount() { return this.n; }
  /** Start a new frame: forget everything drawn. */
  begin() { this.n = 0; }
  /** Upload what was drawn. */
  end() {
    this.geo.setDrawRange(0, this.n);
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as BufferAttribute).needsUpdate = true;
  }

  private grow(extra: number) {
    if (this.n + extra <= this.pos.length / 3) return;
    let cap = this.pos.length / 3;
    while (cap < this.n + extra) cap *= 2;
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4);
    pos.set(this.pos.subarray(0, this.n * 3)); col.set(this.col.subarray(0, this.n * 4));
    this.pos = pos; this.col = col;
    this.geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(35048));
    this.geo.setAttribute('color', new BufferAttribute(col, 4).setUsage(35048));
  }
  private setColor(color: number, alpha: number) { this.r = ((color >> 16) & 255) / 255; this.g = ((color >> 8) & 255) / 255; this.b = (color & 255) / 255; this.a = alpha; }
  private a = 1;
  private v(x: number, z: number) {
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = this.y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = this.r; this.col[i * 4 + 1] = this.g; this.col[i * 4 + 2] = this.b; this.col[i * 4 + 3] = this.a;
  }
  /** One triangle, wound so it faces up. */
  tri(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, color: number, alpha = 1) {
    this.grow(3); this.setColor(color, alpha);
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);            // in the XZ plane, up-facing means this is negative
    if (cross <= 0) { this.v(ax, az); this.v(bx, bz); this.v(cx, cz); } else { this.v(ax, az); this.v(cx, cz); this.v(bx, bz); }
  }
  /** A filled polygon from flat [x0, z0, x1, z1, ...] points (any simple polygon, convex or not). */
  poly(pts: number[], color: number, alpha = 1) {
    const n = pts.length / 2;
    if (n < 3) return;
    if (n === 3) { this.tri(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], color, alpha); return; }
    const contour: Vector2[] = []; for (let i = 0; i < n; i++) contour.push(new Vector2(pts[2 * i], pts[2 * i + 1]));
    for (const t of ShapeUtils.triangulateShape(contour, [])) this.tri(pts[2 * t[0]], pts[2 * t[0] + 1], pts[2 * t[1]], pts[2 * t[1] + 1], pts[2 * t[2]], pts[2 * t[2] + 1], color, alpha);
  }
  /** A filled disc. */
  circle(x: number, z: number, r: number, color: number, alpha = 1, segments = CIRCLE_SEGMENTS) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      this.tri(x, z, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, color, alpha);
    }
  }
  /** The outline of a circle: a ring `width` wide centred on radius `r`. */
  ring(x: number, z: number, r: number, width: number, color: number, alpha = 1, segments = CIRCLE_SEGMENTS) {
    const r0 = Math.max(0, r - width / 2), r1 = r + width / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.tri(x + c0 * r0, z + s0 * r0, x + c0 * r1, z + s0 * r1, x + c1 * r1, z + s1 * r1, color, alpha);
      this.tri(x + c0 * r0, z + s0 * r0, x + c1 * r1, z + s1 * r1, x + c1 * r0, z + s1 * r0, color, alpha);
    }
  }
  /** A straight line `width` wide, with round or flat ends. */
  line(x0: number, z0: number, x1: number, z1: number, width: number, color: number, alpha = 1, round = true) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len > 1e-9) {
      const nx = (-dz / len) * (width / 2), nz = (dx / len) * (width / 2);
      this.tri(x0 + nx, z0 + nz, x0 - nx, z0 - nz, x1 - nx, z1 - nz, color, alpha);
      this.tri(x0 + nx, z0 + nz, x1 - nx, z1 - nz, x1 + nx, z1 + nz, color, alpha);
    }
    if (round) { this.circle(x0, z0, width / 2, color, alpha, 10); this.circle(x1, z1, width / 2, color, alpha, 10); }
  }
  /** A polyline of `width`, round ends, drawn as joined segments. */
  polyline(pts: number[], width: number, color: number, alpha = 1) {
    for (let i = 0; i + 3 < pts.length; i += 2) this.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], width, color, alpha, true);
  }
  dispose() { this.geo.dispose(); (this.mesh.material as MeshBasicMaterial).dispose(); }
}
