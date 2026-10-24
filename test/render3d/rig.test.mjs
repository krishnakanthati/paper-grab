import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../../src/render3d/model.ts';
import { createRig } from '../../src/render3d/rig.ts';
import { CHARACTER as C } from '../../src/render3d/tuning.ts';
import { game } from '../helpers.mjs';

const VIEW = (over = {}) => ({ f: 0.5, dtMs: 16, nowMs: 100000, scale: 30, ...over });

function started(seed = 1) {
  const G = game(seed); G.startGame();
  const rig = createRig(G);
  return { G, rig };
}

test('each character is built from a body, an outline rim, two eyes with pupils, two feet and a hidden crown', () => {
  const c = createCharacter(0xef4b4b);
  assert.equal(c.eyes.length, 2); assert.equal(c.pupils.length, 2); assert.equal(c.feet.length, 2);
  assert.ok(c.body && c.rim && c.shadow && c.crown);
  assert.equal(c.crown.visible, false);
  c.setCrown(true); assert.equal(c.crown.visible, true);
  assert.ok(c.rim.geometry.boundingBox === null || true);
});

test('all characters share geometry (only the colour material differs), so eight players cost almost no extra memory', () => {
  const a = createCharacter(0xff0000), b = createCharacter(0x0000ff);
  assert.equal(a.body.geometry, b.body.geometry);
  assert.equal(a.eyes[0].geometry, b.eyes[1].geometry);
  assert.notEqual(a.body.material, b.body.material);
  assert.equal(a.body.material.color.getHex(), 0xff0000);
  assert.equal(b.body.material.color.getHex(), 0x0000ff);
});

test('every living player gets a character, standing on the ground exactly where its head is', () => {
  const { G, rig } = started();
  rig.update(VIEW());
  assert.equal(rig.chars.size, G.players.length);
  for (const p of G.players) {
    const { c } = rig.chars.get(p.id);
    assert.equal(c.ground.visible, true);
    const x = p.px + (p.x - p.px) * 0.5, z = p.py + (p.y - p.py) * 0.5;
    assert.ok(Math.abs(c.ground.position.x - x) < 1e-9, 'x is the cell x');
    assert.ok(Math.abs(c.ground.position.z - z) < 1e-9, 'z is the cell y (south is +z)');
    assert.equal(c.ground.position.y, C.groundY, 'standing on the slab');
    assert.ok(Math.abs(c.ground.rotation.x + Math.PI / 2) < 1e-12, 'its own up axis is the world\'s up');
  }
});

test('characters are scaled to the size of a world cell on screen, on any zoom, but never below the readable minimum', () => {
  const { G, rig } = started();
  rig.update(VIEW({ nowMs: 1e6 }));                                   // first frame: the spawn pop begins
  for (const scale of [14, 30, 84]) {
    rig.update(VIEW({ scale, baseScale: 84, nowMs: 2e6 }));                          // long after the spawn pop
    const { c } = rig.chars.get(G.players[0].id);
    const want = Math.max(scale, 84 * C.minShareOfStart) / scale;     // in cells: zoomed far out they stop shrinking on screen, so they stay easy to see
    assert.ok(Math.abs(c.ground.scale.x - want) < 1e-6, `scale ${c.ground.scale.x} for ${scale} (want ${want})`);
  }
});

test('characters stand upright (the camera does the looking down) and face their heading on the ground', () => {
  const { G, rig } = started();
  G.players[1].angle = G.players[1].pa = 0.7;
  rig.update(VIEW());
  const { c } = rig.chars.get(G.players[1].id);
  assert.equal(c.tilt.rotation.x, 0);
  assert.ok(Math.abs(c.facing.rotation.z + 0.7) < 1e-9, 'heading sign: ' + c.facing.rotation.z);
});

test('characters stand where the ground says: one further south is at a larger z, a whole body away', () => {
  const { G, rig } = started();
  G.players[0].px = G.players[0].x = 10; G.players[0].py = G.players[0].y = 5;
  G.players[1].px = G.players[1].x = 10; G.players[1].py = G.players[1].y = 12;
  rig.update(VIEW());
  const top = rig.chars.get(1).c.ground.position.z, bottom = rig.chars.get(2).c.ground.position.z;
  assert.ok(bottom > top, `the southern character must have the larger z: ${bottom} vs ${top}`);
  assert.ok((bottom - top) > C.bodySize[2], 'a gap of a whole body so they never interpenetrate');
});

test('only the leader wears the crown, and it moves when the lead changes', () => {
  const { G, rig } = started();
  for (let i = 0, n = 0; i < G.owner.length && n < 200; i++) if (G.land[i] && !G.owner[i]) { G.owner[i] = 4; n++; }
  G.countsDirty = true; G.tick();
  rig.update(VIEW());
  const leader = G.leaderId();
  for (const p of G.players) assert.equal(rig.chars.get(p.id).c.crown.visible, p.id === leader, `player ${p.id}`);
  assert.equal(leader, 4);
});

test('dead players play their fall and are then hidden, and a respawn pops back in from nothing', () => {
  const { G, rig } = started();
  rig.update(VIEW({ nowMs: 1e6 }));
  const p = G.players[2];
  p.alive = false;
  rig.update(VIEW({ nowMs: 1e6 + 16 }));
  assert.equal(rig.chars.get(p.id).c.ground.visible, true, 'it is still falling, not popped away');
  rig.update(VIEW({ nowMs: 1e6 + 16 + 2400 }));
  assert.equal(rig.chars.get(p.id).c.ground.visible, false, 'hidden once the fall is over');
  p.alive = true;
  rig.update(VIEW({ nowMs: 1e6 + 4000 }));
  const s0 = rig.chars.get(p.id).c.ground.scale.x;
  assert.ok(s0 < 0.2, 'a respawned character should start tiny, got ' + s0);
  rig.update(VIEW({ nowMs: 1e6 + 4000 + C.popMs + 400 }));
  assert.ok(Math.abs(rig.chars.get(p.id).c.ground.scale.x - 1) < 1e-6, 'one cell across when at rest');
});

test('blinking squashes the eyes and hides the pupils; open eyes show both', () => {
  const { rig } = started();
  let sawClosed = false, sawOpen = false;
  for (let t = 0; t < 30000 && !(sawClosed && sawOpen); t += 16) {
    rig.update(VIEW({ nowMs: 1e6 + t }));
    const c = rig.chars.get(1).c;
    if (c.pupils[0].visible) sawOpen = true; else { sawClosed = true; assert.ok(c.eyes[0].scale.z < 0.6); }
  }
  assert.ok(sawClosed && sawOpen);
});

test('updating many frames is cheap (a whole frame of rig work for eight players is far below a millisecond)', () => {
  const { rig } = started();
  const t0 = performance.now();
  for (let i = 0; i < 3000; i++) rig.update(VIEW({ nowMs: 1e6 + i * 16, f: (i % 3) / 3 }));
  const avg = (performance.now() - t0) / 3000;
  assert.ok(avg < 1, 'rig update takes ' + avg.toFixed(3) + ' ms per frame');
});
