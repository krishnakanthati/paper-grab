import test from 'node:test';
import assert from 'node:assert/strict';
import { createRig } from '../../src/render3d/rig.ts';
import { createCharacter } from '../../src/render3d/model.ts';
import { decorGeometryCount } from '../../src/render3d/decor.ts';
import { SPECIES } from '../../src/render3d/index.ts';
import { pickTextureBudget, textureBytes } from '../../src/ui/picker/budget.ts';
import { GLOBE } from '../../src/ui/picker/mapScene.ts';
import { CAPTIVES_MAX } from '../../src/config.ts';
import { game } from '../helpers.mjs';

const V = (t) => ({ f: 0.5, dtMs: 16, nowMs: 100000 + t * 16, scale: 30 });

test('characters come and go without piling up: shared geometry is cached once, and every disposed character leaves nothing behind', () => {
  for (const sp of SPECIES) createCharacter(0xef4b4b, sp).dispose();
  const baseline = decorGeometryCount();
  for (let round = 0; round < 40; round++) for (const sp of SPECIES) { const c = createCharacter(0xef4b4b, sp); c.dispose(); }
  assert.equal(decorGeometryCount(), baseline, 'the geometry cache did not grow');
});

test('a long game of captures, merges and deaths keeps the scene graph small and returns to empty', () => {
  const G = game(8); G.startGame();
  const rig = createRig(G, undefined);
  let peak = 0, t = 0;
  for (let round = 0; round < 60; round++) {
    const me = G.players[0], other = G.players[1 + (round % (G.players.length - 1))];
    me.captives = [...new Set([...me.captives, other.id])].slice(-CAPTIVES_MAX);       // capture, and capture again
    for (let k = 0; k < 8; k++) { me.px = me.x; me.py = me.y; me.x += 0.2; rig.update(V(t++)); }
    peak = Math.max(peak, rig.scene.children.length);
    if (round % 7 === 6) { me.captives = []; for (let k = 0; k < 40; k++) rig.update(V(t++)); }      // freed: they shrink away and are removed
  }
  const bound = G.players.length + CAPTIVES_MAX * G.players.length;
  assert.ok(peak <= bound, `scene had ${peak} objects, more than the ${bound} that could ever be needed`);
  G.players[0].captives = [];
  for (let k = 0; k < 60; k++) rig.update(V(t++));
  assert.equal(rig.scene.children.length, G.players.length, 'only the players themselves remain once nobody is in a chain');
  rig.dispose();
});

test('texture budget: phones and low-memory devices get smaller textures than a desktop, and never more than the GPU allows', () => {
  const desktop = pickTextureBudget({ coarse: false, deviceMemoryGB: 8, maxTexture: 16384 });
  const phone = pickTextureBudget({ coarse: true, deviceMemoryGB: 6, maxTexture: 8192 });
  const lowEnd = pickTextureBudget({ coarse: false, deviceMemoryGB: 2, maxTexture: 8192 });
  assert.equal(desktop.colour, GLOBE.tex.desktop);
  assert.ok(phone.colour < desktop.colour && lowEnd.colour <= phone.colour);
  assert.equal(lowEnd.colour, GLOBE.tex.low);
  assert.ok(lowEnd.overlay <= phone.overlay && phone.overlay <= desktop.overlay);
  const tiny = pickTextureBudget({ coarse: false, maxTexture: 1024 });
  for (const v of Object.values(tiny)) assert.ok(v <= 1024, 'never over the GPU limit');
  assert.ok(tiny.quick <= tiny.colour && tiny.bump <= tiny.colour);
  assert.equal(pickTextureBudget({ coarse: false, maxTexture: 8192 }).colour, GLOBE.tex.desktop, 'unknown memory is treated as plenty');
});

test('the picker\'s textures fit a sensible memory budget on every tier', () => {
  const MB = 1024 * 1024;
  const tiers = { desktop: { coarse: false, deviceMemoryGB: 8 }, phone: { coarse: true, deviceMemoryGB: 6 }, lowEnd: { coarse: true, deviceMemoryGB: 2 } };
  const limits = { desktop: 260, phone: 130, lowEnd: 60 };            // MB of GPU memory, while the start panel is showing (freed once you play)
  for (const [name, d] of Object.entries(tiers)) {
    const bytes = textureBytes(pickTextureBudget({ ...d, maxTexture: 16384 }));
    assert.ok(bytes.gpu / MB <= limits[name], `${name}: ${(bytes.gpu / MB).toFixed(0)} MB GPU is over ${limits[name]} MB`);
    assert.ok(bytes.cpu <= bytes.gpu);
  }
});

test('on touch screens the characters (and their captives) are drawn 10% larger, positions unchanged', () => {
  const G = game(6); G.startGame();
  const rigA = createRig(G, undefined), rigB = createRig(G, undefined);
  const me = G.players[0]; me.captives = [2];
  for (let t = 0; t < 40; t++) { me.px = me.x; me.py = me.y; me.x += 0.2; rigA.update({ ...V(t), boost: 1 }); rigB.update({ ...V(t), boost: 1.1 }); }
  const a = rigA.chars.get(1).c.ground, b = rigB.chars.get(1).c.ground;
  assert.ok(Math.abs(b.scale.x / a.scale.x - 1.1) < 1e-6, 'the character is 10% larger');
  assert.ok(Math.abs(b.position.x - a.position.x) < 1e-9 && Math.abs(b.position.y - a.position.y) < 1e-9, 'but stands in the same place');
  const fa = rigA.chains.get(1).followers[0].c.ground, fb = rigB.chains.get(1).followers[0].c.ground;
  assert.ok(Math.abs(fb.scale.x / fa.scale.x - 1.1) < 1e-6, 'and so are its captives');
  rigA.dispose(); rigB.dispose();
});

import { CHARACTER as CH } from '../../src/render3d/tuning.ts';
test('the touch-screen size boost is the earlier 10%, 15%, 10% and 10% plus another 25%', () => {
  assert.ok(Math.abs(CH.mobileBoost - 1.1 * 1.15 * 1.1 * 1.1 * 1.25) < 1e-9);
});

import { charPx } from '../../src/render3d/rig.ts';
import { CAMERA } from '../../src/config.ts';
test('characters are 37.5% larger everywhere and never shrink below a readable size, however far the camera zooms out', () => {
  assert.ok(Math.abs(CH.sizeBoost - 1.375) < 1e-9);
  assert.ok(Math.abs(charPx({ scale: 60, boost: CH.sizeBoost }) - 82.5) < 1e-9, '37.5% larger than the plain cell size');
  assert.ok(charPx({ scale: 12, baseScale: 40, boost: 1 }) >= 40 * CH.minShareOfStart, 'a far-out camera cannot make them much smaller than at the start');
  assert.equal(charPx({ scale: 80 }), 80, 'and up close it is just the cell size');
  for (let sc = 5; sc <= 200; sc += 5) assert.ok(charPx({ scale: sc, baseScale: 60, boost: 1 }) >= 60 * CH.minShareOfStart);
  assert.ok(CAMERA.maxGrowth <= 4, 'the camera zooms out very little as you grow: ' + CAMERA.maxGrowth);
  const worstZoom = (CAMERA.baseView) / (CAMERA.baseView + CAMERA.maxGrowth);
  assert.ok(worstZoom >= 0.85, `at most ${(100 - worstZoom * 100).toFixed(0)}% smaller at full zoom-out`);
});
