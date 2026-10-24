// Open lines as flat ribbons on the ground. Each player has two (a pale rim under a lighter core, opaque: translucent strokes double-blend
// where they overlap). The committed part of a line (one point per logic tick, with its corners cut) is rebuilt only when the line grows;
// every display frame the LAST vertex pair is placed at the head's interpolated position, so the line's leading edge never lags or gaps
// between 30 Hz ticks. Round ends come from a shared batch of discs.
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { chaikinOpen } from '../geometry/index.ts';
import { EFFECTS } from '../config.ts';
import type { Game } from '../game/index.ts';
import { colorOf } from '../render/palette.ts';
import { strokesFor, trailStyle } from '../render/trailStyle.ts';
import { GroundBatch } from './groundBatch.ts';
import { ribbonIndices, ribbonPair } from './ribbon.ts';
import { Color } from 'three';

/** Raw path points per colour chunk (a rainbow line changes colour from chunk to chunk). */
export const CHUNK_POINTS = 48;
const SMOOTH_TIMES = 2, SMOOTH_FACTOR = 4;      // chaikinOpen twice: about 4x the points
export const TRAIL_Y = 0.13, LAYER = 0.004;      // each stroke of a line sits a hair above the one under it, so they never fight for the same depth

/** Your own line wears the chosen style (see trailStyle.ts); everyone else's is plain. */
const strokes = (id: number, col: number, chunk: number) => strokesFor(id === 1 ? trailStyle() : 'plain', col, chunk);

interface Strand { mesh: Mesh; geo: BufferGeometry; mat: MeshBasicMaterial; pos: Float32Array; col: Float32Array }
interface Line { strands: Strand[]; smooth: number[]; seenLen: number; widths: number[] }

export function createTrail3D(game: Game, capacityPoints = 6000) {
  const group = new Group();
  const caps = new GroundBatch(TRAIL_Y + 0.0015, 6);
  group.add(caps.mesh);
  const cap = capacityPoints, idx = ribbonIndices(cap);
  const tmp = new Color();

  const makeStrand = (order: number): Strand => {
    const geo = new BufferGeometry(), pos = new Float32Array(cap * 2 * 3), col = new Float32Array(cap * 2 * 3);
    geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(35048));
    geo.setAttribute('color', new BufferAttribute(col, 3).setUsage(35048));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
    const mesh = new Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order;
    group.add(mesh);
    return { mesh, geo, mat, pos, col };
  };
  const makeLine = (): Line => ({ strands: [makeStrand(4), makeStrand(5)], smooth: [], seenLen: 0, widths: [] });
  const lines: Line[] = game.ver.map(() => makeLine());

  /** Lines that ended because their owner died fade away instead of vanishing. */
  const fades: Array<{ strands: Strand[]; age: number }> = [];
  const hide = (ln: Line) => { for (const s of ln.strands) s.geo.setDrawRange(0, 0); ln.smooth = []; ln.seenLen = 0; };
  const fadeAway = (ln: Line, index: number) => {
    if (ln.smooth.length < 4) return;
    const old = ln.strands;
    for (const s of old) { s.mat.transparent = true; s.mat.depthWrite = false; s.mat.needsUpdate = true; }
    fades.push({ strands: old, age: 0 });
    ln.strands = [makeStrand(4), makeStrand(5)];
    lines[index] = ln;
  };

  const setColor = (s: Strand, vertexPair: number, rgbHex: number) => {
    tmp.setHex(rgbHex);
    const o = vertexPair * 6;
    s.col[o] = tmp.r; s.col[o + 1] = tmp.g; s.col[o + 2] = tmp.b; s.col[o + 3] = tmp.r; s.col[o + 4] = tmp.g; s.col[o + 5] = tmp.b;
  };

  return {
    group,
    /** Advance the fading of dead players' lines. */
    fade(dtMs: number) {
      for (let i = fades.length - 1; i >= 0; i--) {
        const t = (fades[i].age += dtMs) / EFFECTS.deathLineMs;
        if (t >= 1) { for (const s of fades[i].strands) { group.remove(s.mesh); s.geo.dispose(); s.mat.dispose(); } fades.splice(i, 1); }
        else for (const s of fades[i].strands) s.mat.opacity = 1 - t * t;
      }
    },
    fadingCount: () => fades.length,
    /** How many colour chunks a player's committed line has finished (a chunk is CHUNK_POINTS path points). */
    chunkCount: (id: number) => Math.floor(Math.max(0, lines[id].seenLen / 2 - 2) / CHUNK_POINTS),
    update(f: number) {
      caps.begin();
      for (const p of game.players) {
        let ln = lines[p.id];
        const len = p.alive ? p.path.length : 0;
        if (len < ln.seenLen) { if (!p.alive) fadeAway(ln, p.id); ln = lines[p.id]; hide(ln); }         // the line ended (captured, cut, died): start over (a dead player's line fades first)
        if (len !== ln.seenLen && len >= 4) {
          ln.seenLen = len;
          const m = len / 2 - 1;                                          // committed points: every stored point except the current head
          const committed = p.path.slice(0, m * 2);
          const before = ln.smooth;
          let smooth = committed.length >= 4 ? chaikinOpen(committed, SMOOTH_TIMES) : committed;     // one vertex per logic tick with a turn at each looked beaded: cut the corners first
          if (smooth.length / 2 > cap - 3) smooth = smooth.slice(smooth.length - (cap - 3) * 2);      // a line longer than the buffers keeps its newest part
          ln.smooth = smooth;
          const col = colorOf(p.id), n = smooth.length / 2;
          // only the end of the line changes from tick to tick, so rebuild vertices from just before the first point that differs
          let first = 0;
          const common = Math.min(before.length, smooth.length);
          while (first < common && before[first] === smooth[first]) first++;
          const from = Math.max(0, (first >> 1) - 1);
          const chunkDefs: ReturnType<typeof strokes>[] = [];
          const defsFor = (chunk: number) => chunkDefs[chunk] ?? (chunkDefs[chunk] = strokes(p.id, col, chunk));
          ln.widths = defsFor(0).map(d => d[0]);
          for (let si = 0; si < ln.strands.length; si++) {
            const s = ln.strands[si];
            for (let i = from; i < n; i++) {
              ribbonPair(smooth, i, n, ln.widths[si], TRAIL_Y + si * LAYER, false, s.pos, i * 6);
              setColor(s, i, defsFor(Math.floor(i / SMOOTH_FACTOR / CHUNK_POINTS))[si][1]);
            }
          }
        }
        const n = ln.smooth.length / 2;
        if (len >= 4 && n >= 1) {
          // the head: where the player is drawn this frame. The last vertex pair sits exactly there.
          const hx = p.px + (p.x - p.px) * f, hz = p.py + (p.y - p.py) * f;
          const pts = ln.smooth;
          const col = colorOf(p.id), chunk = Math.floor(n / SMOOTH_FACTOR / CHUNK_POINTS), defs = strokes(p.id, col, chunk);
          for (let si = 0; si < ln.strands.length; si++) {
            const s = ln.strands[si], w = ln.widths[si] ?? defs[si][0];
            // temporarily treat the head as the point after the last committed one, so the join is mitred and the end is square on the head
            const ext = pts.concat([hx, hz]);
            ribbonPair(ext, n - 1, n + 1, w, TRAIL_Y + si * LAYER, false, s.pos, (n - 1) * 6);
            ribbonPair(ext, n, n + 1, w, TRAIL_Y + si * LAYER, false, s.pos, n * 6);
            setColor(s, n, defs[si][1]);
            s.geo.setDrawRange(0, n * 6);
            (s.geo.attributes.position as BufferAttribute).needsUpdate = true; (s.geo.attributes.color as BufferAttribute).needsUpdate = true;
            caps.circle(hx, hz, w / 2, defs[si][1], 1, 12);
            caps.circle(pts[0], pts[1], w / 2, defs[si][1], 1, 12);
          }
        } else if (len < 4) for (const s of ln.strands) s.geo.setDrawRange(0, 0);
      }
      caps.end();
    },
    dispose() {
      for (const ln of lines) for (const s of ln.strands) { s.geo.dispose(); s.mat.dispose(); }
      for (const f of fades) for (const s of f.strands) { s.geo.dispose(); s.mat.dispose(); }
      caps.dispose();
    },
  };
}
export type Trail3D = ReturnType<typeof createTrail3D>;
