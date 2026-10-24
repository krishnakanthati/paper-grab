// The arena as a flat sheet of paper on the sea: a soft layered drop shadow, a light halo with a crisp blue edge (drawn UNDER the floor,
// so only the outer half shows), and the floor itself, which also writes the stencil that clips everything else to the coast.
// Built once. The sea is simply everything outside it (the scene background shows there).
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { groupShapes } from '../geometry/index.ts';
import type { Game } from '../game/index.ts';
import { ARENA_SHADOW, BORDER, HALO, SEA } from '../render/palette.ts';
import { flatGeometry, offsetShapes } from './groundShapes.ts';
import { buildRibbon } from './ribbon.ts';
import { writeFloorStencil } from './stencil.ts';

export const FLOOR = { halo: 1.8, edge: 0.4, shadows: [[0.2, 0.42, 0.12], [0.1, 0.22, 0.16]] as const };

export function createFloor3D(game: Game) {
  const loops = game.arena.coast();                  // the exact zero contour of the field the heads hug
  const shapes = groupShapes(loops);
  const group = new Group();
  const disposables: Array<{ dispose(): void }> = [];
  const add = (geo: BufferGeometry, color: number, y: number, order: number, opts: { alpha?: number; stencil?: boolean } = {}) => {
    const mat = new MeshBasicMaterial({ color, side: DoubleSide, transparent: opts.alpha !== undefined, opacity: opts.alpha ?? 1, depthWrite: opts.alpha === undefined });
    if (opts.stencil) Object.assign(mat, writeFloorStencil);
    const mesh = new Mesh(geo, mat); mesh.position.y = y; mesh.renderOrder = order; mesh.frustumCulled = false;
    group.add(mesh); disposables.push(geo, mat);
    return mesh;
  };

  for (const [dx, dz, a] of FLOOR.shadows) add(flatGeometry(offsetShapes(shapes, dx, dz), 0), ARENA_SHADOW, -0.04, -4, { alpha: a });   // soft layered drop shadow
  const ribbonGeo = (width: number) => {
    const pos: number[] = [], idx: number[] = [];
    for (const l of loops) {
      const r = buildRibbon(l.pts, width, 0, true), b = pos.length / 3;
      for (let i = 0; i < r.positions.length; i++) pos.push(r.positions[i]);
      for (let i = 0; i < r.indices.length; i++) idx.push(b + r.indices[i]);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); return g;
  };
  add(ribbonGeo(FLOOR.halo), HALO, -0.02, -3);       // the rim sits below the floor: only its outer half is seen
  add(ribbonGeo(FLOOR.edge), BORDER, -0.01, -2);
  add(flatGeometry(shapes, 0), SEA, 0, -1, { stencil: true });
  return { group, dispose() { for (const d of disposables) d.dispose(); } };
}
export type Floor3D = ReturnType<typeof createFloor3D>;
