// Each player's land as a thin raised slab on the ground: a patterned top, a darker side wall (the 2.5D thickness), a darker outline
// and a faint shadow. A player's slab is rebuilt only when that player's land version changes, a few per frame. Newly claimed land is
// coloured in like ink spreading from the head: a "ghost" of what it used to look like lies on top and is wiped away by a growing
// circle (in the fragment shader) while it fades. Everything is clipped to the coast by the stencil (see stencil.ts).
import {
  CanvasTexture, Color, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, RedFormat, RepeatWrapping, ShaderMaterial, SRGBColorSpace, UnsignedByteType, Vector2, type BufferGeometry, type Texture,
} from 'three';
import { EFFECTS } from '../config.ts';
import { groupShapes, traceLoops } from '../geometry/index.ts';
import type { Game } from '../game/index.ts';
import { INK_SHADOW, SEA, colorOf, darken, lighten } from '../render/palette.ts';
import { patternCanvas, patternTint } from '../render/patterns.ts';
import { buildRibbon } from './ribbon.ts';
import { clipToFloor } from './stencil.ts';
import { flatGeometry, offsetShapes, wallGeometry } from './groundShapes.ts';
import { BufferAttribute, BufferGeometry as BG } from 'three';

export const SLAB = { height: 0.1, outlineWidth: 0.14, shadowOffset: [0.12, 0.62] as const, shadowAlpha: 0.12 };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const GHOST_VERT = `varying vec2 vXZ;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
/** The ghost is wiped away cell by cell: each cell's number in `uMask` (0..1) is when the ink reaches it, `uProg` is how far the ink has got. */
const GHOST_FRAG = `uniform vec3 uColor; uniform sampler2D uMask; uniform vec2 uGrid; uniform float uProg; uniform float uAlpha; varying vec2 vXZ;
void main() {
  if (texture2D(uMask, vXZ / uGrid).r < uProg) discard;
  gl_FragColor = vec4(uColor, uAlpha);
#include <colorspace_fragment>
}`;

/** A material that shows a flat colour on the part of the claimed land the ink has not reached yet (see `revealOrder`), at an overall alpha. */
export function ghostMaterial(color: number, mask: Texture, nx: number, ny: number) {
  const m = new ShaderMaterial({
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uMask: { value: mask }, uGrid: { value: new Vector2(nx, ny) }, uProg: { value: 0 }, uAlpha: { value: 1 } },
  });
  Object.assign(m, clipToFloor);
  return m;
}

/**
 * When the ink reaches each claimed cell, 0..1: it starts on the cells along `path` (flat [x0,y0,...], the line the player drew; with no
 * line, on the cell nearest the head (cx, cy)) and spreads only through the claimed cells themselves, so it fills exactly the shape that was
 * closed, edge to edge. Returns a per-cell array over the whole grid: cells outside the claim copy a neighbour inside (so the thin outline
 * beyond the edge is wiped with it) and everything else is 1. Pure, for tests.
 */
export function revealOrder(cells: number[], nx: number, ny: number, path: number[] | undefined, cx: number, cy: number): Float32Array {
  const inSet = new Uint8Array(nx * ny); for (const c of cells) inSet[c] = 1;
  const dist = new Float32Array(nx * ny).fill(Infinity);
  const onPath = new Set<number>();
  if (path) for (let i = 0; i + 1 < path.length; i += 2) { const x = Math.floor(path[i]), y = Math.floor(path[i + 1]); if (x >= 0 && y >= 0 && x < nx && y < ny) onPath.add(y * nx + x); }
  const heap: Array<[number, number]> = [];
  const push = (d: number, c: number) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const seed = (c: number) => { if (dist[c] > 0) { dist[c] = 0; push(0, c); } };
  if (onPath.size) {
    for (const c of cells) {                                              // every claimed cell on or beside the line starts the ink
      const x = c % nx, y = (c / nx) | 0; let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (onPath.has((y + dy) * nx + x + dx)) { near = true; break; }
      if (near) seed(c);
    }
  }
  if (!heap.length) {                                                     // no line, or it never touches the claim: start at the cell nearest the head
    let best = cells[0], bd = Infinity;
    for (const c of cells) { const d = Math.hypot((c % nx) + 0.5 - cx, ((c / nx) | 0) + 0.5 - cy); if (d < bd) { bd = d; best = c; } }
    seed(best);
  }
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]) continue;
    const x = c % nx, y = (c / nx) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
      const n = Y * nx + X; if (!inSet[n]) continue;
      const nd = d + (dx && dy ? Math.SQRT2 : 1);
      if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
    }
  }
  let far = 0; for (const c of cells) if (dist[c] < Infinity && dist[c] > far) far = dist[c];
  const out = new Float32Array(nx * ny).fill(1);
  for (const c of cells) out[c] = dist[c] < Infinity && far > 0 ? dist[c] / far : (dist[c] === 0 ? 0 : 1);
  const edge = out.slice();
  for (const c of cells) {                                                // one ring of the outside takes its neighbour's time
    const x = c % nx, y = (c / nx) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
      const n = Y * nx + X; if (!inSet[n]) edge[n] = Math.min(edge[n], out[c]);
    }
  }
  return edge;
}

export function createTerritory3D(game: Game) {
  const { NX, NY } = game;
  const group = new Group();
  const tiles = new Map<number, Texture | null>();
  const tileFor = (id: number): Texture | null => {
    const key = ((id - 1) % 8 + 8) % 8;
    if (tiles.has(key)) return tiles.get(key)!;
    const cv = patternCanvas(id);
    let tex: Texture | null = null;
    if (cv) { tex = new CanvasTexture(cv); tex.wrapS = tex.wrapT = RepeatWrapping; tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4; }
    tiles.set(key, tex);
    return tex;
  };

  interface Part { root: Group; top: Mesh; wall: Mesh; outline: Mesh; shadow: Mesh; ver: number }
  const empty = () => new BG();
  const mk = (color: number, extra: Partial<MeshBasicMaterial> = {}) => { const m = new MeshBasicMaterial({ color, side: DoubleSide, ...extra }); Object.assign(m, clipToFloor); return m; };
  const parts: Part[] = game.ver.map((_, id) => {
    const col = colorOf(Math.max(1, id));
    const top = new Mesh(empty(), mk(0xffffff)), wall = new Mesh(empty(), mk(darken(col, 0.32))), outline = new Mesh(empty(), mk(darken(col, 0.18), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const shadow = new Mesh(empty(), mk(INK_SHADOW, { transparent: true, opacity: SLAB.shadowAlpha, depthWrite: false }));
    top.renderOrder = 1; wall.renderOrder = 1; outline.renderOrder = 2; shadow.renderOrder = 1;
    const root = new Group(); root.add(shadow, wall, top, outline); group.add(root);
    for (const m of [top, wall, outline, shadow]) m.frustumCulled = false;
    return { root, top, wall, outline, shadow, ver: -1 };
  });
  const swap = (m: Mesh, g: BufferGeometry) => { m.geometry.dispose(); m.geometry = g; };

  // ---- the colour-in fades ----
  interface Ghost { mesh: Mesh; rim: Mesh; mat: ShaderMaterial; mask: Texture; age: number }
  const ghosts: Ghost[] = [];
  const queue: Array<{ cells: number[]; color: number; cx: number; cy: number; startAge?: number; path?: number[] }> = [];       // waiting to be built, one per frame, so a big grab never costs a long frame
  let primed = false;                                                    // the very first draw builds everyone at once; later frames are budgeted

  const addGhost = (cells: number[], color: number, cx: number, cy: number, startAge = 0, path?: number[]) => {
    const set = new Set(cells), loops = traceLoops(NX, NY, (x, y) => set.has(y * NX + x));
    if (!loops.length) return;
    const order = revealOrder(cells, NX, NY, path && path.length >= 4 ? path : undefined, cx, cy), bytes = new Uint8Array(NX * NY);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(order[i] * 255);
    const mask = new DataTexture(bytes, NX, NY, RedFormat, UnsignedByteType); mask.minFilter = mask.magFilter = LinearFilter; mask.needsUpdate = true;
    const mat = ghostMaterial(color, mask, NX, NY), mesh = new Mesh(flatGeometry(groupShapes(loops), SLAB.height + 0.012), mat);
    mesh.renderOrder = 3; mesh.frustumCulled = false;
    // the land's dark outline is centred on its edge, so its outer half sticks out past the covered fill as a thin line: cover that too, or the not-yet-coloured land shows a hairline of outline
    const pos: number[] = [], index: number[] = [], owner = game.owner[cells[0]], half = SLAB.outlineWidth * 1.2, y = SLAB.height + 0.012;
    const inGhost = (x: number, z: number) => set.has(Math.floor(z) * NX + Math.floor(x));
    for (const l of loops) {
      const n = l.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = l.pts[2 * i], az = l.pts[2 * i + 1], bx = l.pts[2 * j], bz = l.pts[2 * j + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const nx = -dz / len, nz = dx / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const outX = inGhost(mx + nx * 0.3, mz + nz * 0.3) ? mx - nx * 0.3 : mx + nx * 0.3, outZ = inGhost(mx + nx * 0.3, mz + nz * 0.3) ? mz - nz * 0.3 : mz + nz * 0.3;
        const ox = Math.floor(outX), oz = Math.floor(outZ);
        if (ox >= 0 && oz >= 0 && ox < NX && oz < NY && game.owner[oz * NX + ox] === owner) continue;       // the join with the owner's own earlier land has no outline to hide
        const b0 = pos.length / 3;
        pos.push(ax + nx * half, y, az + nz * half, ax - nx * half, y, az - nz * half, bx + nx * half, y, bz + nz * half, bx - nx * half, y, bz - nz * half);
        index.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
      }
    }
    const rg = new BG(); rg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); rg.setIndex(index);
    const rim = new Mesh(rg, mat); rim.renderOrder = 3; rim.frustumCulled = false; group.add(rim);
    group.add(mesh);
    ghosts.push({ mesh, rim, mat, mask, age: startAge });
  };

  function rebuild(id: number) {
    const t = parts[id];
    const loops = traceLoops(NX, NY, (x, y) => game.owner[y * NX + x] === id);
    if (!loops.length) { for (const m of [t.top, t.wall, t.outline, t.shadow]) swap(m, empty()); return; }
    const col = colorOf(id), shapes = groupShapes(loops), tile = tileFor(id), base = lighten(col, 0.06);
    const top = t.top.material as MeshBasicMaterial;
    top.map = tile; top.color.setHex(tile ? patternTint(base) : base); top.needsUpdate = true;
    swap(t.top, flatGeometry(shapes, SLAB.height));
    swap(t.wall, wallGeometry(shapes, 0, SLAB.height));
    swap(t.shadow, flatGeometry(offsetShapes(shapes, SLAB.shadowOffset[0], SLAB.shadowOffset[1]), 0.01));
    // the darker outline round every loop, just above the top
    const pos: number[] = [], idx: number[] = [];
    for (const l of loops) {
      const r = buildRibbon(l.pts, SLAB.outlineWidth, SLAB.height + 0.002, true), b = pos.length / 3;
      for (let i = 0; i < r.positions.length; i++) pos.push(r.positions[i]);
      for (let i = 0; i < r.indices.length; i++) idx.push(b + r.indices[i]);
    }
    const og = new BG(); og.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); og.setIndex(idx);
    swap(t.outline, og);
  }

  return {
    group,
    /** Land at `cells` was just claimed, with the head at (cx, cy). `takenFrom` says which of it belonged to whom. */
    reveal(cells: number[], takenFrom: Map<number, number[]> | undefined, cx: number, cy: number, path?: number[]) {
      if (cells.length < EFFECTS.revealMinCells || ghosts.length + queue.length >= EFFECTS.revealMaxLive) return;
      const owned = new Set<number>();
      if (takenFrom) for (const [victim, list] of takenFrom) { for (const c of list) owned.add(c); queue.push({ cells: list, color: lighten(colorOf(victim), 0.06), cx, cy, path }); }
      const fresh = takenFrom ? cells.filter(c => !owned.has(c)) : cells;
      if (fresh.length) queue.push({ cells: fresh, color: SEA, cx, cy, path });
    },
    /** Build one nearly-invisible fade at the start, so the first real capture does not hitch while shaders and buffers are set up. */
    prewarm() {
      const cells: number[] = [];
      for (let i = 0; i < game.land.length && cells.length < 3; i++) if (game.land[i]) cells.push(i);
      if (cells.length === 3) queue.push({ cells, color: SEA, cx: (cells[0] % NX) + 0.5, cy: ((cells[0] / NX) | 0) + 0.5, startAge: EFFECTS.revealMs * 0.94 });
    },
    ghostCount: () => ghosts.length,
    queued: () => queue.length,
    /** How many players' territory is waiting to be redrawn (a few are drawn per frame). */
    pending: () => { let n = 0; for (let id = 1; id < parts.length; id++) if (parts[id].ver !== game.ver[id]) n++; return n; },
    /** For tests: the alpha of each live fade. */
    ghostAlphas: () => ghosts.map(g => g.mat.uniforms.uAlpha.value as number),
    /** Advance the colouring-in. */
    update(dtMs: number) {
      const next = queue.shift();                                          // build at most one waiting ghost per frame
      if (next) addGhost(next.cells, next.color, next.cx, next.cy, next.startAge, next.path);
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const k = ghosts[i], t = (k.age += dtMs) / EFFECTS.revealMs;
        if (t >= 1) { group.remove(k.mesh, k.rim); k.mesh.geometry.dispose(); k.rim.geometry.dispose(); k.mat.dispose(); k.mask.dispose(); ghosts.splice(i, 1); continue; }
        const p = Math.min(1, t / EFFECTS.revealSpread);
        k.mat.uniforms.uProg.value = p * 1.01;
        k.mat.uniforms.uAlpha.value = 1 - easeInOut(t);
      }
    },
    sync() {
      let budget = primed ? EFFECTS.rebuildsPerFrame : Infinity;
      for (let id = 1; id < parts.length && budget > 0; id++) {             // you first (id 1), then the others; whatever does not fit waits for the next frame
        if (parts[id].ver !== game.ver[id]) { parts[id].ver = game.ver[id]; rebuild(id); budget--; }
      }
      primed = true;
    },
    dispose() {
      for (const p of parts) for (const m of [p.top, p.wall, p.outline, p.shadow]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
      for (const g of ghosts) { g.mesh.geometry.dispose(); g.rim.geometry.dispose(); g.mat.dispose(); g.mask.dispose(); }
      for (const t of tiles.values()) t?.dispose();
    },
  };
}
export type Territory3D = ReturnType<typeof createTerritory3D>;
