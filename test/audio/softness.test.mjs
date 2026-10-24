import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSfx } from '../../src/audio/sfx.ts';
import { foldHz, softWave, shapeNote } from '../../src/audio/synth.ts';
import { AUDIO } from '../../src/audio/tuning.ts';

test('pitches are folded below the ceiling by octaves, and a glide keeps its shape', () => {
  assert.equal(foldHz(440), 440);
  assert.ok(foldHz(2000) <= AUDIO.maxHz && foldHz(2000) > AUDIO.maxHz / 2, 'folded to just under the ceiling');
  assert.ok(Math.abs(foldHz(1760) - 880) < 1e-9);
  const g = shapeNote(2000, 1000, 'sine');
  assert.ok(Math.abs(g.glideTo / g.hz - 0.5) < 1e-9, 'the glide ratio is unchanged');
  assert.equal(shapeNote(300, undefined, 'sine').glideTo, undefined);
});

test('harsh waveforms play as triangles; soft ones are left alone', () => {
  assert.equal(softWave('square'), 'triangle'); assert.equal(softWave('sawtooth'), 'triangle');
  assert.equal(softWave('sine'), 'sine'); assert.equal(softWave('triangle'), 'triangle');
});

test('every sound effect, as actually played, is low, round and soft', () => {
  const played = [];
  const synth = {
    ctx: () => ({ currentTime: 0 }), sfx: () => ({}), panned: () => ({}),
    note: (_dest, hz, t, dur, type, vol, glideTo, attack) => { const n = shapeNote(hz, glideTo, type); played.push({ ...n, vol, attack: Math.max(attack ?? 0, AUDIO.minAttackSec), dur }); },
  };
  const sfx = createSfx(synth);
  sfx.start(); sfx.leaveHome(); sfx.enemyLand(); sfx.intruder(0, 1); sfx.landLost(); sfx.crown();
  for (let i = 0; i < 12; i++) sfx.milestone(i);
  for (const c of [1, 20, 200, 2000]) { sfx.capture(c); sfx.otherCapture(c, 0, 1); }
  sfx.clash(); sfx.otherKill(0, 1); sfx.cut(); sfx.death(); sfx.win(); sfx.beaconSpawn(0, 1); sfx.beacon(0, 1, true); sfx.beacon(0.4, 0.5, false); sfx.powerup("boost", 0, 1); sfx.powerup("shield", 0, 1); sfx.powerup("freeze", 0.4, 0.5);
  assert.ok(played.length > 60, 'the cues play many notes');
  for (const n of played) {
    assert.ok(n.hz <= AUDIO.maxHz + 1e-9, `a note at ${n.hz.toFixed(0)} Hz is shrill`);
    assert.ok(n.glideTo === undefined || n.glideTo <= AUDIO.maxHz + 1e-9, 'and so is the end of a glide');
    assert.ok(n.type === 'sine' || n.type === 'triangle', `${n.type} is buzzy`);
    assert.ok(n.vol <= 0.32, `a note at volume ${n.vol} is too loud`);
    assert.ok(n.attack >= AUDIO.minAttackSec, 'no instant, clicky starts');
  }
  const mean = played.reduce((s, n) => s + n.hz, 0) / played.length;
  assert.ok(mean < 600, `the average pitch is ${mean.toFixed(0)} Hz: warm, not piercing`);
});

test('the source has no square or sawtooth voices left in the effects, and the bus is tone-shaped', () => {
  const sfx = fs.readFileSync(new URL('../../src/audio/sfx.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sfx, /'square'|'sawtooth'/);
  assert.ok(AUDIO.lowpassHz <= 3200 && AUDIO.shelfDb < 0, 'the top of the spectrum is rolled off');
  assert.ok(AUDIO.sfxGain <= 1.3, 'and the overall level is moderate');
});
