import test from 'node:test';
import assert from 'node:assert/strict';
import { SpringAnimator, springFor, volumeScale } from '../../src/anim/spring.ts';
import { clamp, dampK, lerp, lerpAngle, smoothK, tickAlpha, wrapPi } from '../../src/anim/interp.ts';

test('a spring settles on its target, and an underdamped one overshoots first', () => {
  const s = springFor(14, 0.45, 1);                    // bouncy
  let peak = 0;
  for (let i = 0; i < 60 * 4; i++) { s.step(1 / 60); peak = Math.max(peak, s.x); }
  assert.ok(peak > 1.05, 'it overshoots: ' + peak);
  assert.ok(s.settled && Math.abs(s.x - 1) < 1e-3, 'and comes to rest on the target');
  const tight = springFor(14, 1.2, 1);                 // overdamped: never past the target
  let over = 0; for (let i = 0; i < 60 * 4; i++) { tight.step(1 / 60); over = Math.max(over, tight.x); }
  assert.ok(over <= 1 + 1e-6, 'a heavily damped spring never overshoots');
  assert.ok(Math.abs(new SpringAnimator(100, 20).dampingRatio - 1) < 1e-9, 'damping ratio of a critically damped spring is 1');
});

test('a spring behaves the same at 30, 60 and 144 fps, and a long hitch cannot blow it up', () => {
  const run = (fps) => { const s = new SpringAnimator(230, 9.5, 0); s.kick(-5); for (let i = 0; i < fps * 0.5; i++) s.step(1 / fps); return s.x; };
  assert.ok(Math.abs(run(30) - run(144)) < 0.02 && Math.abs(run(60) - run(144)) < 0.02, `${run(30)} ${run(60)} ${run(144)}`);
  const big = new SpringAnimator(230, 9.5); big.kick(-5); big.step(5);
  assert.ok(Number.isFinite(big.x) && Math.abs(big.x) < 10);
});

test('squash and stretch keeps the volume: taller means slimmer by 1 / sqrt, in both horizontal axes', () => {
  for (const sy of [0.65, 0.72, 1, 1.3, 1.6]) {
    const v = volumeScale(sy);
    assert.ok(Math.abs(v.x * v.y * v.z - 1) < 1e-9, `volume at ${sy}`);
    assert.equal(v.x, v.z);
  }
  assert.ok(volumeScale(0).x < 3, 'a violent squash is floored, not infinite');
});

test('angles interpolate the short way round, and smoothing does not depend on the frame rate', () => {
  assert.ok(Math.abs(Math.abs(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)) - Math.PI) < 1e-9, 'across the +-PI seam');
  assert.ok(Math.abs(lerpAngle(0.2, 0.6, 0.5) - 0.4) < 1e-12);
  assert.ok(Math.abs(wrapPi(7) - (7 - 2 * Math.PI)) < 1e-12);
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a += (1 - a) * smoothK(1000 / 60, 120);        // 1 second at 60 fps
  for (let i = 0; i < 144; i++) b += (1 - b) * smoothK(1000 / 144, 120);      // 1 second at 144 fps
  assert.ok(Math.abs(a - b) < 1e-9, 'the same gap closes in the same time at any frame rate');
  assert.ok(Math.abs(dampK(10, 0.1) - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(lerp(2, 4, 0.25), 2.5); assert.equal(clamp(5, 0, 1), 1);
  assert.equal(tickAlpha(10, 33.3), 10 / 33.3); assert.equal(tickAlpha(80, 33.3), 1); assert.equal(tickAlpha(-4, 33.3), 0);
});
