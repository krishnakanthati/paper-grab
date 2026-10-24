// Each player's land as a thin raised slab on the ground: a patterned top, a darker side wall (the 2.5D thickness), a darker outline
// and a faint shadow. A player's slab is rebuilt only when that player's land version changes, a few per frame. Newly claimed land is
// coloured in like ink spreading from the head: a "ghost" of what it used to look like lies on top and is wiped away by a growing
// circle (in the fragment shader) while it fades. Everything is clipped to the coast by the stencil (see stencil.ts).
import {
  CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RepeatWrapping, ShaderMaterial, SRGBColorSpace, Vector2, type BufferGeometry, type Texture,
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
/** How many points along your line the colouring-in brush remembers. */
const GHOST_N = 24;
const GHOST_FRAG = `uniform vec3 uColor; uniform vec2 uPts[${GHOST_N}]; uniform float uCount; uniform vec2 uHead; uniform float uRadius; uniform float uAlpha; varying vec2 vXZ;
void main() {
  float d = distance(vXZ, uHead);
  for (int i = 0; i < ${GHOST_N}; i++) if (float(i) < uCount) d = min(d, distance(vXZ, uPts[i]));
  if (d < uRadius) discard;
  gl_FragColor = vec4(uColor, uAlpha);
#include <colorspace_fragment>
}`;

/** A material that shows a flat colour everywhere OUTSIDE the brush (discs along a path, see `brushAt`) at an overall alpha: the "not yet coloured in" part of a capture. */
export function ghostMaterial(color: number) {
  const m = new ShaderMaterial({
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uPts: { value: Array.from({ length: GHOST_N }, () => new Vector2()) }, uCount: { value: 0 }, uHead: { value: new Vector2() }, uRadius: { value: 0 }, uAlpha: { value: 1 } },
  });
  Object.assign(m, clipToFloor);
  return m;
}

/** `path` (flat [x0,y0,...]) as at most `n` points spread evenly along its length, ends included. Pure, for tests. */
export function samplePath(path: number[], n = GHOST_N): number[] {
  const m = path.length / 2;
  if (m <= 1) return path.slice(0, 2);
  const cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(path[2 * i] - path[2 * i - 2], path[2 * i + 1] - path[2 * i - 1]));
  const total = cum[m - 1], out: number[] = [];
  if (total < 1e-6) return path.slice(0, 2);
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < m - 1 && cum[j] < d) j++;
    const span = cum[j] - cum[j - 1], u = span > 0 ? Math.min(1, Math.max(0, (d - cum[j - 1]) / span)) : 0;
    out.push(path[2 * j - 2] + (path[2 * j] - path[2 * j - 2]) * u, path[2 * j - 1] + (path[2 * j + 1] - path[2 * j - 1]) * u);
  }
  return out;
}

/**
 * Where the brush is `p` (0..1) of the way through the colouring-in: first it follows the line the player drew (`run`, the first
 * `LINE_SHARE` of the time), then its discs swell to fill everything inside. Returns the brush's head, how many whole points behind it
 * are already inked, and the disc radius. Pure, for tests.
 */
export const LINE_SHARE = 0.6;
export function brushAt(pts: number[], p: number, rBrush: number, rFinal: number) {
  const n = pts.length / 2, run = Math.min(1, p / LINE_SHARE) * (n - 1), i = Math.min(n - 1, Math.floor(run)), f = i >= n - 1 ? 0 : run - i;
  const j = Math.min(n - 1, i + 1);
  return {
    hx: pts[2 * i] + (pts[2 * j] - pts[2 * i]) * f, hy: pts[2 * i + 1] + (pts[2 * j + 1] - pts[2 * i + 1]) * f,
    count: i, radius: rBrush + (rFinal - rBrush) * easeOutCubic(Math.max(0, (p - LINE_SHARE) / (1 - LINE_SHARE))),
  };
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
  interface Ghost { mesh: Mesh; rim: Mesh; mat: ShaderMaterial; age: number; cx: number; cy: number; reach: number; pts: number[] | null; rBrush: number; rFinal: number }
  const ghosts: Ghost[] = [];
  const queue: Array<{ cells: number[]; color: number; cx: number; cy: number; startAge?: number; path?: number[] }> = [];       // waiting to be built, one per frame, so a big grab never costs a long frame
  let primed = false;                                                    // the very first draw builds everyone at once; later frames are budgeted

  const addGhost = (cells: number[], color: number, cx: number, cy: number, startAge = 0, path?: number[]) => {
    const set = new Set(cells), loops = traceLoops(NX, NY, (x, y) => set.has(y * NX + x));
    if (!loops.length) return;
    const mat = ghostMaterial(color), mesh = new Mesh(flatGeometry(groupShapes(loops), SLAB.height + 0.012), mat);
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
    let reach = 0;                                                       // far enough that the circle ends up covering every claimed cell
    for (const c of cells) reach = Math.max(reach, Math.hypot((c % NX) + 0.5 - cx, ((c / NX) | 0) + 0.5 - cy));
    mat.uniforms.uHead.value.set(cx, cy);
    let pts: number[] | null = path && path.length >= 4 ? samplePath(path) : null, rFinal = 0, rBrush = 0;
    if (pts) {                                                          // the brush walks the line the player drew, then swells to cover whatever is left inside
      for (const c of cells) { const x = (c % NX) + 0.5, y = ((c / NX) | 0) + 0.5; let best = Infinity; for (let k = 0; k < pts.length; k += 2) best = Math.min(best, Math.hypot(x - pts[k], y - pts[k + 1])); rFinal = Math.max(rFinal, best); }
      rFinal += 1; rBrush = Math.min(rFinal, Math.max(1.6, Math.min(4.5, rFinal * 0.45)));
      for (let k = 0; k < pts.length / 2; k++) (mat.uniforms.uPts.value as Vector2[])[k].set(pts[2 * k], pts[2 * k + 1]);
    }
    group.add(mesh);
    ghosts.push({ mesh, rim, mat, age: startAge, cx, cy, reach: reach + 1.5, pts, rBrush, rFinal });
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
        if (t >= 1) { group.remove(k.mesh, k.rim); k.mesh.geometry.dispose(); k.rim.geometry.dispose(); k.mat.dispose(); ghosts.splice(i, 1); continue; }
        const p = Math.min(1, t / EFFECTS.revealSpread);
        if (k.pts) {
          const b = brushAt(k.pts, p, k.rBrush, k.rFinal);
          k.mat.uniforms.uHead.value.set(b.hx, b.hy); k.mat.uniforms.uCount.value = b.count; k.mat.uniforms.uRadius.value = b.radius;
        } else k.mat.uniforms.uRadius.value = k.reach * easeOutCubic(p);
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
      for (const g of ghosts) { g.mesh.geometry.dispose(); g.rim.geometry.dispose(); g.mat.dispose(); }
      for (const t of tiles.values()) t?.dispose();
    },
  };
}
export type Territory3D = ReturnType<typeof createTerritory3D>;
