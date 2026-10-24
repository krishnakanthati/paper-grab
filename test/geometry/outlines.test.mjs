import test from 'node:test';
import assert from 'node:assert/strict';
import { chaikinOpen, densify, groupShapes, pointInPoly, traceLoops } from '../../src/geometry/index.ts';

const cells = (rows) => (x, y) => rows[y]?.[x] === '#';
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a / 2); };
// biggest change of direction between neighbouring points, in radians: a sharp corner is large, a smooth curve is small
function sharpest(p) {
  let worst = 0; const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = ((i + n - 1) % n) * 2, b = i * 2, c = ((i + 1) % n) * 2;
    const t = Math.atan2(p[c + 1] - p[b + 1], p[c] - p[b]) - Math.atan2(p[b + 1] - p[a + 1], p[b] - p[a]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(t), Math.cos(t))));
  }
  return worst;
}
const disc = (r) => (x, y) => Math.hypot(x + 0.5 - r, y + 0.5 - r) <= r - 0.25;

test('a solid square is one outer loop; corners are rounded', () => {
  const loops = traceLoops(3, 3, cells(['###', '###', '###']));
  assert.equal(loops.length, 1);
  assert.equal(loops[0].hole, false);
  assert.equal(loops[0].area, 9);
  assert.ok(pointInPoly(loops[0].pts, 1.5, 1.5));
  assert.ok(!pointInPoly(loops[0].pts, 0.03, 0.03), 'a sharp corner survived');
});

test('a ring has an outer loop and a hole, paired by groupShapes', () => {
  const loops = traceLoops(5, 5, cells(['#####', '#####', '##.##', '#####', '#####']));
  assert.equal(loops.filter(l => !l.hole).length, 1);
  assert.equal(loops.filter(l => l.hole).length, 1);
  const shapes = groupShapes(loops);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].holes.length, 1);
});

test('two cells touching only diagonally stay two separate shapes', () => {
  const loops = traceLoops(2, 2, cells(['#.', '.#']));
  assert.equal(loops.length, 2);
  assert.ok(loops.every(l => !l.hole && l.area === 1));
});

test('an island inside a hole is its own shape', () => {
  const shapes = groupShapes(traceLoops(7, 5, cells(['#######', '#.....#', '#..#..#', '#.....#', '#######'])));
  assert.equal(shapes.length, 2);
  assert.equal(shapes.filter(s => s.holes.length === 1).length, 1);
});

test('stair-stepped blobs come out smooth: no sharp corners anywhere', () => {
  const loops = traceLoops(40, 40, disc(20));
  assert.equal(loops.length, 1);
  assert.ok(sharpest(loops[0].pts) < 0.5, 'sharpest turn ' + sharpest(loops[0].pts).toFixed(2) + ' rad');
  const rough = traceLoops(40, 40, disc(20), 0)[0];             // no smoothing: the raw staircase
  assert.ok(sharpest(rough.pts) > 1.4, 'sanity: the raw outline has right-angle corners');
});

test('smoothing does not shrink shapes (area stays within a few percent of the cell count)', () => {
  const [loop] = traceLoops(40, 40, disc(20));
  const smooth = polyArea(loop.pts);
  assert.ok(Math.abs(smooth - loop.area) / loop.area < 0.05, `smoothed ${smooth.toFixed(1)} vs raw ${loop.area}`);
});

test('outline areas add up exactly to the cells (outer minus holes)', () => {
  const inside = (x, y) => ((x * 7 + y * 13) % 5 !== 0) && Math.hypot(x - 15, y - 15) < 14;
  let count = 0; for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (inside(x, y)) count++;
  const loops = traceLoops(30, 30, inside);
  const outer = loops.filter(l => !l.hole).reduce((a, l) => a + l.area, 0);
  const holes = loops.filter(l => l.hole).reduce((a, l) => a + l.area, 0);
  assert.equal(outer - holes, count);
});

test('smoothed outlines stay close to their cells (nothing wanders off)', () => {
  const [loop] = traceLoops(40, 40, disc(20));
  for (let i = 0; i < loop.pts.length; i += 2) assert.ok(Math.abs(Math.hypot(loop.pts[i] - 20, loop.pts[i + 1] - 20) - 19.75) < 1.1);
});

test('a small round spawn patch comes out genuinely round, not angular', () => {
  const patch = (x, y) => Math.hypot(x - 5, y - 5) <= 2.5;
  const [loop] = traceLoops(11, 11, patch);
  let cx = 0, cy = 0; const n = loop.pts.length / 2;
  for (let i = 0; i < loop.pts.length; i += 2) { cx += loop.pts[i]; cy += loop.pts[i + 1]; }
  cx /= n; cy /= n;
  const radii = []; for (let i = 0; i < loop.pts.length; i += 2) radii.push(Math.hypot(loop.pts[i] - cx, loop.pts[i + 1] - cy));
  const mean = radii.reduce((a, b) => a + b, 0) / n;
  assert.ok((Math.max(...radii) - Math.min(...radii)) / mean < 0.06, 'radius varies by ' + (((Math.max(...radii) - Math.min(...radii)) / mean) * 100).toFixed(1) + '%');
  assert.ok(sharpest(loop.pts) < 0.25, 'sharpest turn ' + sharpest(loop.pts).toFixed(2));
});

test('a 1-cell staircase edge is flattened: no bumps at the period of the cell grid', () => {
  const diag = (x, y) => y >= x;                                  // a diagonal coast made of unit steps (real corners only at the map edge)
  const [loop] = traceLoops(40, 40, diag);
  const mid = [];                                                 // keep only points on the long diagonal, away from the real corners
  for (let i = 0; i < loop.pts.length; i += 2) {
    const x = loop.pts[i], y = loop.pts[i + 1];
    if (Math.abs(x - y) < 1.5 && x > 8 && x < 32) mid.push(x, y);
  }
  assert.ok(mid.length > 40);
  let worst = 0;
  for (let i = 2; i < mid.length - 2; i += 2) {
    const t = Math.atan2(mid[i + 3] - mid[i + 1], mid[i + 2] - mid[i]) - Math.atan2(mid[i + 1] - mid[i - 1], mid[i] - mid[i - 2]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(t), Math.cos(t))));
  }
  assert.ok(worst < 0.2, 'the staircase still bumps: turn of ' + worst.toFixed(2) + ' rad between neighbouring points');
});

test('densify doubles the points of a closed loop each pass and keeps the shape', () => {
  const sq = [0, 0, 4, 0, 4, 4, 0, 4];
  const d = densify(sq, 2);
  assert.equal(d.length, sq.length * 4);
  assert.ok(Math.abs(polyArea(d) - 16) < 1e-9);
});

test('open-path corner cutting keeps both end points exactly and rounds the bends', () => {
  const zig = [0, 0, 3, 0, 3, 3, 6, 3, 6, 6];
  const sm = chaikinOpen(zig, 2);
  assert.deepEqual([sm[0], sm[1]], [0, 0]);
  assert.deepEqual([sm[sm.length - 2], sm[sm.length - 1]], [6, 6]);
  assert.ok(sm.length > zig.length);
  const turn = (p) => { let w = 0; for (let i = 2; i < p.length - 2; i += 2) { const t = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]) - Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]); w = Math.max(w, Math.abs(Math.atan2(Math.sin(t), Math.cos(t)))); } return w; };
  assert.ok(turn(sm) < turn(zig) * 0.6, 'bends were not softened');
  assert.deepEqual(chaikinOpen([1, 1, 2, 2], 3), [1, 1, 2, 2], 'a two-point path must be left alone');
});
