import test from 'node:test';
import { DEATH } from '../../src/render3d/death.ts';
import assert from 'node:assert/strict';
import { Trail } from '../../src/render3d/chain.ts';
import { createRig } from '../../src/render3d/rig.ts';
import { CHAIN } from '../../src/render3d/tuning.ts';
import { game } from '../helpers.mjs';

test('a captive follows exactly the path the leader walked, the right distance behind it', () => {
  const t = new Trail(0.1);
  for (let x = 0; x <= 5.0001; x += 0.05) t.push(x, 0);
  const p = t.at(2);
  assert.ok(Math.abs(p.x - 3) < 0.06 && Math.abs(p.y) < 1e-9, `at(2) = ${p.x}`);
  assert.ok(Math.abs(p.angle) < 1e-9, 'it travels in the +x direction');
});

test('round a corner the follower takes the corner too, not a shortcut', () => {
  const t = new Trail(0.1);
  for (let x = 0; x <= 4; x += 0.05) t.push(x, 0);              // east
  for (let y = 0.05; y <= 3; y += 0.05) t.push(4, y);           // then south
  const p = t.at(4);                                            // 3 cells back down the south leg, then 1 more along the east leg
  assert.ok(Math.abs(p.x - 3) < 0.07 && Math.abs(p.y) < 0.07, `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  assert.ok(Math.abs(p.angle) < 0.05, 'and faces east, the way it was going there');
  const q = t.at(1.5);
  assert.ok(Math.abs(q.x - 4) < 0.07 && Math.abs(q.y - 1.5) < 0.07);
  assert.ok(Math.abs(q.angle - Math.PI / 2) < 0.05, 'facing south on the south leg');
});

test('before the path is long enough, the follower waits at the start; and a stationary head is safe', () => {
  const t = new Trail(0.1);
  assert.deepEqual([t.at(3).x, t.at(3).y], [0, 0]);
  t.push(2, 2); t.push(2, 2); t.push(2, 2);
  const p = t.at(5);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.angle));
});

test('trim keeps memory bounded without cutting the path the followers still need', () => {
  const t = new Trail(0.1);
  for (let x = 0; x <= 200; x += 0.05) t.push(x, 0);
  t.trim(10);
  assert.ok(t.pts.length < 400, 'old path is dropped');
  const p = t.at(8);
  assert.ok(Math.abs(p.x - 192) < 0.2, 'but 8 cells back is still right');
});

const VIEW = (over = {}) => ({ f: 0.5, dtMs: 16, nowMs: 100000, scale: 30, ...over });

test('capturing a player puts a small version of them in a chain behind you; it is freed when you die', () => {
  const G = game(3); G.startGame();
  const rig = createRig(G, undefined);
  const me = G.players[0];
  me.captives = [2, 3];
  for (let t = 0; t < 40; t++) { me.px = me.x; me.py = me.y; me.x += 0.2; rig.update(VIEW({ nowMs: 100000 + t * 16 })); }
  const ch = rig.chains.get(1);
  assert.equal(ch.followers.length, 2);
  const lead = rig.chars.get(1).c.ground, f0 = ch.followers[0].c.ground, f1 = ch.followers[1].c.ground;
  assert.ok(f0.scale.x < lead.scale.x, 'captives are smaller than their captor');
  assert.ok(f0.position.x < lead.position.x && f1.position.x < f0.position.x, 'they trail behind, in order');
  me.captives = [2];
  for (let t = 0; t < 40; t++) rig.update(VIEW({ nowMs: 101000 + t * 16 }));
  assert.equal(ch.followers.length, 1, 'a freed captive shrinks away and is removed');
  me.alive = false;
  rig.update(VIEW({ nowMs: 103000 }));
  assert.equal(rig.chains.has(1), false, 'a dead captor drops its chain');
  rig.dispose();
  assert.ok(CHAIN.spacing > 0);
});

test('captives are three quarters of normal size and never overlap, on any screen size', () => {
  assert.ok(Math.abs(CHAIN.scale - 0.75) < 1e-9);
  const G = game(4); G.startGame();
  for (const scale of [14, 30, 84]) {                           // the smallest, a typical and the largest pixels-per-cell
    const rig = createRig(G, undefined), me = G.players[0];
    me.captives = [2, 3];
    for (let t = 0; t < 120; t++) { me.px = me.x; me.py = me.y; me.x += 0.2; rig.update({ f: 0.5, dtMs: 16, nowMs: 100000 + t * 16, scale }); }
    const lead = rig.chars.get(1).c.ground, [a, b] = rig.chains.get(1).followers.map(f => f.c.ground);
    assert.ok(a.scale.x / lead.scale.x <= 0.75 + 0.02, `a captive is at most 3/4 of its leader's size at ${scale}px per cell`);
    if (scale >= 30) assert.ok(Math.abs(a.scale.x / lead.scale.x - 0.75) < 0.02, 'and exactly 3/4 when not capped');
    const gap = Math.hypot(lead.position.x - a.position.x, lead.position.z - a.position.z), gap2 = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);      // already in cells
    assert.ok(gap > 0.7 && gap2 > 0.7, `neighbours stay a body apart in cells at ${scale}px per cell (${gap.toFixed(2)}, ${gap2.toFixed(2)})`);
    rig.dispose();
  }
});

test('when a captor is captured, its chain moves into the new captor\'s chain with the same characters (not rebuilt)', () => {
  const G = game(5); G.startGame();
  const rig = createRig(G, undefined);
  const a = G.players[0], b = G.players[1];
  a.captives = [3];
  const V = (t) => ({ f: 0.5, dtMs: 16, nowMs: 100000 + t * 16, scale: 30 });
  for (let t = 0; t < 30; t++) rig.update(V(t));
  const held = rig.chains.get(1).followers[0].c;
  a.alive = false; b.captives = [3, 1];                          // b captured a: a's chain, then a itself
  for (let t = 30; t < 70; t++) rig.update(V(t));
  assert.equal(rig.chains.get(2).followers.length, 1, 'a is still playing its angel death: only its old chain has moved over so far');
  assert.ok(rig.chains.get(2).followers[0].c === held, 'the same character carried over');
  for (let t = 70; t < 70 + Math.ceil(DEATH.ms / 16) + 30; t++) rig.update(V(t));
  const chain = rig.chains.get(2);
  assert.equal(chain.followers.length, 2, 'and a joins once its death is over');
  assert.ok(chain.followers.find(f => f.victim === 3).c === held, 'the same character carried over');
  assert.equal(rig.chains.has(1), false, 'the dead captor has no chain of its own');
  rig.dispose();
});

test('slots() agrees with at() for every captive position, in one pass', () => {
  const t = new Trail(0.1);
  for (let x = 0; x <= 4; x += 0.05) t.push(x, 0);
  for (let y = 0.05; y <= 3; y += 0.05) t.push(4, y);
  for (let x = 3.95; x >= 1; x -= 0.05) t.push(x, 3);
  const s = t.slots(6, 0.92);
  s.forEach((p, i) => { const q = t.at((i + 1) * 0.92); assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-6, `slot ${i}`); });
  assert.equal(new Trail(0.1).slots(3, 1).length, 3, 'an empty path still gives every captive a place');
});

import { followerPx } from '../../src/render3d/rig.ts';
import { CAPTIVE, captiveDistance } from '../../src/config.ts';
import { CHARACTER as CHR } from '../../src/render3d/tuning.ts';
test('the chain keeps a gap at every character size: web, phones, and a camera zoomed far out', () => {
  const body = CHR.bodySize[0];                                       // a character's width in cells at size 1
  const cases = [['web', 1.1, 60, 60], ['phone', 1.1 * CHR.mobileBoost, 24, 24], ['small phone', 1.1 * CHR.mobileBoost, 18, 18], ['phone zoomed out', 1.1 * CHR.mobileBoost, 14, 18], ['web zoomed out', 1.1, 40, 60]];     // [name, boost, camera scale, scale at the start]
  for (const [name, boost, scale, baseScale] of cases) {
    const v = { scale, baseScale, boost };
    const lead = (Math.max(scale, baseScale * CHR.minShareOfStart) * boost) / scale * body;               // the leader's width in cells
    const fol = followerPx(v) / scale * body;                                              // a captive's width in cells
    assert.ok(fol <= CAPTIVE.spacing - 0.05, `${name}: captives ${fol.toFixed(2)} cells wide leave a gap in ${CAPTIVE.spacing}`);
    assert.ok(fol >= body * 0.5, `${name}: and are not tiny (${fol.toFixed(2)})`);
    assert.ok(captiveDistance(0) - (lead / 2 + fol / 2) >= 0.05, `${name}: the first captive clears the leader (${(captiveDistance(0) - lead / 2 - fol / 2).toFixed(2)} gap)`);
  }
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(captiveDistance(i + 1) - captiveDistance(i) - CAPTIVE.spacing) < 1e-9, 'even steps down the chain');
});
test('the rules and the picture agree on where each captive is (the first has the extra offset)', () => {
  const t = new Trail(0.1);
  for (let x = 0; x <= 12; x += 0.05) t.push(x, 0);
  const s = t.slots(4, CAPTIVE.spacing, CAPTIVE.firstOffset);
  s.forEach((p, i) => { const q = t.at(captiveDistance(i)); assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-6, `slot ${i}`); });
  assert.ok(Math.abs(s[0].x - (12 - captiveDistance(0))) < 0.06);
});

import { layoutChain, CHARACTER as CH2 } from '../../src/render3d/tuning.ts';
test('captives are the same share of the leader\'s size on every screen: a phone widens the chain spacing instead of shrinking them', () => {
  const body = CH2.bodySize[0];
  const share = (boost) => { const v = { scale: 30, baseScale: 30, boost }; return (followerPx(v) / 30) / (Math.max(30, 30 * CH2.minShareOfStart) * boost / 30); };
  const webBoost = CH2.sizeBoost, phoneBoost = CH2.sizeBoost * CH2.mobileBoost;
  try {
    layoutChain(false, webBoost);
    assert.equal(CAPTIVE.spacing, 1.9, 'web keeps its tuned spacing');
    const web = share(webBoost);
    layoutChain(true, phoneBoost);
    assert.ok(CAPTIVE.spacing > 1.9 + 0.3, 'the phone chain is spaced wider');
        const phone = share(phoneBoost);
    assert.ok(Math.abs(phone - CHAIN_SCALE_FOR_TEST) < 0.02 && Math.abs(web - CHAIN_SCALE_FOR_TEST) < 0.02, `both ${CHAIN_SCALE_FOR_TEST} of the leader (web ${web.toFixed(3)}, phone ${phone.toFixed(3)})`);
    const fol = followerPx({ scale: 30, baseScale: 30, boost: phoneBoost }) / 30 * body;
    assert.ok(fol * CHAIN.footprint <= CAPTIVE.spacing * 0.85, 'clear gap, judged on look: ' + (fol * CHAIN.footprint).toFixed(2) + ' vs ' + CAPTIVE.spacing.toFixed(2));
    assert.ok(captiveDistance(0) - (phoneBoost * body / 2 + fol / 2) >= 0.05, 'the first one clears the leader');
  } finally { layoutChain(false, webBoost); }
});
const CHAIN_SCALE_FOR_TEST = 0.75;

test('in the rig a captive is drawn at three quarters of its captor\'s size on web and phones, across the camera\'s real zoom range', () => {
  for (const [name, boost] of [['web', CH2.sizeBoost], ['phone', CH2.sizeBoost * CH2.mobileBoost]]) {
    for (const scale of [30, 28, 26.1]) {                                 // from the start of a round to fully zoomed out (about 13% closer-in cells)
      layoutChain(boost > CH2.sizeBoost, boost);
      try {
        const G = game(2); G.startGame();
        const rig = createRig(G, undefined);
        const lead = G.players[1], cap = G.players[2];
        lead.captives = [cap.id]; cap.capturedBy = lead.id; cap.alive = false;
        for (let t = 0; t < 120; t++) { lead.x += 0.3; lead.px = lead.x - 0.3; rig.update({ f: 1, dtMs: 16, nowMs: 1e6 + t * 16, scale, baseScale: 30, boost }); }
        const L = rig.chars.get(lead.id).c.ground.scale.x, F = rig.chains.get(lead.id).followers[0].c.ground.scale.x;
        assert.ok(Math.abs(F / L - 0.75) < 0.03, `${name} at scale ${scale}: captive is ${(F / L).toFixed(2)} of its captor`);
      } finally { layoutChain(false, CH2.sizeBoost); }
    }
  }
});
