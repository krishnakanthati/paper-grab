import test from 'node:test';
import assert from 'node:assert/strict';
import { enterFullscreen, fullscreenOnFirstGesture } from '../../src/platform/fullscreen.ts';

const host = (over = {}) => {
  const calls = [];
  return { calls, fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: opts => { calls.push(opts); return Promise.resolve(); } }, ...over };
};

test('asks for fullscreen when it is allowed and not already on', () => {
  const h = host(); enterFullscreen(h);
  assert.equal(h.calls.length, 1);
});

test('does nothing when already fullscreen, disallowed, or unsupported', () => {
  for (const over of [{ fullscreenElement: {} }, { fullscreenEnabled: false }, { documentElement: {} }]) {
    const h = host(over); enterFullscreen(h); assert.equal(h.calls.length, 0);
  }
});

test('a rejected or throwing request never escapes', () => {
  enterFullscreen(host({ documentElement: { requestFullscreen: () => Promise.reject(new Error('no')) } }));
  enterFullscreen(host({ documentElement: { requestFullscreen: () => { throw new Error('no'); } } }));
});

test('the first gesture listeners remove themselves', () => {
  const handlers = new Map();
  const target = { addEventListener: (e, f) => handlers.set(e, f), removeEventListener: e => handlers.delete(e) };
  const h = host();
  fullscreenOnFirstGesture(target, h);
  assert.equal(handlers.size, 3);
  handlers.get('pointerdown')();
  assert.equal(handlers.size, 0);
  assert.equal(h.calls.length, 1);
});
