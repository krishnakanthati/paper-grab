// Grouping loops into shapes (an outer boundary plus the holes inside it) for fill-then-cut drawing.
import type { Loop } from './trace.ts';

export function pointInPoly(pts: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface Shape { outer: Loop; holes: Loop[] }

// Pair each hole with the smallest outer boundary that contains it, ready for fill-then-cut drawing.
export function groupShapes(loops: Loop[]): Shape[] {
  const shapes: Shape[] = loops.filter(l => !l.hole).map(outer => ({ outer, holes: [] }));
  for (const hole of loops.filter(l => l.hole)) {
    let parent: Shape | null = null;
    for (const s of shapes) {
      if (s.outer.area <= hole.area) continue;
      if (!pointInPoly(s.outer.pts, hole.pts[0], hole.pts[1])) continue;
      if (!parent || s.outer.area < parent.outer.area) parent = s;
    }
    if (parent) parent.holes.push(hole);
  }
  return shapes;
}
