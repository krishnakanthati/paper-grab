import test from 'node:test';
import assert from 'node:assert/strict';
const { bindDpad } = await import('../../src/input/dpad.ts');

function fakeButton(dir) {
  const h = {};
  return { dataset: { dir: String(dir) }, addEventListener: (t, fn) => { (h[t] ??= []).push(fn); }, setPointerCapture() {}, fire: (t, e) => (h[t] ?? []).forEach(fn => fn({ preventDefault() {}, ...e })) };
}
const buttons = [0, 1, 2, 3].map(fakeButton);                       // up, right, down, left
const root = { querySelectorAll: () => buttons };
const targets = [];
const dpad = bindDpad(root, { setTarget: (a) => targets.push(a) }, () => {});
const deg = (r) => Math.round((r * 180) / Math.PI);

test('one finger on a button steers that way', () => {
  targets.length = 0;
  buttons[1].fire('pointerdown', { pointerId: 1 });
  assert.equal(deg(targets.at(-1)), 0);
  buttons[1].fire('pointerup', { pointerId: 1 });
});

test('two fingers on two buttons give a diagonal; lifting one falls back to the other', () => {
  targets.length = 0;
  buttons[0].fire('pointerdown', { pointerId: 1 });                 // up
  buttons[1].fire('pointerdown', { pointerId: 2 });                 // right
  assert.equal(deg(targets.at(-1)), -45);
  assert.equal(dpad.anyHeld(), true);
  buttons[0].fire('pointerup', { pointerId: 1 });
  assert.equal(deg(targets.at(-1)), 0);
  buttons[1].fire('pointercancel', { pointerId: 2 });
  assert.equal(dpad.anyHeld(), false);
});

test('a finger sliding off its button (lost capture) releases it instead of leaving the direction stuck', () => {
  buttons[3].fire('pointerdown', { pointerId: 9 });
  assert.equal(dpad.anyHeld(), true);
  buttons[3].fire('lostpointercapture', { pointerId: 9 });
  assert.equal(dpad.anyHeld(), false);
});
