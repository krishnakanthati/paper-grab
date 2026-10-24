import test from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, CAMERA } from '../../src/config.ts';
import { createCameraController } from '../../src/render/cameraController.ts';
import { createEffects } from '../../src/render/effects.ts';
import { createParticles3D } from '../../src/scene/particles3d.ts';
import { alone, game, startWithRoom } from '../helpers.mjs';

function rig() {
  const G = game(8);
  const me = startWithRoom(G); alone(G);
  const camera = createCameraController({ x: G.NX / 2, y: G.NY / 2 }), particles = createParticles3D();
  const kicks = [];
  const spyCam = { kick: (s) => { kicks.push(s); camera.kick(s); } };
  const effects = createEffects(G, particles, spyCam);
  return { G, me, camera, particles, effects, kicks };
}
/** What the scene renderer feeds the camera controller for the player each frame. */
const targetOf = (G, f = 0.5) => { const me = G.players[0]; return { x: me.px + (me.x - me.px) * f, y: me.py + (me.y - me.py) * f, angle: me.angle, moving: Math.min(1, Math.hypot(me.x - me.px, me.y - me.py) / 0.2), cells: G.counts[1] }; };

test('your own death is the biggest jolt; a distant fight shakes less, and a far-away one not at all', () => {
  const { G, me, effects, kicks } = rig();
  const other = G.players[1]; other.alive = true;
  effects.kill(me);                                                     // you
  const own = kicks.at(-1);
  assert.ok(own >= 0.4 && own <= 1, `your own death is a firm but not violent jolt: ${own}`);
  other.x = me.x + 5; other.y = me.y; effects.kill(other);
  const near = kicks.at(-1);
  other.x = me.x + 20;  effects.kill(other);
  const mid = kicks.at(-1);
  assert.ok(near < own && near > mid && mid > 0, `kicks should fall with distance: ${near} then ${mid}`);
  const before = kicks.length;
  other.x = me.x + EFFECTS.kickFarCells + 5; effects.kill(other);
  assert.equal(kicks.length, before, 'a fight beyond the far limit still shook the view');
});

test('a capture pulses a ring and shakes in proportion to its size, up to a cap', () => {
  const { me, particles, effects, kicks } = rig();
  effects.capture(me, new Array(40).fill(0));
  const small = kicks.at(-1);
  effects.capture(me, new Array(3000).fill(0));
  const big = kicks.at(-1);
  assert.ok(small < big && big <= EFFECTS.captureKickMax + 1e-12, `${small} then ${big}`);
  assert.ok(particles.ringCount >= 2, 'captures should add rings');
});

test('impact rings expand, fade and then disappear', () => {
  const p = createParticles3D();
  p.ring(10, 10, 0xff0000, 3, 400);
  assert.equal(p.ringCount, 1);
  p.update(100); p.update(100);
  assert.equal(p.ringCount, 1);
  p.update(300);
  assert.equal(p.ringCount, 0, 'the ring should be gone after its duration');
});

test('particles are capped, and fewer are made on a struggling device', () => {
  const p = createParticles3D();
  for (let i = 0; i < 50; i++) p.burst(0, 0, 0xffffff, 40, 3, 0.3);
  assert.ok(p.count <= EFFECTS.maxParticles, `${p.count} particles exceeds the cap`);
  const slow = createParticles3D(); slow.setDensity(0.15);
  for (let i = 0; i < 50; i++) slow.burst(0, 0, 0xffffff, 40, 3, 0.3);
  assert.ok(slow.count < p.count * 0.3, `the slow device made ${slow.count} vs ${p.count}`);
  const off = createParticles3D(); off.setDensity(0); off.burst(0, 0, 0, 40, 3, 0.3);
  assert.equal(off.count, 0);
});

test('dust: one puff per interval behind a head that is out on a line, at the same rate whatever the frame rate; none while at home', () => {
  const count = (frameMs) => {
    const { G, me, particles, effects } = rig();
    me.trail = [1, 2, 3];                                               // out on a line
    for (let t = 0; t < 2000; t += frameMs) effects.dust(frameMs);
    return particles.count;
  };
  const a = count(8), b = count(33), expected = Math.floor(2000 / EFFECTS.dustEveryMs);
  assert.ok(Math.abs(a - expected) <= 2 && Math.abs(b - expected) <= 2, `dust puffs: ${a} at 125 fps, ${b} at 30 fps, expected about ${expected}`);
  const { particles, effects } = rig();                                 // at home: no trail
  for (let t = 0; t < 2000; t += 16) effects.dust(16);
  assert.equal(particles.count, 0);
});

test('the camera looks ahead in the direction you are heading, easing in, and does not lurch when you stop', () => {
  const G = game(9); const me = startWithRoom(G); alone(G);
  const cam = createCameraController({ x: G.NX / 2, y: G.NY / 2 });
  me.x = me.px = 60; me.y = me.py = 30; me.angle = 0;
  for (let i = 0; i < 90; i++) cam.update(targetOf(G), 16, 1000, 700);                       // standing still: no look-ahead
  const still = cam.x;
  assert.ok(Math.abs(still - 60) < 0.05, 'a stationary camera should sit on the head: ' + still);
  me.px = 59.8;                                                          // now moving east at speed
  for (let i = 0; i < 200; i++) cam.update(targetOf(G), 16, 1000, 700);
  assert.ok(cam.x > still + CAMERA.lookAhead * 0.6, `the camera should lead ahead: ${cam.x}`);
  me.angle = Math.PI;                                                    // turn right round to head west
  me.px = 60.2;
  for (let i = 0; i < 300; i++) cam.update(targetOf(G), 16, 1000, 700);
  assert.ok(cam.x < 60 - CAMERA.lookAhead * 0.6, 'the look-ahead should swing round with the heading');
});

test('camera kicks: a stronger one wins over a weaker one still playing, and shaking fades out', () => {
  const cam = createCameraController({ x: 10, y: 10 });
  cam.kick(0.2); cam.kick(0.9); cam.kick(0.3);
  assert.equal(cam.shaking, 0.9);
  for (let i = 0; i < 400; i++) cam.update(null, 16, 800, 600);
  assert.equal(cam.shaking, 0);
  cam.kick(5);
  assert.equal(cam.shaking, 1, 'a kick is capped at 1');
});

test('the camera copes with a collapsed or tiny window and with huge ones', () => {
  const G = game(11); startWithRoom(G); alone(G);
  const cam = createCameraController({ x: 10, y: 10 });
  for (const [w, h] of [[0, 0], [1, 1], [200, 120], [320, 568], [3840, 2160], [10000, 300]]) {
    cam.update(targetOf(G), 16, w, h);
    assert.ok(Number.isFinite(cam.scale) && cam.scale > 0, `${w}x${h}`);
    const p = cam.pose(); assert.ok(Number.isFinite(p.position.y) && Number.isFinite(p.distance), `pose at ${w}x${h}`);
  }
});
