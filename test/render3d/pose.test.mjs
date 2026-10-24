import test from 'node:test';
import assert from 'node:assert/strict';
import { easeOutBack, newPoseState, poseFor } from '../../src/render3d/pose.ts';
import { CHARACTER as C } from '../../src/render3d/tuning.ts';

const TICK = 1 / 30;
const player = (over = {}) => ({ x: 10, y: 10, px: 10, py: 10, angle: 0, pa: 0, alive: true, ...over });

test('easeOutBack starts at 0, ends at 1, and overshoots a little in between (the spawn pop)', () => {
  assert.ok(Math.abs(easeOutBack(0)) < 1e-12);
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-12);
  assert.ok(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack)) > 1.02, 'no overshoot');
  assert.ok(Math.abs(easeOutBack(-3)) < 1e-12); assert.ok(Math.abs(easeOutBack(9) - 1) < 1e-12);
});

test('position is interpolated between logic ticks', () => {
  const p = player({ px: 10, py: 4, x: 10.4, y: 4 });
  const st = newPoseState(1);
  const a = poseFor(p, 0, TICK, 16, 1000, st), b = poseFor(p, 0.5, TICK, 16, 1016, st), c = poseFor(p, 1, TICK, 16, 1032, st);
  assert.ok(Math.abs(a.x - 10) < 1e-12 && Math.abs(b.x - 10.2) < 1e-12 && Math.abs(c.x - 10.4) < 1e-12);
});

test('heading is interpolated the SHORT way round the circle', () => {
  const p = player({ pa: Math.PI - 0.1, angle: -Math.PI + 0.1 });            // crossing the +-pi seam
  const mid = poseFor(p, 0.5, TICK, 16, 1000, newPoseState(1)).heading;
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 1e-9, 'went the long way round: ' + mid);
});

test('a character standing still does not bob, and a running one does', () => {
  const still = player(), run = player({ px: 10, x: 10 + 8 / 30 });
  const st1 = newPoseState(1), st2 = newPoseState(1);
  let maxStill = 0, maxRun = 0;
  for (let i = 0; i < 120; i++) {
    maxStill = Math.max(maxStill, poseFor(still, 0.5, TICK, 16, 1000 + i * 16, st1).bob);
    maxRun = Math.max(maxRun, poseFor(run, 0.5, TICK, 16, 1000 + i * 16, st2).bob);
  }
  assert.equal(maxStill, 0);
  assert.ok(maxRun > C.bobHeight * 0.8 && maxRun <= C.bobHeight + 1e-9, 'running bob ' + maxRun);
});

test('the feet swing in opposite directions while running', () => {
  const run = player({ px: 10, x: 10 + 8 / 30 });
  const st = newPoseState(2);
  let opposite = 0;
  for (let i = 0; i < 60; i++) { const p = poseFor(run, 0.5, TICK, 16, 1000 + i * 16, st); if (Math.abs(p.stepL + p.stepR) < 1e-12) opposite++; }
  assert.equal(opposite, 60);
});

test('leaning follows the turn: opposite turns lean opposite ways, and the lean is capped', () => {
  const left = player({ pa: 0, angle: -0.2 }), right = player({ pa: 0, angle: 0.2 });
  const sl = newPoseState(1), sr = newPoseState(1);
  let l = 0, r = 0;
  for (let i = 0; i < 20; i++) { l = poseFor(left, 0.5, TICK, 16, 1000 + i * 16, sl).lean; r = poseFor(right, 0.5, TICK, 16, 1000 + i * 16, sr).lean; }
  assert.ok(l * r < 0, 'both turns leaned the same way');
  assert.ok(Math.abs(l) <= C.maxLean + 1e-9 && Math.abs(r) <= C.maxLean + 1e-9);
  const hard = poseFor(player({ pa: 0, angle: 3 }), 0.5, TICK, 100000, 1000, newPoseState(1));
  assert.ok(Math.abs(hard.lean) <= C.maxLean + 1e-9);
});

test('a new life pops in: scale goes from 0 to 1 over the pop time, with an overshoot, then stays at 1', () => {
  const p = player();
  const st = newPoseState(1);
  const first = poseFor(p, 0.5, TICK, 16, 5000, st);
  assert.ok(first.scale < 0.05, 'should start almost invisible: ' + first.scale);
  let peak = 0;
  for (let t = 5000; t <= 5000 + C.popMs; t += 16) peak = Math.max(peak, poseFor(p, 0.5, TICK, 16, t, st).scale);
  assert.ok(peak > 1.02, 'no overshoot');
  assert.equal(poseFor(p, 0.5, TICK, 16, 5000 + C.popMs + 500, st).scale, 1);
});

test('blinking: the eyes close briefly now and then, and are open the rest of the time', () => {
  const p = player(), st = newPoseState(3);
  let closed = 0, open = 0, minBlink = 1;
  for (let t = 0; t < 20000; t += 16) { const b = poseFor(p, 0.5, TICK, 16, t, st).blink; minBlink = Math.min(minBlink, b); b < 0.5 ? closed++ : open++; }
  assert.ok(minBlink < 0.2, 'eyes never closed');
  assert.ok(closed > 0 && closed < open * 0.15, `closed for ${closed} of ${closed + open} frames`);
});

test('characters do not blink in lockstep (each has its own rhythm)', () => {
  const p = player();
  const times = [1, 2, 3, 4].map(seed => { const st = newPoseState(seed); for (let t = 0; t < 8000; t += 16) if (poseFor(p, 0.5, TICK, 16, t, st).blink < 0.5) return t; return -1; });
  assert.ok(new Set(times).size > 1, 'every character blinked at the same moment: ' + times);
});

test('squash is neutral at rest and stays within a sane range while running', () => {
  assert.equal(poseFor(player(), 0.5, TICK, 16, 1000, newPoseState(1)).squash, 1);
  const run = player({ px: 10, x: 10 + 8 / 30 }), st = newPoseState(1);
  for (let i = 0; i < 100; i++) { const s = poseFor(run, 0.5, TICK, 16, 1000 + i * 16, st).squash; assert.ok(s > 0.9 && s < 1.1, 'squash ' + s); }
});

import { emotionFor, EMOTION } from '../../src/render3d/pose.ts';
test('emotions: a capture makes it excited for a while, a rival near its open line scares it, a long line makes it determined', () => {
  const calm = { count: 20, captives: 0, outside: false, danger: false };
  const st = newPoseState(1);
  emotionFor(st, calm, 1000, 16);
  let e = emotionFor(st, { ...calm, count: 60 }, 1016, 16);                    // +40 cells in a frame: a capture
  for (let t = 1032; t < 1032 + 400; t += 16) e = emotionFor(st, { ...calm, count: 60 }, t, 16);
  assert.ok(e.pupil > 1.1 && e.eyeWide > 1.05, 'excited: big bright eyes');
  let sawHop = 0; for (let t = 1500; t < 1900; t += 16) sawHop = Math.max(sawHop, emotionFor(st, { ...calm, count: 60 }, t, 16).hop);
  assert.ok(sawHop > 0.01, 'and a little bounce');
  for (let t = 1900; t < 1900 + EMOTION.exciteMs + 2000; t += 16) e = emotionFor(st, { ...calm, count: 60 }, t, 16);
  assert.ok(Math.abs(e.pupil - 1) < 0.02 && e.hop < 0.005, 'it calms down again');
  const brave = newPoseState(2); let d;
  for (let t = 0; t < 800; t += 16) d = emotionFor(brave, { ...calm, outside: true }, t, 16);
  assert.ok(d.eyeOpen < 0.9, 'determined: narrowed eyes');
  const scared = newPoseState(3); let f, trembled = 0;
  for (let t = 0; t < 800; t += 16) { f = emotionFor(scared, { ...calm, outside: true, danger: true }, t, 16); trembled = Math.max(trembled, Math.abs(f.shake)); }
  assert.ok(f.pupil < 0.75 && f.eyeWide > 1.1 && trembled > 0.005, 'scared: tiny pupils, wide eyes, a tremble');
});

import { FLIP_KINDS, flipAt, flipDurationMs, pickFlipKind } from '../../src/render3d/pose.ts';
test('the flip is never the same trick twice in a row, every kind turns a full circle and lands flat', () => {
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const k = pickFlipKind(prev, () => (i * 0.6180339887) % 1); assert.notEqual(k, prev, 'repeated ' + k); seen.add(k); prev = k; }
  assert.equal(seen.size, FLIP_KINDS.length, 'every kind comes up');
  for (const kind of FLIP_KINDS) {
    let peakTurn = 0, peakLift = 0;
    for (let t = 0; t < 1; t += 0.005) { const f = flipAt(t, kind); peakTurn = Math.max(peakTurn, Math.abs(f.pitch), Math.abs(f.roll), Math.abs(f.yaw)); peakLift = Math.max(peakLift, f.lift); }
    assert.ok(peakTurn > Math.PI * 1.8, `${kind} turns most of the way round`);
    assert.ok(peakLift > 0.5, `${kind} leaves the ground`);
    const end = flipAt(1, kind); assert.ok(end.done && end.pitch === 0 && end.roll === 0 && end.yaw === 0 && end.squash === 1);
    assert.ok(flipDurationMs(kind) >= 700);
  }
  assert.ok(Math.abs(flipAt(0.5, 'back').pitch) > 0 && flipAt(0.5, 'back').pitch < 0, 'a back flip turns the other way');
  assert.ok(flipAt(0.5, 'double').pitch > flipAt(0.5, 'front').pitch, 'a double flip turns twice as far');
});

test('a capture pops the character: its size overshoots elastically, then settles back to exactly 1', () => {
  const st = newPoseState(1);
  const calm = { count: 20, captives: 0, outside: false, danger: false };
  emotionFor(st, calm, 1000, 16);
  let peak = 0, e = emotionFor(st, { ...calm, count: 60 }, 1016, 16);
  for (let t = 1032; t < 1032 + 1500; t += 16) { e = emotionFor(st, { ...calm, count: 60 }, t, 16); peak = Math.max(peak, e.pop); }
  assert.ok(peak > 0.03, 'it pops bigger: ' + peak);
  for (let t = 3000; t < 6000; t += 16) e = emotionFor(st, { ...calm, count: 60 }, t, 16);
  assert.ok(Math.abs(e.pop) < 0.002, 'and settles: ' + e.pop);
});
