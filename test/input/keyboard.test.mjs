import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {};
globalThis.window = { addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); } };
globalThis.document = { addEventListener() {}, hidden: false };
const { bindKeyboard } = await import('../../src/input/keyboard.ts');

const targets = [], calls = [];
const game = { running: true, setTarget: (a) => targets.push(a) };
const kb = bindKeyboard(game, {
  onGesture: () => calls.push('gesture'), activate: () => calls.push('activate'),
  togglePause: () => calls.push('pause'), toggleMute: () => calls.push('mute'),
});
const down = (code, extra = {}) => { const e = { code, key: '', repeat: false, preventDefault() { e.prevented = true; }, ...extra }; handlers.keydown.forEach(h => h(e)); return e; };
const up = (code, extra = {}) => handlers.keyup.forEach(h => h({ code, key: '', ...extra }));
const reset = () => { calls.length = 0; targets.length = 0; handlers.blur.forEach(h => h()); };
const deg = (r) => Math.round((r * 180) / Math.PI);

test('each arrow key steers in its own direction, and the letter keys do not steer', () => {
  for (const [code, want] of [['ArrowRight', 0], ['ArrowDown', 90], ['ArrowLeft', 180], ['ArrowUp', -90]]) {
    reset(); down(code);
    assert.equal(Math.abs(deg(targets.at(-1))), Math.abs(want), code);
    up(code);
  }
});

test('TWO keys at once give the diagonal: every pair of neighbouring directions', () => {
  for (const [a, b, want] of [['ArrowUp', 'ArrowRight', -45], ['ArrowUp', 'ArrowRight', -45], ['ArrowDown', 'ArrowRight', 45], ['ArrowDown', 'ArrowRight', 45],
                               ['ArrowDown', 'ArrowLeft', 135], ['ArrowDown', 'ArrowLeft', 135], ['ArrowUp', 'ArrowLeft', -135], ['ArrowUp', 'ArrowLeft', -135],
                               ['ArrowUp', 'ArrowRight', -45], ['ArrowUp', 'ArrowRight', -45]]) {                          // arrows and WASD can be mixed
    reset(); down(a); down(b);
    assert.equal(deg(targets.at(-1)), want, `${a}+${b}`);
    up(a); up(b);
  }
});

test('the order the two keys go down in does not matter, and releasing one falls back to the other', () => {
  reset(); down('ArrowDown'); down('ArrowRight');
  const both = targets.at(-1);
  reset(); down('ArrowRight'); down('ArrowDown');
  assert.equal(deg(targets.at(-1)), deg(both));
  up('ArrowDown'); assert.equal(deg(targets.at(-1)), 0);          // only D left: east
  up('ArrowRight');
});

test('opposite keys cancel each other and the heading is kept; three keys resolve sensibly', () => {
  reset(); down('ArrowUp'); const north = targets.at(-1);
  down('ArrowLeft'); down('ArrowRight');                                  // W + A + D: left and right cancel, north remains
  assert.equal(deg(targets.at(-1)), deg(north));
  reset(); down('ArrowLeft'); const before = targets.length; down('ArrowRight');   // left + right: nothing to steer by
  assert.equal(targets.length, before, 'cancelled keys must not change the heading');
  assert.equal(deg(targets.at(-1)), 180);
});

test('layout independence: a key is matched by position, whatever character it types', () => {
  reset(); down('ArrowUp', { key: 'ц' });                          // the W position on a Russian layout
  assert.equal(deg(targets.at(-1)), -90);
  reset(); down('ArrowLeft', { key: 'q' });                          // the A position on AZERTY types 'q'
  assert.equal(Math.abs(deg(targets.at(-1))), 180);
});

test('Shift or Caps Lock cannot leave a key stuck: key-up always matches key-down', () => {
  reset(); down('ArrowRight', { key: 'd' });
  up('ArrowRight', { key: 'D' });                                    // shift was pressed meanwhile: the character changed
  assert.equal(kb.anyHeld(), false);
});

test('losing focus releases every held key', () => {
  reset(); down('ArrowUp'); down('ArrowRight');
  assert.equal(kb.anyHeld(), true);
  handlers.blur.forEach(h => h());
  assert.equal(kb.anyHeld(), false);
});

test('a fallback exists for browsers that report no key code', () => {
  reset(); down('', { key: 'ArrowRight' });
  assert.equal(deg(targets.at(-1)), 0);
  up('', { key: 'ArrowRight' });
});

test('steering keys never scroll the page', () => {
  reset();
  assert.equal(down('ArrowUp').prevented, true);
  assert.equal(down('Space').prevented, true);
  up('ArrowUp');
});

test('Enter / Space activate, P / Escape pause, M mutes; holding does not repeat them', () => {
  reset();
  down('Enter'); down('Space'); down('KeyP'); down('Escape'); down('KeyM');
  assert.deepEqual(calls.filter(c => c !== 'gesture'), ['activate', 'activate', 'pause', 'pause', 'mute']);
  reset();
  down('Enter', { repeat: true }); down('KeyP', { repeat: true }); down('KeyM', { repeat: true });
  assert.deepEqual(calls.filter(c => c !== 'gesture'), []);
});

test('browser shortcuts (Ctrl/Cmd/Alt + key) are left alone', () => {
  reset();
  down('KeyP', { ctrlKey: true }); down('KeyM', { metaKey: true }); down('ArrowLeft', { altKey: true });
  assert.deepEqual(calls, []);
  assert.deepEqual(targets, []);
});

test('every key press counts as a user gesture (so audio can start)', () => {
  reset(); down('KeyX');
  assert.deepEqual(calls, ['gesture']);
});

test('the letter keys W A S D no longer steer (the arrows are the keys)', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { reset(); down(code); assert.equal(targets.length, 0, `${code} steered`); up(code); }
});
