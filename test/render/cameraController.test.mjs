import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_3D, createCameraController, pose3D } from '../../src/render/cameraController.ts';

const target = (over = {}) => ({ x: 50, y: 30, angle: 0, moving: 0, cells: 0, ...over });

test('the camera follows with the same result at any frame rate', () => {
  const run = (fps) => { const c = createCameraController({ x: 0, y: 0 }); for (let i = 0; i < fps; i++) c.update(target(), 1000 / fps, 800, 600); return [c.x, c.y, c.scale]; };
  const a = run(30), b = run(60), d = run(144);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - d[i]) < 1e-6 && Math.abs(b[i] - d[i]) < 1e-6, `component ${i}: ${a[i]} ${b[i]} ${d[i]}`);
  assert.ok(Math.abs(d[0] - 50) < 0.01 && Math.abs(d[1] - 30) < 0.01, 'and it arrives on the player');
});

test('it leads ahead of where the player is heading only while moving, and stays put with nobody to follow', () => {
  const still = createCameraController({ x: 0, y: 0 }), moving = createCameraController({ x: 0, y: 0 });
  for (let i = 0; i < 120; i++) { still.update(target({ angle: 0, moving: 0 }), 16, 800, 600); moving.update(target({ angle: 0, moving: 1 }), 16, 800, 600); }
  assert.ok(moving.x > still.x + 1, 'the view leads along the heading');
  const x = moving.x; moving.update(null, 16, 800, 600);
  assert.equal(moving.x, x, 'no target: it does not move');
});

test('it zooms out a little as the player grows, never past the cap, and copes with a collapsed window', () => {
  const small = createCameraController({ x: 0, y: 0 }), big = createCameraController({ x: 0, y: 0 });
  for (let i = 0; i < 400; i++) { small.update(target({ cells: 4 }), 16, 800, 600); big.update(target({ cells: 5000 }), 16, 800, 600); }
  assert.ok(big.view > small.view && big.view <= 20 + 3 + 1e-6, `${small.view} ${big.view}`);
  const c = createCameraController({ x: 0, y: 0 });
  for (const [w, h] of [[0, 0], [1, 1], [200, 120], [3840, 2160]]) { c.update(target(), 16, w, h); assert.ok(Number.isFinite(c.scale) && c.scale > 0, `${w}x${h}`); }
});

test('a shake decays to nothing and a stronger one is never cut short by a weaker one', () => {
  const c = createCameraController({ x: 0, y: 0 });
  c.kick(0.9); c.kick(0.3);
  assert.equal(c.shaking, 0.9);
  assert.ok(Math.abs(c.shakeOffset(() => 1).dx) > 0);
  for (let i = 0; i < 400; i++) c.update(null, 16, 800, 600);
  assert.equal(c.shaking, 0); assert.deepEqual(c.shakeOffset(() => 1), { dx: 0, dy: 0 });
  c.kick(5); assert.equal(c.shaking, 1, 'capped at 1');
});

test('the 3D camera is pitched 50 degrees, never yawed, and shows the same arena width on any screen shape', () => {
  assert.equal(CAMERA_3D.pitchDeg, 50);
  const p = pose3D(40, 25, 20, 16 / 9);
  assert.equal(p.lookAt.x, 40); assert.equal(p.lookAt.z, 25); assert.equal(p.lookAt.y, 0);
  assert.equal(p.position.x, 40, 'zero yaw: straight behind the look-at point, no sideways offset');
  const pitch = Math.atan2(p.position.y, p.position.z - 25) * 180 / Math.PI;
  assert.ok(Math.abs(pitch - 50) < 1e-9, `pitch ${pitch}`);
  const half = Math.tan(CAMERA_3D.fovDeg * Math.PI / 360);
  for (const aspect of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 21 / 9]) {          // the shorter side always spans `view` cells at the look-at point
    const q = pose3D(0, 0, 20, aspect), shorterCells = 2 * q.distance * half * Math.min(aspect, 1);
    assert.ok(Math.abs(shorterCells - 20) < 1e-9, `aspect ${aspect}: ${shorterCells}`);
  }
  const c = createCameraController({ x: 10, y: 10 }); c.update(target({ x: 10, y: 10 }), 16, 390, 844);
  assert.ok(c.pose().position.y > 0 && c.pose(90).position.z === 10 + c.pose(90).distance * Math.cos(Math.PI / 2), 'a controller can give any pitch, 90 being straight down');
});
