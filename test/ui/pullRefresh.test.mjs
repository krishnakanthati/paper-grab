import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL, resist, progressOf, maxPull } from '../../src/ui/pullRefresh.ts';

test('the rubber band starts at zero, only ever grows, and never passes its maximum', () => {
  assert.equal(resist(0), 0);
  assert.equal(resist(-50), 0);
  let prev = 0;
  for (let dy = 1; dy <= 2000; dy += 7) { const r = resist(dy); assert.ok(r >= prev && r < PULL.max, `dy ${dy}: ${r}`); prev = r; }
});

test('resistance builds: each extra finger px moves the panel less than the one before', () => {
  const step = (a) => resist(a + 10) - resist(a);
  assert.ok(step(0) > step(60) && step(60) > step(160) && step(160) > step(400));
  assert.ok(resist(10) > 7, 'it should still feel responsive at the start');
});

test('the threshold is reachable with a normal drag but not instantly', () => {
  let dy = 0; while (resist(dy) < PULL.threshold) dy++;
  assert.ok(dy > 70 && dy < 260, 'finger travel needed: ' + dy);
  assert.ok(PULL.hold < PULL.threshold && PULL.threshold < PULL.max);
});

test('progress is clamped to 0..1 and hits 1 exactly at the threshold', () => {
  assert.equal(progressOf(-5), 0);
  assert.equal(progressOf(0), 0);
  assert.equal(progressOf(PULL.threshold), 1);
  assert.equal(progressOf(PULL.max), 1);
  assert.ok(Math.abs(progressOf(PULL.threshold / 2) - 0.5) < 1e-9);
});

import { idleFrameDue } from '../../src/loop.ts';
test('while nothing moves the scene is redrawn only now and then, but at once when the screen changes', () => {
  assert.equal(idleFrameDue(16, false), false);
  assert.equal(idleFrameDue(499, false), false);
  assert.equal(idleFrameDue(500, false), true);
  assert.equal(idleFrameDue(1, true), true, 'a resize or a new arena is drawn immediately');
});

import { characterKeyStep } from '../../src/ui/characters/picker.ts';
test('left and right arrows flip the character, but not while typing in the search box or with a shortcut held', () => {
  assert.equal(characterKeyStep({ key: 'ArrowLeft', target: { tagName: 'BODY' } }), -1);
  assert.equal(characterKeyStep({ key: 'ArrowRight', target: { tagName: 'DIV' } }), 1);
  assert.equal(characterKeyStep({ key: 'ArrowRight' }), 1, 'no particular target');
  assert.equal(characterKeyStep({ key: 'ArrowRight', target: { tagName: 'INPUT' } }), 0, 'the arrows move the caret in the search box');
  assert.equal(characterKeyStep({ key: 'ArrowLeft', target: { tagName: 'TEXTAREA' } }), 0);
  assert.equal(characterKeyStep({ key: 'ArrowLeft', target: { tagName: 'DIV', isContentEditable: true } }), 0);
  assert.equal(characterKeyStep({ key: 'ArrowLeft', ctrlKey: true }), 0); assert.equal(characterKeyStep({ key: 'ArrowRight', altKey: true }), 0); assert.equal(characterKeyStep({ key: 'ArrowLeft', metaKey: true }), 0);
  for (const k of ['ArrowUp', 'ArrowDown', 'a', 'd', 'Enter', ' ']) assert.equal(characterKeyStep({ key: k }), 0, `${k} is not for the character`);
});

test('the pull can follow the finger up to half the screen, with almost no resistance at first, and never past that', () => {
  assert.equal(maxPull(800), 400, 'half of an 800 px tall screen');
  assert.equal(maxPull(2000), 1000);
  assert.equal(maxPull(200), PULL.max, 'a tiny screen still gets the minimum allowance');
  assert.equal(maxPull(0), PULL.max); assert.equal(maxPull(-5), PULL.max);
  const max = maxPull(900);
  let prev = 0;
  for (let dy = 1; dy <= 6000; dy += 9) { const r = resist(dy, max); assert.ok(r >= prev && r < max, `dy ${dy}: ${r}`); prev = r; }
  assert.ok(resist(20, max) > 17, 'fully flexible: the panel keeps up with the finger at the start');
  assert.ok(resist(max, max) > max * 0.55, 'and it can reach well down the screen');
  assert.ok(resist(max * 3, max) > max * 0.9, 'approaching half the screen without ever passing it');
});
test('arming does not depend on screen height: the same short pull triggers a refresh on a tall screen', () => {
  const arm = (max) => { let dy = 0; while (resist(dy, max) < PULL.threshold) dy++; return dy; };
  assert.ok(Math.abs(arm(maxPull(1200)) - arm(maxPull(500))) < 40, 'about the same finger travel');
  assert.ok(arm(maxPull(900)) < 130);
});
