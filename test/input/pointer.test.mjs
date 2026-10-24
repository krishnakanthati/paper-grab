import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {};
globalThis.window = { innerWidth: 1000, innerHeight: 600, addEventListener: (t, fn) => { (handlers[t] ??= []).push(fn); } };
const { bindPointer, MOUSE_DEADZONE_PX, DRAG_MIN_PX } = await import('../../src/input/pointer.ts');

const targets = [];
let suppressed = false;
const game = { running: true, setTarget: (a) => targets.push(a) };
bindPointer(game, () => {}, () => suppressed);
const move = (x, y, type = 'mouse') => handlers.pointermove.forEach(h => h({ clientX: x, clientY: y, pointerType: type }));
const downAt = (x, y) => handlers.pointerdown.forEach(h => h({ clientX: x, clientY: y, pointerType: 'touch' }));
const reset = () => { targets.length = 0; suppressed = false; game.running = true; };

test('the mouse steers towards the cursor, measured from the screen centre, on any screen size', () => {
  reset();
  move(500 + 100, 300);                                            // right of centre
  assert.ok(Math.abs(targets.at(-1)) < 1e-9);
  move(500, 300 + 100);                                            // below centre
  assert.ok(Math.abs(targets.at(-1) - Math.PI / 2) < 1e-9);
  globalThis.window.innerWidth = 360; globalThis.window.innerHeight = 640;   // a phone: the centre moves
  move(180, 320 - 80);                                             // above the NEW centre
  assert.ok(Math.abs(targets.at(-1) + Math.PI / 2) < 1e-9);
  globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 600;
});

test('a mouse resting near the centre does not steer (dead zone)', () => {
  reset();
  move(500 + MOUSE_DEADZONE_PX - 2, 300);
  assert.equal(targets.length, 0);
});

test('touch: the direction of the latest stroke is the heading, and strokes shorter than the minimum are ignored', () => {
  reset();
  downAt(100, 100);
  move(100 + DRAG_MIN_PX - 3, 100, 'touch');
  assert.equal(targets.length, 0);
  move(100 + 60, 100, 'touch');
  assert.ok(Math.abs(targets.at(-1)) < 1e-9);
  move(100 + 60, 100 + 40, 'touch');                              // then down (re-anchored at the previous point)
  assert.ok(Math.abs(targets.at(-1) - Math.PI / 2) < 1e-9);
});

test('while a key or button is held, the pointer is ignored; and nothing steers when the game is not running', () => {
  reset(); suppressed = true; move(900, 300);
  assert.equal(targets.length, 0);
  reset(); game.running = false; move(900, 300);
  assert.equal(targets.length, 0);
});
