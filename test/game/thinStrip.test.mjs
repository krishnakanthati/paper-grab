import test from 'node:test';
import assert from 'node:assert/strict';
import { alone, game, go, startWithRoom } from '../helpers.mjs';
import { traceLoops } from '../../src/geometry/trace.ts';

test('a thin strip claimed by walking out and straight back along a diagonal is one connected shape, not a string of beads', () => {
  for (const [ang, off] of [[Math.PI / 4, 0.3], [Math.PI / 4, 0.15], [0.6, 0.3], [1.0, 0.25]]) {
    const G = game(7), h = startWithRoom(G); alone(G);
    go(G, h, ang, 10); go(G, h, ang + Math.PI / 2, off); go(G, h, ang + Math.PI, 10.5);
    assert.equal(h.trail.length, 0, 'the line closed');
    const loops = traceLoops(G.NX, G.NY, (x, y) => G.owner[y * G.NX + x] === 1);
    assert.equal(loops.length, 1, `angle ${ang.toFixed(2)}, offset ${off}: the land outline split into ${loops.length} separate shapes`);
  }
});
