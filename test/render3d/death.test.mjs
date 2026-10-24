import test from 'node:test';
import assert from 'node:assert/strict';
import { DEATH, deathPose } from '../../src/render3d/death.ts';
import { createRig } from '../../src/render3d/rig.ts';
import { game } from '../helpers.mjs';

test('a death is a hit, then an angel straight away: halo and wings pop out, it floats up upright, then shrinks away (no tumble, no bounce, no lying on the floor)', () => {
  const heading = 0;
  const hit = deathPose(0.04, heading), early = deathPose(0.2, heading), mid = deathPose(0.5, heading), late = deathPose(0.9, heading), end = deathPose(1, heading);
  assert.ok(hit.squash < 0.8, 'the hit squashes it');
  assert.equal(deathPose(0, heading).angel, 0, 'not an angel before it is hit');
  assert.ok(early.angel > 0.9, 'the halo and wings are out almost immediately');
  assert.ok(deathPose(DEATH.angelFrom + DEATH.angelGrow * 0.6, heading).angel > 1, 'and they overshoot a little, so they pop');
  for (let u = 0; u <= 1; u += 0.02) { const p = deathPose(u, heading); assert.equal(p.roll, 0, 'always upright'); assert.equal(p.yaw, 0, 'no spinning'); assert.equal(p.dx, 0); assert.equal(p.dy, 0); assert.ok(p.lift >= -1e-9, 'never below the ground'); }
  assert.ok(mid.lift > early.lift && late.lift > mid.lift, 'it floats up');
  assert.ok(late.lift > 1.8 && late.lift < 3.5, 'hovering well clear of the ground');
  assert.equal(deathPose(0.1, heading).eyesShut, true);
  assert.equal(deathPose(DEATH.fadeFrom - 0.02, heading).scale, 1, 'full size until the fade begins');
  assert.ok(deathPose(0.95, heading).scale < 1 && deathPose(0.95, heading).scale > 0, 'then it shrinks away');
  assert.equal(end.done, true); assert.equal(end.scale, 0);
  void late;
});

test('every value stays finite and sane across the whole animation, whatever the heading', () => {
  for (const h of [0, Math.PI / 2, Math.PI, -2.4, 5.9]) {
    for (let t = -0.2; t <= 1.3; t += 0.01) {
      const p = deathPose(t, h);
      for (const v of [p.dx, p.dy, p.lift, p.yaw, p.roll, p.squash, p.scale, p.angel]) assert.ok(Number.isFinite(v));
      assert.ok(p.squash > 0.2 && p.squash <= 1 && p.scale >= 0 && p.scale <= 1 && p.angel >= 0, `t=${t.toFixed(2)}`);
    }
  }
});

test('a dying character carries a visible halo and two wings of several feathers each, shown only while it is an angel', async () => {
  const { createCharacter } = await import('../../src/render3d/model.ts');
  const c = createCharacter(0xef4b4b);
  const angel = c.facing.children[c.facing.children.length - 1];
  assert.equal(angel.visible, false, 'hidden normally');
  c.setAngel(1, 0.3);
  assert.equal(angel.visible, true);
  const wings = angel.children.filter(o => o.children.length >= 4);
  assert.equal(wings.length, 2, 'two wings, each made of several feathers');
  c.setAngel(0, 0); assert.equal(angel.visible, false);
  c.dispose();
});

const V = (t) => ({ f: 0.5, dtMs: 16, nowMs: 100000 + t * 16, ox: 0, oy: 0, scale: 30 });
test('in the rig a character that dies stays on screen for the animation, then disappears; a respawn cancels it', () => {
  const G = game(2); G.startGame();
  const rig = createRig(G, undefined);
  const bot = G.players[1];
  for (let t = 0; t < 5; t++) rig.update(V(t));
  const c = rig.chars.get(bot.id).c;
  assert.equal(c.ground.visible, true);
  bot.alive = false;
  rig.update(V(5));
  assert.equal(rig.dying(), 1);
  assert.equal(c.ground.visible, true, 'still there, floating up');
  const before = c.ground.position.x;
  for (let t = 6; t < 60; t++) rig.update(V(t));
  assert.equal(c.ground.position.x, before, 'it stays where it died');
  assert.ok(c.facing.position.z > 0.15, 'and floats up');
  for (let t = 30; t < 5 + Math.ceil(DEATH.ms / 16) + 4; t++) rig.update(V(t));
  assert.equal(c.ground.visible, false, 'gone when the animation is over');
  assert.equal(rig.dying(), 0);
  bot.alive = false; rig.update(V(200));                       // dead for a long time already: no animation
  assert.equal(rig.dying(), 0);
  rig.dispose();
});

test('a captured player joins its captor\'s chain only after its angel death is over: never drawn in two places at once', () => {
  const G = game(2); G.startGame();
  const rig = createRig(G, undefined);
  const human = G.players[0], bot = G.players[1];
  for (let t = 0; t < 5; t++) rig.update(V(t));
  bot.alive = false; human.captives = [bot.id];                     // killed and taken captive in the same instant
  const followers = () => (rig.chains.get(human.id)?.followers ?? []).filter(f => f.victim === bot.id).length;
  for (let t = 5; t < 5 + Math.floor(DEATH.ms / 16) - 6; t++) { rig.update(V(t)); assert.equal(followers(), 0, 'still an angel: not in the chain yet'); }
  assert.equal(rig.chars.get(bot.id).c.ground.visible, true, 'the angel is still on screen');
  for (let t = 5 + Math.floor(DEATH.ms / 16) - 6; t < 5 + Math.ceil(DEATH.ms / 16) + 8; t++) rig.update(V(t));
  assert.equal(rig.chars.get(bot.id).c.ground.visible, false, 'the angel has gone');
  rig.update(V(400));
  assert.equal(followers(), 1, 'now it joins the chain');
  rig.dispose();
});
