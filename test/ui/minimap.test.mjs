import test from 'node:test';
import assert from 'node:assert/strict';
import { dotRadius, MINIMAP, scaleFor } from '../../src/ui/minimap.ts';

test('opponent dots are big enough to see on any arena, and never huge', () => {
  for (const cells of [30, 60, 120, 220, 400]) {
    const r = dotRadius(cells);
    assert.ok(r >= MINIMAP.dot.min && r <= MINIMAP.dot.max, `${cells} cells wide: radius ${r}`);
  }
  assert.ok(dotRadius(220) > dotRadius(60) || dotRadius(60) === MINIMAP.dot.min, 'a wider map gets a proportionally larger dot');
});

test('the minimap resolution follows the size it is shown at, within limits', () => {
  assert.equal(scaleFor(190, 220, 1), MINIMAP.minScale);
  assert.ok(scaleFor(190, 60, 3) <= MINIMAP.maxScale);
  assert.ok(scaleFor(400, 100, 2) >= scaleFor(100, 100, 2));
});
