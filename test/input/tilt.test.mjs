import test from 'node:test';
import assert from 'node:assert/strict';
import { tiltVector, headingFromTilt, wrapDeg, TILT } from '../../src/input/tilt.ts';

const rest = { beta: 60, gamma: 0 };
const deg = (r) => Math.round((r * 180) / Math.PI);

test('portrait: lean the way you want to go, like rolling a ball', () => {
  const head = (beta, gamma) => { const [dx, dy] = tiltVector({ beta, gamma }, rest, 0); return deg(headingFromTilt(dx, dy, 3)); };
  assert.equal(head(60, 20), 0, 'right edge down: right');
  assert.equal(head(60, -20), 180, 'left edge down: left');
  assert.equal(head(40, 0), -90, 'top edge down (beta falls): up the screen');
  assert.equal(head(80, 0), 90, 'bottom edge down (beta rises): down the screen');
  assert.equal(head(40, 20), -45, 'a diagonal lean gives a diagonal heading');
});

test('landscape: the same physical lean means the same thing on screen, whichever way the phone is turned', () => {
  // rotated 90: the device's "forward" (beta falling) is now to the screen's right... leaning the screen's right edge down must go right
  for (const angle of [90, 180, 270]) {
    const dirs = new Set();
    for (const [b, g] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
      const [dx, dy] = tiltVector({ beta: rest.beta + b, gamma: g }, rest, angle);
      dirs.add(((deg(headingFromTilt(dx, dy, 3)) % 360) + 360) % 360);       // compass degrees 0..359 (so -180 and 180 are the same heading)
    }
    assert.equal(dirs.size, 4, `at ${angle} the four leans give four different headings`);
    assert.deepEqual([...dirs].sort((a, c) => a - c), [0, 90, 180, 270], `at ${angle} they are exactly right/down/left/up`);
  }
  // 180 is simply the opposite of 0
  const a = tiltVector({ beta: 80, gamma: 10 }, rest, 0), c = tiltVector({ beta: 80, gamma: 10 }, rest, 180);
  assert.ok(Math.abs(a[0] + c[0]) < 1e-9 && Math.abs(a[1] + c[1]) < 1e-9);
  assert.deepEqual(tiltVector({ beta: 70, gamma: 5 }, rest, 360), tiltVector({ beta: 70, gamma: 5 }, rest, 0), 'angles wrap');
});

test('the dead zone keeps the current heading: a small lean (a shaky hand) steers nothing', () => {
  assert.equal(headingFromTilt(3, 3), null);
  assert.equal(headingFromTilt(0, 0), null);
  assert.equal(headingFromTilt(TILT.deadzoneDeg + 0.1, 0), 0);
  assert.equal(headingFromTilt(0, -TILT.deadzoneDeg - 1), -Math.PI / 2);
});

test('the pose you hold when a round starts is "level", wherever the phone sits; angles wrap across 180', () => {
  const held = { beta: 55, gamma: -8 };
  const [dx, dy] = tiltVector(held, held, 0);
  assert.equal(headingFromTilt(dx, dy), null, 'holding it as you started means no steering');
  assert.equal(wrapDeg(190), -170); assert.equal(wrapDeg(-190), 170); assert.equal(wrapDeg(180), 180);
  const [wx] = tiltVector({ beta: 60, gamma: -175 }, { beta: 60, gamma: 175 }, 0);       // the sensor wrapped from +175 to -175: a 10 degree lean right, not 350 left
  assert.equal(Math.round(wx), 10);
});

test('settings are sane', () => {
  assert.ok(TILT.deadzoneDeg >= 3 && TILT.deadzoneDeg <= 15);
  assert.ok(TILT.smoothing > 0 && TILT.smoothing <= 1);
  assert.ok(TILT.resumeAfterMs >= 500);
});
