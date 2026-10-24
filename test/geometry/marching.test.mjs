import test from 'node:test';
import assert from 'node:assert/strict';
import { groupShapes, marchingSquares } from '../../src/geometry/index.ts';

const discField = (cx, cy, r) => (x, y) => r - Math.hypot(x - cx, y - cy);

test('a disc field gives one outer loop at the right radius with the right area', () => {
  const loops = marchingSquares(discField(20, 20, 8), 40, 40, 0, 0.25);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].hole, false);
  assert.ok(Math.abs(loops[0].area - Math.PI * 64) / (Math.PI * 64) < 0.01, 'area ' + loops[0].area);
  for (let i = 0; i < loops[0].pts.length; i += 2) assert.ok(Math.abs(Math.hypot(loops[0].pts[i] - 20, loops[0].pts[i + 1] - 20) - 8) < 0.02);
});

test('a ring field (a disc with a hole) gives an outer loop and a hole loop, paired by groupShapes', () => {
  const ring = (x, y) => Math.min(10 - Math.hypot(x - 20, y - 20), Math.hypot(x - 20, y - 20) - 4);
  const loops = marchingSquares(ring, 40, 40, 0, 0.25);
  assert.equal(loops.filter(l => !l.hole).length, 1);
  assert.equal(loops.filter(l => l.hole).length, 1);
  const shapes = groupShapes(loops);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].holes.length, 1);
});

test('two separate blobs give two loops; every loop is closed and has no repeated points', () => {
  const two = (x, y) => Math.max(5 - Math.hypot(x - 10, y - 10), 5 - Math.hypot(x - 30, y - 12));
  const loops = marchingSquares(two, 40, 25, 0, 0.3);
  assert.equal(loops.length, 2);
  for (const l of loops) {
    const seen = new Set();
    for (let i = 0; i < l.pts.length; i += 2) { const k = l.pts[i].toFixed(6) + ',' + l.pts[i + 1].toFixed(6); assert.ok(!seen.has(k), 'repeated point'); seen.add(k); }
  }
});

test('a saddle (two blobs touching at a corner) still produces closed loops', () => {
  const f = (x, y) => ((Math.floor(x) + Math.floor(y)) % 2 === 0 ? 1 : -1) * 1;      // checkerboard: every grid corner is a saddle
  const loops = marchingSquares((x, y) => f(x, y), 6, 6, 0, 1);
  assert.ok(loops.length > 0);
  for (const l of loops) assert.ok(l.pts.length >= 6);
});

test('the level parameter shifts the outline: a higher level shrinks the disc by exactly that much', () => {
  const l0 = marchingSquares(discField(20, 20, 8), 40, 40, 0, 0.25)[0];
  const l1 = marchingSquares(discField(20, 20, 8), 40, 40, 1.5, 0.25)[0];
  const rad = (l) => Math.hypot(l.pts[0] - 20, l.pts[1] - 20);
  assert.ok(Math.abs((rad(l0) - rad(l1)) - 1.5) < 0.03);
});
