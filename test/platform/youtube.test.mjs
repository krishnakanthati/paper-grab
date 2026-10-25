import test from 'node:test';
import assert from 'node:assert/strict';

async function load(win) {
  globalThis.window = win;
  return import('../../src/platform/youtube.ts?' + Math.random());   // fresh module per scenario
}
const sdk = (enabled) => ({ IN_PLAYABLES_ENV: false, system: { isAudioEnabled: () => enabled, onAudioEnabledChange: () => {} } });

test('opened directly (not inside YouTube), the SDK saying "audio off" must NOT mute the game', async () => {
  const top = {}; const win = { ytgame: sdk(false), self: top, top };
  const { bindAudio, inYouTube } = await load(win);
  const seen = [];
  bindAudio(on => seen.push(on));
  assert.equal(inYouTube(), false);
  assert.deepEqual(seen, [], 'the game muted itself because the SDK reported audio disabled outside YouTube');
});

test('framed by another site (itch.io, Poki...), the SDK saying "audio off" must NOT mute the game either', async () => {
  const win = { ytgame: sdk(false), self: {}, top: {} };         // self !== top: a frame, but the SDK says it is not in YouTube
  const { bindAudio, inYouTube } = await load(win);
  const seen = [];
  bindAudio(on => seen.push(on));
  assert.equal(inYouTube(), false);
  assert.deepEqual(seen, [], 'sound was muted just because the page sits in a frame');
});

test('inside YouTube, the audio setting is followed from the start and on every change', async () => {
  const listeners = [];
  const g = sdk(false); g.IN_PLAYABLES_ENV = true; g.system.onAudioEnabledChange = (cb) => listeners.push(cb);
  const win = { ytgame: g, self: {}, top: {} };
  const { bindAudio, inYouTube } = await load(win);
  const seen = [];
  bindAudio(on => seen.push(on));
  assert.equal(inYouTube(), true);
  assert.deepEqual(seen, [false]);
  listeners[0](true);
  assert.deepEqual(seen, [false, true]);
});

test('the SDK flag IN_PLAYABLES_ENV also counts as being in YouTube', async () => {
  const top = {}; const g = sdk(true); g.IN_PLAYABLES_ENV = true;
  const { inYouTube } = await load({ ytgame: g, self: top, top });
  assert.equal(inYouTube(), true);
});

test('with no SDK at all, every call is a harmless no-op', async () => {
  const top = {};
  const { signalReady, sendScore, bindAudio, bindPause } = await load({ self: top, top });
  signalReady(); sendScore(5); bindAudio(() => {}); bindPause(() => {}, () => {});
});

test('ready signals fire in the required order, and scores are sent as { value }', async () => {
  const log = [];
  const top = {};
  const win = { self: top, top, ytgame: { game: { firstFrameReady: () => log.push('first'), gameReady: () => log.push('ready') }, engagement: { sendScore: (s) => log.push(s) } } };
  const { signalReady, sendScore } = await load(win);
  signalReady(); sendScore(42);
  assert.deepEqual(log, ['first', 'ready', { value: 42 }]);
});
