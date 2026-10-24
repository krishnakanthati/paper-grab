import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal WebAudio mock: records what gets scheduled so the real synth code runs without a browser.
const log = { osc: 0, gain: 0, started: 0, panners: 0, convolvers: 0, sources: 0, timers: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
let clock = 0;
class MockCtx {
  constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
  get currentTime() { return clock; }
  createGain() { log.gain++; return node({ gain: param() }); }
  createOscillator() { log.osc++; return node({ type: 'sine', frequency: param(), start() { log.started++; }, stop() {} }); }
  createBuffer(c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  createBufferSource() { log.sources++; return node({ loop: false, start() { log.started++; } }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param(), gain: param() }); }
  createConvolver() { log.convolvers++; return node({ buffer: null }); }
  createStereoPanner() { log.panners++; return node({ pan: param() }); }
  createDynamicsCompressor() { return node({ threshold: param(), ratio: param(), attack: param(), release: param() }); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: MockCtx, setInterval: () => { log.timers++; return 1; } };

const { createSound, midiToHz, placeFromMe, gameSounds } = await import('../../src/audio/index.ts');
const { createGame } = await import('../../src/game/index.ts');
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test('midiToHz maps A4 to 440 and octaves double', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9);
});

test('there is NO background sound: unlocking and then letting time pass schedules nothing at all', () => {
  const s = createSound();
  s.unlock();
  assert.equal(log.osc, 0, 'an oscillator is running with nothing happening');
  assert.equal(log.sources, 0, 'a noise/buffer source is running with nothing happening');
  assert.equal(log.timers, 0, 'a timer is scheduling background audio');
  clock += 120;                                                   // two minutes pass
  assert.equal(log.osc, 0);
});

test('nothing is created before a user gesture; every cue is a silent no-op until then', () => {
  const before = { ...log };
  const s = createSound();
  s.start(); s.capture(20); s.cut(); s.death(); s.win(); s.clash(); s.leaveHome(); s.enemyLand(); s.intruder(0, 1); s.landLost(); s.crown(); s.milestone(2);
  s.otherCapture(5, 0, 1); s.otherKill(0, 1);
  assert.equal(log.osc, before.osc);
});

test('every interaction makes a sound once unlocked', () => {
  const s = createSound();
  s.unlock();
  for (const [name, play] of Object.entries({
    start: () => s.start(), capture: () => s.capture(40), cut: () => s.cut(), death: () => s.death(), win: () => s.win(), clash: () => s.clash(),
    leaveHome: () => s.leaveHome(), enemyLand: () => s.enemyLand(), intruder: () => s.intruder(0.3, 0.8), landLost: () => s.landLost(),
    crown: () => s.crown(), milestone: () => s.milestone(0), otherCapture: () => s.otherCapture(20, -0.4, 0.7), otherKill: () => s.otherKill(0.4, 0.7),
  })) {
    clock += 5;                                                  // beyond every cooldown
    const before = log.osc;
    play();
    assert.ok(log.osc > before, `the "${name}" interaction made no sound`);
  }
});

test('no cue uses noise: nothing ever creates a buffer source (no hiss, ever)', () => {
  const s = createSound();
  s.unlock();
  for (let i = 0; i < 30; i++) { clock += 5; s.capture(30); s.cut(); s.death(); s.clash(); s.enemyLand(); s.milestone(i); s.win(); }
  assert.equal(log.sources, 0);
});

test('repeating events are throttled so crossing several territories cannot machine-gun', () => {
  const s = createSound();
  s.unlock();
  clock += 10;
  let before = log.osc;
  s.enemyLand();
  const one = log.osc - before;
  before = log.osc;
  for (let i = 0; i < 20; i++) s.enemyLand();                    // the same instant: all inside the cooldown
  assert.equal(log.osc, before, 'the cue repeated inside its cooldown');
  clock += 0.5;
  before = log.osc;
  s.enemyLand();
  assert.equal(log.osc - before, one, 'the cue should play again after its cooldown');
});

test('the room reverb exists, and other players\' events are positioned in the stereo field', () => {
  const s = createSound();
  s.unlock();
  assert.ok(log.convolvers >= 1);
  clock += 5;
  const before = log.panners;
  s.otherCapture(30, -0.7, 0.8); clock += 1; s.otherKill(0.9, 0.5); clock += 1; s.intruder(0.1, 0.9); clock += 1; s.clash(-0.5, 0.4);
  assert.equal(log.panners - before, 4);
});

test('YouTube audio setting, the mute button and pausing all silence the output, and the icon hears about each', () => {
  const s = createSound();
  const seen = [];
  s.onAudibleChange(a => seen.push(a));
  s.unlock();
  assert.equal(s.audible(), true);
  s.setYouTubeEnabled(false); assert.equal(s.audible(), false);
  s.setYouTubeEnabled(true);
  assert.equal(s.toggleMute(), false);
  assert.equal(s.toggleMute(), true);
  s.setPaused(true); assert.equal(s.audible(), false);
  s.setPaused(false); assert.equal(s.audible(), true);
  assert.deepEqual(seen.slice(-6), [false, true, false, true, false, true]);
});

test('distant events pan towards their side and fade with distance', () => {
  const G = createGame(rng(6));
  G.startGame();
  const me = G.players[0];
  const right = placeFromMe(G, me.x + 10, me.y), left = placeFromMe(G, me.x - 10, me.y);
  assert.ok(right.pan > 0.3 && left.pan < -0.3);
  assert.ok(placeFromMe(G, me.x + 3, me.y).vol > placeFromMe(G, me.x + 30, me.y).vol);
  assert.equal(placeFromMe(G, me.x + 500, me.y).vol, 0);
});

// ---- which sound each game event gets ----
function setup(seed) {
  const G = createGame(rng(seed)); G.startGame();
  const calls = [];
  const s = new Proxy({}, { get: (t, k) => (...a) => calls.push([k, ...a]) });
  return { G, h: gameSounds(s, () => G), calls, me: G.players[0], foe: G.players[1], third: G.players[2], fourth: G.players[3] };
}

test('you die in a head-on crash: clash then the defeat sting; any other death: just the sting', () => {
  const { h, calls, me, foe } = setup(8);
  h.onKill(me, foe, 'head-on crash');
  assert.deepEqual(calls.map(c => c[0]), ['clash', 'death']);
  calls.length = 0; h.onKill(me, foe, 'cut by blue');
  assert.deepEqual(calls.map(c => c[0]), ['death']);
});

test('you win a fight: clash for head-on, the snip for cutting a line or catching an intruder', () => {
  const { h, calls, me, foe } = setup(9);
  h.onKill(foe, me, 'head-on crash'); assert.deepEqual(calls.map(c => c[0]), ['clash']);
  calls.length = 0; h.onKill(foe, me, 'cut by you'); assert.deepEqual(calls.map(c => c[0]), ['cut']);
  calls.length = 0; h.onKill(foe, me, "caught on you's land"); assert.deepEqual(calls.map(c => c[0]), ['cut']);
});

test('fights between other players are heard from where they happen, and fade out when far away', () => {
  const { h, calls, me, third, fourth } = setup(10);
  third.x = me.x + 8; third.y = me.y;
  h.onKill(third, fourth, 'head-on crash');
  assert.equal(calls[0][0], 'clash'); assert.ok(calls[0][1] > 0, 'a fight to your right should pan right');
  calls.length = 0; h.onKill(third, fourth, 'cut by teal'); assert.equal(calls[0][0], 'otherKill');
  calls.length = 0; third.x = me.x + 400; h.onKill(third, fourth, 'head-on crash'); assert.deepEqual(calls, []);
});

test('your captures play the fanfare; other players\' captures are quieter and positioned', () => {
  const { h, calls, me, third } = setup(11);
  h.onCapture(me, new Array(30).fill(0)); assert.deepEqual(calls, [['capture', 30]]);
  calls.length = 0; third.x = me.x - 6; third.y = me.y; h.onCapture(third, new Array(30).fill(0));
  assert.equal(calls[0][0], 'otherCapture'); assert.ok(calls[0][2] < 0);
});

test('leaving your land, stepping onto someone else\'s colour, and an enemy stepping onto yours each have a cue', () => {
  const { h, calls, me, third } = setup(12);
  h.onLeaveHome(me); assert.deepEqual(calls, [['leaveHome']]);
  calls.length = 0; h.onLeaveHome(third); assert.deepEqual(calls, [], 'other players leaving home are not your business');
  h.onEnterEnemyLand(me, 3); assert.deepEqual(calls, [['enemyLand']]);
  calls.length = 0; third.x = me.x + 4; third.y = me.y; h.onEnterEnemyLand(third, 1);
  assert.equal(calls[0][0], 'intruder'); assert.ok(calls[0][1] > 0);
  calls.length = 0; h.onEnterEnemyLand(third, 4); assert.deepEqual(calls, [], 'two other players\' land is not your business');
});

test('losing land, taking the crown and passing a milestone each have a cue; only YOUR losses and YOUR crown', () => {
  const { h, calls, me, third } = setup(13);
  h.onLandLost(me, third, 12); assert.deepEqual(calls, [['landLost']]);
  calls.length = 0; h.onLandLost(third, me, 12); assert.deepEqual(calls, []);
  h.onLeader(1); assert.deepEqual(calls, [['crown']]);
  calls.length = 0; h.onLeader(3); assert.deepEqual(calls, []);
  h.onMilestone(2); assert.deepEqual(calls, [['milestone', 2]]);
});
