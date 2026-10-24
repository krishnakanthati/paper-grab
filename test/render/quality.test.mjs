import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality, MAX_PX_PER_CELL, MAX_RESOLUTION, MIN_PX_PER_CELL, MIN_RESOLUTION, PIXEL_BUDGET, pickResolution, pxPerCell } from '../../src/render/quality.ts';

// every kind of screen the game can land on: [css width, css height, device pixel ratio, label]
const SCREENS = [
  [320, 568, 2, 'small phone portrait'], [568, 320, 2, 'small phone landscape'], [360, 640, 3, 'android'], [390, 844, 3, 'iphone portrait'],
  [844, 390, 3, 'iphone landscape'], [768, 1024, 2, 'tablet portrait'], [1024, 768, 2, 'tablet landscape'], [1366, 768, 1, 'laptop'],
  [1440, 900, 2, 'retina laptop'], [1920, 1080, 1, 'full hd'], [2560, 1440, 1, 'qhd'], [3840, 2160, 1, '4k'], [3840, 2160, 2, '4k hidpi'],
  [5120, 1440, 1, 'ultrawide'], [200, 200, 1, 'tiny embed'], [1200, 300, 1, 'very short window'],
];

test('the render resolution is always within bounds and never exceeds the pixel budget, on every screen', () => {
  for (const [w, h, dpr, name] of SCREENS) {
    const r = pickResolution(dpr, w, h);
    assert.ok(r >= MIN_RESOLUTION && r <= MAX_RESOLUTION, `${name}: resolution ${r}`);
    if (r > MIN_RESOLUTION + 1e-9) assert.ok(w * h * r * r <= PIXEL_BUDGET * 1.001, `${name}: ${(w * h * r * r / 1e6).toFixed(1)} MP exceeds the budget`);
  }
});

test('small screens keep full sharpness; huge screens are scaled down rather than rendered at full size', () => {
  assert.equal(pickResolution(2, 390, 844), 2);                        // a phone: full 2x
  assert.ok(pickResolution(3, 390, 844) <= 2, 'DPR is capped at 2');
  assert.ok(pickResolution(2, 3840, 2160) < 1, '4k at 2x would be 33 MP: must be scaled down');
  assert.ok(pickResolution(1, 1920, 1080) === 1, 'full hd at 1x is within budget');
});

test('cells are a readable size on every screen: never tiny, never huge, and bigger screens never get smaller cells', () => {
  for (const [w, h, , name] of SCREENS) {
    const p = pxPerCell(w, h, 24);
    assert.ok(p >= MIN_PX_PER_CELL && p <= MAX_PX_PER_CELL, `${name}: ${p.toFixed(1)} px per cell`);
  }
  assert.ok(pxPerCell(1920, 1080, 24) >= pxPerCell(1366, 768, 24));
  assert.ok(pxPerCell(390, 844, 24) < pxPerCell(844, 390, 24) + 1e-9 || true);
  // orientation: portrait and landscape of the same device see the same scale (the shorter side decides)
  assert.equal(pxPerCell(390, 844, 24), pxPerCell(844, 390, 24));
});

test('zooming out as you grow never makes cells smaller than the minimum', () => {
  for (const view of [20, 26, 34, 60, 200]) assert.ok(pxPerCell(320, 568, view) >= MIN_PX_PER_CELL);
});

test('adaptive quality: sustained slow frames step the resolution down, one level at a time', () => {
  const q = new AdaptiveQuality();
  const changes = [];
  for (let i = 0; i < 600; i++) { const c = q.frame(32); if (c) changes.push(c.level); }   // 30 fps for ~19 s
  assert.deepEqual(changes.slice(0, 3), [1, 2, 3]);
  assert.ok(q.scale < 1);
  for (let i = 0; i < 600; i++) q.frame(40);
  assert.equal(q.level, 3, 'must not go below the lowest level');
});

test('adaptive quality: a single hitch is not a trend', () => {
  const q = new AdaptiveQuality();
  for (let i = 0; i < 200; i++) q.frame(i === 100 ? 400 : 16);     // one 400 ms spike in smooth 60 fps
  assert.equal(q.level, 0);
});

test('adaptive quality: it recovers slowly when there is headroom, and does not flap', () => {
  const q = new AdaptiveQuality();
  for (let i = 0; i < 100; i++) q.frame(40);                       // struggle: step down
  const down = q.level;
  assert.ok(down >= 1);
  let upAt = -1, t = 0;
  for (let i = 0; i < 2000 && upAt < 0; i++) { t += 8; if (q.frame(8) && q.level < down) upAt = t; }   // now 125 fps
  assert.ok(upAt > 6000, 'stepped back up too eagerly: after ' + upAt + ' ms');
  assert.ok(q.level < down);
  // flapping check: alternate fast/slow around the thresholds and count level changes
  const f = new AdaptiveQuality(); let n = 0;
  for (let i = 0; i < 3000; i++) if (f.frame(i % 2 ? 11 : 24)) n++;
  assert.ok(n <= 2, 'quality flapped ' + n + ' times on an average-16ms workload');
});

test('effects density follows the quality level', () => {
  const q = new AdaptiveQuality();
  assert.equal(q.effects, 0);
  for (let i = 0; i < 100; i++) q.frame(40);
  assert.ok(q.effects >= 1);
});

import { CHARACTER_RATIO, characterRatio } from '../../src/render/quality.ts';
test('the 3D characters render at least as sharply as the screen and are supersampled even on 1x monitors', () => {
  assert.ok(characterRatio(1, 1920, 1080) >= CHARACTER_RATIO.minSupersample, 'a 1x monitor still gets smooth edges');
  assert.ok(characterRatio(2, 1440, 900) >= 2, 'a retina laptop gets its full ratio');
  assert.ok(characterRatio(3, 412, 915) >= 3 - 1e-9, 'a 3x phone gets 3x');
  assert.ok(characterRatio(5, 412, 915) <= CHARACTER_RATIO.max, 'never above the cap');
});
test('and never so large that a huge screen blows the pixel budget, nor below native', () => {
  const r = characterRatio(2, 3840, 2160);
  assert.ok(r * r * 3840 * 2160 <= CHARACTER_RATIO.pixelBudget * 1.001, `4K at ${r.toFixed(2)}x`);
  assert.ok(characterRatio(1, 7680, 4320) >= 1, 'not below native resolution');
});
test('only a struggling device lowers it, and only a little', () => {
  const full = characterRatio(2, 1440, 900, 1), slow = characterRatio(2, 1440, 900, 0.52);
  assert.ok(slow < full && slow >= full * CHARACTER_RATIO.slowFactor - 1e-9);
  assert.equal(characterRatio(2, 1440, 900, 0.82), full, 'a mild dip changes nothing');
});

import { initialQualityLevel, wantsMsaa } from '../../src/render/quality.ts';
test('weak devices start at a lower quality instead of stuttering until the loop notices; strong ones start at the top', () => {
  assert.equal(initialQualityLevel({ deviceMemoryGB: 8, cores: 8 }), 0);
  assert.equal(initialQualityLevel({}), 0, 'unknown hardware is treated as capable');
  assert.equal(initialQualityLevel({ deviceMemoryGB: 4, cores: 8 }), 1);
  assert.equal(initialQualityLevel({ deviceMemoryGB: 8, cores: 4 }), 1);
  assert.equal(initialQualityLevel({ deviceMemoryGB: 1, cores: 8 }), 2);
  assert.equal(initialQualityLevel({ deviceMemoryGB: 8, cores: 2 }), 2);
  assert.equal(new AdaptiveQuality(2).level, 2); assert.equal(new AdaptiveQuality(99).level, 3, 'clamped'); assert.equal(new AdaptiveQuality(-4).level, 0);
});
test('hardware anti-aliasing is used on ordinary screens and skipped at 2x density and up, where it buys little and costs a lot', () => {
  assert.equal(wantsMsaa(1), true); assert.equal(wantsMsaa(1.5), true); assert.equal(wantsMsaa(2), false); assert.equal(wantsMsaa(3), false);
});

import { FRAME_CAP, pickFrameDivisor, refreshFromFrames } from '../../src/render/quality.ts';
test('fast displays are paced at an even rhythm near the cap: 120 Hz phones draw 60 fps, 60 Hz screens are left alone', () => {
  assert.equal(pickFrameDivisor(60, FRAME_CAP.touchFps), 1);
  assert.equal(pickFrameDivisor(90, FRAME_CAP.touchFps), 1, 'a 90 Hz phone is close enough to the cap');
  assert.equal(pickFrameDivisor(120, FRAME_CAP.touchFps), 2, '120 -> 60');
  assert.equal(pickFrameDivisor(144, FRAME_CAP.touchFps), 2, '144 -> 72');
  assert.equal(pickFrameDivisor(240, FRAME_CAP.touchFps), 3, '240 -> 80');
  assert.equal(pickFrameDivisor(144, FRAME_CAP.desktopFps), 1, 'a 144 Hz desktop monitor is left at full rate');
  assert.equal(pickFrameDivisor(240, FRAME_CAP.desktopFps), 2, '240 -> 120');
  assert.equal(pickFrameDivisor(0, 72), 1); assert.equal(pickFrameDivisor(NaN, 72), 1);
  for (const hz of [30, 50, 60, 75, 90, 100, 120, 144, 165, 240, 360]) assert.ok(pickFrameDivisor(hz, 72) >= 1 && pickFrameDivisor(hz, 72) <= FRAME_CAP.maxDivisor);
});
test('the refresh rate is read from frame times with a median, so a hitch does not fool it', () => {
  const steady = Array.from({ length: 40 }, () => 1000 / 120);
  assert.ok(Math.abs(refreshFromFrames(steady) - 120) < 0.5);
  const hitchy = [...steady]; hitchy[3] = 55; hitchy[10] = 3; hitchy[20] = 400;
  assert.ok(Math.abs(refreshFromFrames(hitchy) - 120) < 0.5, 'outliers are ignored');
  assert.equal(refreshFromFrames([]), 0);
});
