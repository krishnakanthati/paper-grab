// Turning outlines (loops of cell coordinates, interior on the right, holes as their own loops) into geometry on the ground:
// X = a cell's x, Z = a cell's y, Y up. Pure geometry, no renderer: shared by the arena floor, the territories and their fades.
import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three';
import type { Shape } from '../geometry/index.ts';

const v2 = (pts: number[]) => { const out: Vector2[] = []; for (let i = 0; i < pts.length; i += 2) out.push(new Vector2(pts[i], pts[i + 1])); return out; };

/** The flat top of some shapes (outer boundary with holes cut out) at height `y`. UVs are the ground position over `uvCells` (so a texture tile spans that many cells). */
export function flatGeometry(shapes: Shape[], y: number, uvCells = 2): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const s of shapes) {
    const contour = v2(s.outer.pts), holes = s.holes.map(h => v2(h.pts)), all = [...contour, ...holes.flat()];
    const base = pos.length / 3;
    for (const p of all) { pos.push(p.x, y, p.y); uv.push(p.x / uvCells, p.y / uvCells); }
    for (const t of ShapeUtils.triangulateShape(contour, holes)) idx.push(base + t[0], base + t[1], base + t[2]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

/** The same shapes offset by (dx, dz): a drop shadow's footprint. */
export function offsetShapes(shapes: Shape[], dx: number, dz: number): Shape[] {
  const move = (l: { pts: number[]; hole: boolean; area: number }) => ({ ...l, pts: l.pts.map((v, i) => v + (i % 2 ? dz : dx)) });
  return shapes.map(s => ({ outer: move(s.outer), holes: s.holes.map(move) }));
}

/** The side wall under every edge of every loop of these shapes, from height `y0` up to `y1`: what gives a slab its thickness. */
export function wallGeometry(shapes: Shape[], y0: number, y1: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (const s of shapes) for (const loop of [s.outer, ...s.holes]) {
    const p = loop.pts, n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, b = pos.length / 3;
      pos.push(p[2 * i], y1, p[2 * i + 1], p[2 * j], y1, p[2 * j + 1], p[2 * j], y0, p[2 * j + 1], p[2 * i], y0, p[2 * i + 1]);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}
