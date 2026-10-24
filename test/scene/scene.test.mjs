import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { EFFECTS } from '../../src/config.ts';
import { createCameraController, pose3D } from '../../src/render/cameraController.ts';
import { createFloor3D } from '../../src/scene/floor3d.ts';
import { createBeacons3D, createPickups3D, BEACON_LOOK, pointerFor } from '../../src/scene/markers3d.ts';
import { createNameTags } from '../../src/scene/overlays.ts';
import { createParticles3D } from '../../src/scene/particles3d.ts';
import { createCameraView } from '../../src/scene/shell.ts';
import { SLASH, createSlash3D, isThrow, planeProgress, throwDuration, throwProgress } from '../../src/scene/slash3d.ts';
import { brushAt, createTerritory3D, samplePath } from '../../src/scene/territory3d.ts';
import { CHUNK_POINTS, createTrail3D } from '../../src/scene/trail3d.ts';
import { NAME_TAG } from '../../src/config.ts';
import { alone, game, rng, startWithRoom } from '../helpers.mjs';

// These build Three.js objects without a GPU, so they measure only OUR per-frame CPU work (geometry building), which is what the layers are
// designed to keep tiny, and check what ends up in the buffers.

function busyGame() {
  const r = rng(77), G = game(77);
  G.startGame();
  for (let t = 0; t < 1500; t++) {                       // let everyone grow some land and open lines
    if (G.players[0].alive && t % 15 === 0) G.setTarget(r() * Math.PI * 2 - Math.PI);
    G.tick();
    if (!G.players[0].alive) G.startGame();
  }
  return { G, r };
}

test('the arena floor builds, writes the stencil that clips everything else, and sits flat on the ground', () => {
  const { G } = busyGame();
  const f = createFloor3D(G);
  const meshes = f.group.children.filter(m => m.isMesh);
  assert.ok(meshes.length >= 5, 'shadows, rim, edge and floor');
  const floor = meshes.find(m => m.material.stencilWrite && m.material.stencilRef === 1 && m.material.stencilZPass !== undefined);
  assert.ok(floor, 'the floor writes the stencil');
  const pos = floor.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 7) assert.equal(pos.getY(i), 0, 'every floor vertex is on the ground plane');
  let minX = Infinity, maxX = -Infinity; for (let i = 0; i < pos.count; i++) { minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i)); }
  assert.ok(maxX - minX > G.NX * 0.5, 'the floor spans the arena in cell units');
  f.dispose();
});

test('territories only rebuild when their land changed, and are clipped to the floor', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync();
  const geos = t.group.children.flatMap(r => r.children.map(m => m.geometry));
  assert.ok(geos.some(g => g.attributes.position && g.attributes.position.count > 0), 'something was built');
  t.sync();                                              // nothing changed: nothing may be rebuilt
  assert.deepEqual(t.group.children.flatMap(r => r.children.map(m => m.geometry)), geos);
  for (const m of t.group.children[1].children) assert.ok(m.material.stencilWrite && m.material.stencilFunc !== undefined, 'every part tests the floor stencil');
  for (const id of [1, 2, 3]) {
    const top = t.group.children[id].children[2];
    const pos = top.geometry.attributes.position;
    if (!pos || !pos.count) continue;
    for (let i = 0; i < pos.count; i += 11) assert.ok(Math.abs(pos.getY(i) - 0.1) < 1e-6, 'a territory top is a slab 0.1 above the floor');
  }
  t.dispose();
});

test('newly claimed land is coloured in like spreading ink: an overlay appears, is wiped from the head outwards, and is removed', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync();
  const me = G.players[0];
  const cells = []; for (let i = 0, n = 0; i < G.land.length && n < 12; i++) if (G.land[i] && G.owner[i] === 0) { cells.push(i); n++; }
  assert.ok(cells.length >= 3, 'the test needs some neutral land');
  t.reveal(cells, new Map(), me.x, me.y);
  assert.equal(t.ghostCount(), 0, 'nothing is built in the middle of the capture itself');
  assert.equal(t.queued(), 1);
  t.update(0);
  assert.equal(t.ghostCount(), 1, 'the next frame builds the overlay for the neutral cells');
  t.update(100);
  assert.ok(t.ghostAlphas().some(a => a < 1 && a > 0), 'partway through, the overlay is fading');
  let last = 2; for (let k = 0; k < 12; k++) { t.update(50); const a = t.ghostAlphas()[0]; if (a !== undefined) { assert.ok(a <= last + 1e-9, 'it only ever fades out'); last = a; } }
  t.update(2000);
  assert.equal(t.ghostCount(), 0, 'and is gone once the colouring-in is over');
});

test('a grab that takes another player\'s land blends from THEIR colour, and tiny grabs and crowds of fades are skipped', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync();
  for (let i = 0, n = 0; i < G.land.length && n < 10; i++) if (G.land[i] && G.owner[i] === 0) { G.owner[i] = 2; n++; }       // some land that is certainly player 2's
  const cells = []; for (let i = 0; i < G.owner.length && cells.length < 10; i++) if (G.owner[i] === 2) cells.push(i);
  assert.ok(cells.length >= 3);
  t.reveal(cells, new Map([[2, cells]]), 5, 5); t.update(0);
  assert.equal(t.ghostCount(), 1, 'one overlay, in the old owner\'s colour');
  t.reveal(cells.slice(0, 2), new Map(), 5, 5); t.update(0);
  assert.equal(t.ghostCount(), 1, 'a 2-cell grab is not worth it');
  for (let k = 0; k < 40; k++) { t.reveal(cells, new Map([[2, cells]]), 5, 5); t.update(0); }
  assert.ok(t.ghostCount() + t.queued() <= 10, 'never more than the cap at once');
});

test('after the first draw, territories are redrawn a few per frame, and all catch up', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync();                                               // the first draw builds everyone
  assert.equal(t.pending(), 0);
  for (let id = 1; id < G.ver.length; id++) G.ver[id]++;   // everybody's land changes in the same tick
  const total = G.ver.length - 1;
  assert.equal(t.pending(), total);
  t.sync();
  assert.ok(t.pending() > 0 && t.pending() < total, `one frame redraws only a few (${total - t.pending()} of ${total})`);
  let frames = 1; while (t.pending() > 0 && frames < 20) { t.sync(); frames++; }
  assert.equal(t.pending(), 0, 'and everyone has caught up');
  assert.ok(frames <= Math.ceil(total / 3) + 1, `within a handful of frames (${frames})`);
});

test('the first fade is built invisibly at the start (a prewarm), so the first real capture does not hitch', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync(); t.prewarm();
  t.update(0);
  assert.equal(t.ghostCount(), 1, 'one overlay is built');
  assert.ok(t.ghostAlphas().every(a => a < 0.1 && a > 0), 'but it is practically transparent');
  for (let k = 0; k < 10; k++) t.update(16);
  assert.equal(t.ghostCount(), 0, 'and gone within a few frames');
});

// ---- trails ----
const strandsOf = (trail, id) => [trail.group.children[1 + id * 2], trail.group.children[2 + id * 2]];

test('a line\'s leading edge is locked to the head\'s interpolated position every frame, so it never gaps between logic ticks', () => {
  const G = game(5);
  const me = startWithRoom(G); alone(G);
  const trail = createTrail3D(G);
  me.angle = me.target = 0;
  for (let t = 0; t < 40; t++) G.tick();
  assert.ok(me.path.length >= 40, 'the head has drawn a line');
  for (const f of [0, 0.25, 0.5, 1]) {
    trail.update(f);
    const hx = me.px + (me.x - me.px) * f, hz = me.py + (me.y - me.py) * f;
    const [core] = strandsOf(trail, 1), pos = core.geometry.attributes.position, n = core.geometry.drawRange.count / 6;
    const a = (n) * 2, b = a + 1;                              // the last vertex pair: the head's
    const mx = (pos.getX(a) + pos.getX(b)) / 2, mz = (pos.getZ(a) + pos.getZ(b)) / 2;
    assert.ok(Math.hypot(mx - hx, mz - hz) < 1e-4, `at f=${f} the line ends at the head: off by ${Math.hypot(mx - hx, mz - hz)}`);
  }
  trail.dispose();
});

test('a line that ends (captured or cut) clears all of it', () => {
  const G = game(5); G.startGame();
  const me = G.players[0];
  for (const o of G.players.slice(1)) { o.alive = false; o.respawnIn = 1e9; }
  const trail = createTrail3D(G);
  me.path = Array.from({ length: 400 }, (_, i) => (i % 2 ? 20 : 20 + i * 0.1)); me.trail = [1, 2, 3];
  trail.update(0.5);
  assert.ok(trail.chunkCount(1) >= 2);
  assert.ok(strandsOf(trail, 1)[0].geometry.drawRange.count > 0);
  me.path = []; me.trail = [];
  trail.update(0.5);
  assert.equal(trail.chunkCount(1), 0, 'chunks of an ended line were left behind');
  assert.equal(strandsOf(trail, 1)[0].geometry.drawRange.count, 0, 'and nothing is drawn');
});

test('the per-tick cost of a LONG line stays small and does not blow up with its length', () => {
  const cost = (points) => {
    const G = game(6); G.startGame();
    const me = G.players[0];
    for (const o of G.players.slice(1)) { o.alive = false; o.respawnIn = 1e9; }
    const trail = createTrail3D(G);
    me.path = []; for (let i = 0; i < points; i++) me.path.push(20 + i * 0.27, 20 + Math.sin(i / 9));
    me.trail = [1];
    trail.update(0.5);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) { me.path.push(20 + (points + i) * 0.27, 20 + Math.sin((points + i) / 9)); trail.update(0.5); }
    return (performance.now() - t0) / 200;
  };
  const short = cost(60), long = cost(1200);
  assert.ok(long < 6, `a 1200-point line costs ${long.toFixed(3)} ms per tick (a short one ${short.toFixed(3)})`);
});

test('lines are opaque while they live (translucent strokes double-blend), and a dead player\'s line fades away then goes', () => {
  const { G } = busyGame();
  const t = createTrail3D(G);
  const p = G.players.find(q => q.alive && q.path.length > 8) ?? (() => { const q = G.players[1]; q.alive = true; q.path = Array.from({ length: 40 }, (_, i) => 10 + i * 0.1); q.trail = [1]; return q; })();
  t.update(0.5);
  for (const m of t.group.children) if (m.isMesh && m.material.vertexColors && !m.material.transparent) assert.equal(m.material.opacity, 1);
  p.alive = false; p.path = []; p.trail = [];
  t.update(0.5);
  assert.equal(t.fadingCount(), 1, 'the old line is now a fading ghost');
  t.fade(100);
  assert.equal(t.fadingCount(), 1);
  t.fade(2000);
  assert.equal(t.fadingCount(), 0, 'and is gone after the fade');
});

test('the colour of a line changes by chunk for the rainbow style, and chunk counts follow the line length', () => {
  const G = game(5); G.startGame();
  const me = G.players[0];
  for (const o of G.players.slice(1)) { o.alive = false; o.respawnIn = 1e9; }
  const trail = createTrail3D(G);
  me.path = []; for (let i = 0; i < CHUNK_POINTS * 3 + 6; i++) me.path.push(10 + i * 0.2, 12);
  me.trail = [1];
  trail.update(0.5);
  assert.equal(trail.chunkCount(1), 3);
});

// ---- particles ----
test('impact rings expand, fade and then disappear', () => {
  const p = createParticles3D();
  p.ring(10, 10, 0xff0000, 3, 400);
  assert.equal(p.ringCount, 1);
  p.update(100); p.update(100);
  assert.equal(p.ringCount, 1);
  p.update(300);
  assert.equal(p.ringCount, 0, 'the ring should be gone after its duration');
});

test('particles are capped, fewer are made on a struggling device, and they all expire', () => {
  const p = createParticles3D();
  for (let i = 0; i < 50; i++) p.burst(0, 0, 0xffffff, 40, 3, 0.3);
  assert.ok(p.count <= EFFECTS.maxParticles, `${p.count} particles exceeds the cap`);
  const slow = createParticles3D(); slow.setDensity(0.15);
  for (let i = 0; i < 50; i++) slow.burst(0, 0, 0xffffff, 40, 3, 0.3);
  assert.ok(slow.count < p.count * 0.3, `the slow device made ${slow.count} vs ${p.count}`);
  const off = createParticles3D(); off.setDensity(0); off.burst(0, 0, 0, 40, 3, 0.3);
  assert.equal(off.count, 0);
  for (let t = 0; t < 2000; t += 16) p.update(16);
  assert.equal(p.count, 0, 'every particle has expired');
  const geo = p.group.children[0].geometry;
  assert.equal(geo.drawRange.count, 0, 'and nothing is drawn');
});

test('particles fly out along the ground, rise and fall back under gravity, never sink through the floor, and shrink and fade', () => {
  const p = createParticles3D();
  p.burst(10, 20, 0xff0000, 30, 4, 0.4);
  const pos = p.group.children[0].geometry.attributes.position, size = p.group.children[0].geometry.attributes.aSize, alpha = p.group.children[0].geometry.attributes.aAlpha;
  let peak = 0;
  for (let t = 0; t < 300; t += 16) {
    p.update(16);
    for (let i = 0; i < p.count; i++) { peak = Math.max(peak, pos.getY(i)); assert.ok(pos.getY(i) >= 0.1, 'never under the floor'); }
  }
  assert.ok(peak > 0.2, 'they pop up: ' + peak);
  for (let t = 0; t < 500; t += 16) p.update(16);
  if (p.count) { assert.ok(size.getX(0) < 0.4, 'shrunk'); assert.ok(alpha.getX(0) < 0.9, 'faded'); }
});

test('per-frame cost stays tiny: trails + particles + markers for a full game take well under 3 ms on the CPU', () => {
  const { G } = busyGame();
  const trails = createTrail3D(G), particles = createParticles3D(), beacons = createBeacons3D(G), pickups = createPickups3D(G);
  particles.burst(40, 40, 0xff0000, 60, 5, 0.4);
  const frames = 1500;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    const f = (i % 3) / 3;
    if (i % 3 === 0) G.tick();                           // a logic tick every third frame, like 30 Hz logic on a 90 Hz display
    if (!G.players[0].alive) G.startGame();
    trails.update(f); particles.update(16); beacons.update(i * 16); pickups.update(i * 16, f);
    if (i % 400 === 0) particles.burst(40, 40, 0x00ff00, 40, 5, 0.4);
  }
  const avg = (performance.now() - t0) / frames;
  console.log('      per-frame CPU cost: ' + avg.toFixed(3) + ' ms');
  assert.ok(avg < 3, 'frame CPU cost ' + avg.toFixed(3) + ' ms');
});

// ---- the camera's view of the ground, name tags ----
function viewFor(w = 800, h = 600, x = 60, y = 30, viewCells = 20) {
  const cam = new PerspectiveCamera(28, w / h, 1, 1500);
  const view = createCameraView(cam, () => ({ w, h }));
  const ctl = createCameraController({ x, y });
  for (let i = 0; i < 200; i++) ctl.update({ x, y, angle: 0, moving: 0, cells: 0 }, 16, w, h);
  view.applyPose(ctl.pose(), { dx: 0, dy: 0 }, ctl.scale);
  return { cam, view, ctl };
}

test('the ground and the screen map to each other both ways, and the target is at the centre of the screen', () => {
  const { view } = viewFor();
  const c = view.project(60, 0, 30);
  assert.ok(Math.abs(c.x - 400) < 1 && Math.abs(c.y - 300) < 1 && c.visible, `the look-at point is at the centre: ${c.x}, ${c.y}`);
  for (const [gx, gz] of [[55, 28], [66, 33], [60, 24], [52, 35]]) {
    const s = view.project(gx, 0, gz), g = view.groundAt(s.x, s.y);
    assert.ok(Math.abs(g.x - gx) < 1e-6 && Math.abs(g.y - gz) < 1e-6, `round trip for ${gx},${gz}: ${g.x},${g.y}`);
  }
  const b = view.bounds();
  assert.ok(b.x < 60 && b.x + b.w > 60 && b.y < 30 && b.y + b.h > 30, 'the visible rectangle contains the target');
  assert.ok(b.w > 15 && b.h > 15, 'and spans a sensible area');
  const up = view.project(60, 0, 28), down = view.project(60, 0, 32);
  assert.ok(up.y < c.y && down.y > c.y, 'north (smaller y) is up the screen, as before');
});

test('the ground is seen at a slant: a step across the screen is longer than the same step down it, by the pitch', () => {
  const { view } = viewFor();
  const o = view.project(60, 0, 30), r = view.project(61, 0, 30), d = view.project(60, 0, 31);
  const across = Math.hypot(r.x - o.x, r.y - o.y), down = Math.hypot(d.x - o.x, d.y - o.y);
  const ratio = down / across;
  assert.ok(Math.abs(ratio - Math.sin(50 * Math.PI / 180)) < 0.05, `foreshortening ${ratio.toFixed(3)} vs sin 50 = ${Math.sin(50 * Math.PI / 180).toFixed(3)}`);
});

test('the same width of arena is visible on a portrait phone and on a wide window', () => {
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720], [800, 800]]) {
    const { view } = viewFor(w, h);
    const l = view.groundAt(0, h / 2), r = view.groundAt(w, h / 2);
    const shorter = Math.min(w, h), across = Math.hypot(r.x - l.x, r.y - l.y);
    const cellsOnShorter = across * shorter / w;
    assert.ok(Math.abs(cellsOnShorter - 20) < 4, `${w}x${h}: ${cellsOnShorter.toFixed(1)} cells across the shorter side`);
  }
});

test('name tags float above the 3D character (not behind it) and stay quiet', () => {
  const { G } = busyGame();
  const made = [];
  globalThis.document = { createElement: () => { const el = { style: {}, className: '', textContent: '', innerHTML: '', setAttribute() {}, appendChild(c) { made.push(c); }, remove() {} }; return el; } };
  const { view, ctl } = viewFor(800, 600, G.players[0].x, G.players[0].y);
  const shell = { project: view.project };
  const tags = createNameTags(G, { appendChild() {} });
  tags.update(1, shell);
  const me = G.players[0], el = made.find(e => e.textContent === 'you') ?? made[1];
  const m = /translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(el.style.transform);
  const head = view.project(me.x, 0.1, me.y);
  const gapPx = head.y - Number(m[2]);
  assert.ok(gapPx > 0.7 * NAME_TAG.offset * ctl.scale * Math.cos(50 * Math.PI / 180) * 0.8, `the tag is ${gapPx.toFixed(1)} px above the head`);
  assert.ok(NAME_TAG.fontSize <= 12 && NAME_TAG.fontWeight !== '800', 'small, light type');
  assert.ok(NAME_TAG.leaderOffset > NAME_TAG.offset, 'the leader\'s tag clears the crown too');
  delete globalThis.document;
});

// ---- slash ----
test('paper-plane tag: a swoop crosses the victim quickly and then settles, the second plane follows, and it all goes away', () => {
  assert.equal(planeProgress(0), 0);
  assert.ok(planeProgress(SLASH.planeMs * 0.4) > 0.6, 'it is fast at first');
  assert.equal(planeProgress(SLASH.planeMs), 1);
  assert.equal(planeProgress(10, SLASH.secondDelayMs), 0, 'the second plane has not started yet');
  const hits = [];
  const layer = createSlash3D((x, y, scale) => hits.push({ x, y, scale }));
  layer.add(10, 12, 0.3, 0xef4b4b, true);
  assert.equal(layer.count(), 1);
  layer.update(16, 30);
  assert.ok(layer.gfx.vertexCount > 0, 'something is drawn');
  for (let t = 0; t < SLASH.planeMs + SLASH.secondDelayMs; t += 16) layer.update(16, 30);
  assert.equal(hits.length, 2, 'sparkles pop where each plane hits (an X: two hits)');
  assert.ok(Math.abs(hits[0].x - 10) < 1e-9 && Math.abs(hits[0].y - 12) < 1e-9, 'right on the victim');
  for (let t = 0; t < 600; t += 16) layer.update(16, 30);
  assert.equal(layer.count(), 0, 'and it is gone');
  assert.equal(layer.gfx.vertexCount, 0, 'leaving nothing drawn');
});
test('paper-plane tag: other players\' fights get one smaller swoop, a crowd of them is capped, and the streak is never thinner than a few pixels', () => {
  const hits = [];
  const layer = createSlash3D((x, y, s) => hits.push(s));
  layer.add(5, 5, 0, 0x22c55e, false);
  for (let t = 0; t < 700; t += 16) layer.update(16, 30);
  assert.equal(hits.length, 1); assert.ok(hits[0] < 1, 'smaller than your own');
  for (let k = 0; k < 40; k++) layer.add(k, k, 0, 0x3b82f6, true);
  assert.ok(layer.count() <= SLASH.maxLive, 'capped');
  assert.ok(SLASH.minStreakPx >= 3, 'always visible, even at 14 px per cell');
});
test('tag from a distance: the paper plane is THROWN (it flies from the attacker to the victim and sticks in), up close it swoops', () => {
  assert.equal(isThrow(1.5), false, 'close: a slash');
  assert.equal(isThrow(SLASH.throwMinCells + 0.1), true, 'far: a throw');
  assert.ok(throwDuration(1) === SLASH.throwMinMs && throwDuration(1000) === SLASH.throwMaxMs, 'quick, within limits');
  assert.ok(throwDuration(10) > throwDuration(5) || throwDuration(10) === SLASH.throwMaxMs, 'a longer throw takes a little longer');
  const hits = [];
  const layer = createSlash3D((x, y, s) => hits.push({ x, y, s }));
  layer.addThrow(2, 2, 14, 7, 0xef4b4b, true);
  assert.equal(layer.count(), 1);
  layer.update(16, 30);
  assert.ok(layer.gfx.vertexCount > 0, 'the plane is drawn in flight');
  assert.equal(hits.length, 0, 'nothing has been hit yet');
  for (let t = 16; t < SLASH.windupMs + throwDuration(Math.hypot(12, 5)) + 40; t += 16) layer.update(16, 30);
  assert.equal(hits.length, 1, 'it lands once');
  assert.ok(Math.abs(hits[0].x - 14) < 1e-9 && Math.abs(hits[0].y - 7) < 1e-9, 'on the victim, not on the attacker');
  for (let t = 0; t < SLASH.stickMs + 200; t += 16) layer.update(16, 30);
  assert.equal(layer.count(), 0, 'it fades out after sticking');
  assert.equal(layer.gfx.vertexCount, 0);
});
test('thrown and swooping planes share the cap, and a throw of zero length does not break anything', () => {
  const layer = createSlash3D();
  for (let k = 0; k < 30; k++) { layer.addThrow(0, 0, 10 + k, 5, 0x3b82f6, k % 2 === 0); layer.add(k, k, 0, 0x22c55e, true); }
  assert.ok(layer.count() <= SLASH.maxLive);
  const l2 = createSlash3D(); l2.addThrow(5, 5, 5, 5, 0xef4b4b, true);
  for (let t = 0; t < 1400; t += 16) l2.update(16, 30);
  assert.equal(l2.count(), 0);
});

// ---- beacons and power-ups ----
test('a beacon pointer sits on the screen edge towards a beacon that is out of sight, and not at all when it is on screen', () => {
  const W = 400, H = 800, inset = BEACON_LOOK.pointer.inset;
  assert.equal(pointerFor(200, 400, W, H, inset), null, 'in the middle: no pointer');
  assert.equal(pointerFor(inset + 1, inset + 1, W, H, inset), null, 'just inside: no pointer');
  const right = pointerFor(1200, 400, W, H, inset);
  assert.ok(Math.abs(right.x - (W - inset)) < 1e-6 && Math.abs(right.y - 400) < 1e-6 && Math.abs(right.angle) < 1e-6, 'off to the right: on the right edge, pointing right');
  const up = pointerFor(200, -900, W, H, inset);
  assert.ok(Math.abs(up.y - inset) < 1e-6 && Math.abs(up.angle + Math.PI / 2) < 1e-6, 'off the top: on the top edge, pointing up');
  for (let k = 0; k < 400; k++) {
    const sx = (Math.random() - 0.5) * 5000 + 200, sy = (Math.random() - 0.5) * 5000 + 400, p = pointerFor(sx, sy, W, H, inset);
    if (!p) continue;
    assert.ok(p.x >= inset - 1e-6 && p.x <= W - inset + 1e-6 && p.y >= inset - 1e-6 && p.y <= H - inset + 1e-6, 'always inside the inset rectangle');
    assert.ok(Math.abs(Math.atan2(sy - 400, sx - 200) - p.angle) < 1e-9, 'and pointing at the beacon');
  }
});
test('beacons draw a ground circle and a floating orb, and are forgotten once gone', () => {
  const { G } = busyGame();
  G.beacons.length = 0;                                  // (the busy game has spawned some of its own)
  const layer = createBeacons3D(G);
  layer.update(1000);
  assert.equal(layer.group.children[0].geometry.drawRange.count, 0, 'no beacons: nothing drawn');
  G.beacons.push({ id: 1, x: 10, y: 10, born: G.tickCount });
  layer.update(1000);
  assert.ok(layer.group.children[0].geometry.drawRange.count > 30, 'the circle is drawn on the ground');
  assert.ok(layer.group.children.length > 1 && layer.group.children[1].children.length >= 6, 'with an orb and its sparkles');
  const orbY = layer.group.children[1].children[2].position.y;
  assert.ok(orbY > 0.5, 'the orb floats above the ground: ' + orbY);
  G.beacons.length = 0;
  layer.update(1200);
  assert.equal(layer.group.children[0].geometry.drawRange.count, 0);
  assert.equal(layer.group.children.length, 1, 'its orb is removed');
});
test('power-up orbs float and bob, and a player with an effect running gets an aura on the ground', () => {
  const { G } = busyGame();
  G.pickups.length = 0;
  const layer = createPickups3D(G);
  layer.update(1000, 0.5);
  G.pickups.push({ id: 7, kind: 'boost', x: 20, y: 20, born: G.tickCount });
  layer.update(1000, 0.5);
  const orb = layer.group.children[1];
  assert.ok(orb && orb.children.length === 5, 'halo, glow, body, ring and icon');
  const y0 = orb.children[2].position.y; layer.update(1500, 0.5);
  assert.notEqual(orb.children[2].position.y, y0, 'it bobs');
  G.pickups.length = 0;
  const p = G.players[0]; p.alive = true; p.shield = 100;
  layer.update(2000, 0.5);
  assert.ok(layer.group.children[0].geometry.drawRange.count > 30, 'a shield aura is drawn');
});

test('thrown plane: it winds up before letting go, lands exactly on the victim, and can be replayed with a fixed flight time', () => {
  assert.equal(throwProgress(0), 0); assert.equal(throwProgress(1), 1);
  assert.ok(throwProgress(0.3) > 0.4, 'fast off the hand');
  let launched = 0, landed = 0;
  const layer = createSlash3D(() => {}, () => launched++);
  layer.addThrow(2, 2, 12, 2, 0xef4b4b, true, { flyMs: 150, onLand: () => landed++ });
  for (let t = 0; t < SLASH.windupMs - 20; t += 10) layer.update(10, 30);
  assert.equal(launched, 0, 'still winding up'); assert.ok(layer.gfx.vertexCount > 0, 'the wound-up plane is drawn');
  for (let t = 0; t < 40; t += 10) layer.update(10, 30);
  assert.equal(launched, 1, 'let go once'); assert.equal(landed, 0);
  for (let t = 0; t < 200; t += 10) layer.update(10, 30);
  assert.equal(landed, 1, 'lands once, after the fixed flight');
  layer.addThrow(0, 0, 9, 9, 0x3b82f6, true); layer.clear();
  assert.equal(layer.count(), 0);
});
test('replay history: players are read back blended between records, the old ones are dropped, and the speed crawls through the throw', async () => {
  const { createHistory, replaySpeed } = await import('../../src/scene/replay.ts');
  const { REPLAY } = await import('../../src/config.ts');
  const h = createHistory(1000, 30);
  for (let t = 0; t <= 3000; t += 40) h.push(t, new Float32Array([t / 100, 5, 0, 1]));
  const out = new Float32Array(4);
  assert.ok(h.sample(2020, out)); assert.ok(Math.abs(out[0] - 20.2) < 1e-4, 'blended between records');
  assert.ok(h.length < 40, 'old records are dropped');
  h.push(3050, new Float32Array([0, 0, 0, 0]), true);
  h.sample(3050, out); assert.equal(out[3], 0, 'the final record says dead');
  assert.ok(replaySpeed(-400) > replaySpeed(100) && replaySpeed(100) < replaySpeed(800), 'slowest through the throw (from the touch) and landing, then real time');
  assert.ok(REPLAY.ms === 5000, 'five seconds: the star trails and hits in slow motion, then the angel finish');
});
test('replay: the victim stays alive from the touch until the star lands, so the angel forms after the hit, not before', async () => {
  const { replayAlive } = await import('../../src/scene/replay.ts');
  assert.equal(replayAlive(-200, 620, true, true, false), true, 'before the touch: as recorded');
  assert.equal(replayAlive(100, 620, true, false, false), true, 'the last record says dead, but the star is still flying');
  assert.equal(replayAlive(619, 620, true, false, false), true);
  assert.equal(replayAlive(620, 620, true, false, false), false, 'the star lands: now it dies and the angel forms');
  assert.equal(replayAlive(100, 620, false, false, false), false, 'someone else who had died is still shown as they were');
});
test('replay throw: a dramatic star draws more than a plain one (aim line, charge, impact burst) and still lands once, on time', () => {
  const run = (dramatic) => {
    let landed = 0, peak = 0;
    const layer = createSlash3D();
    layer.addThrow(2, 2, 12, 2, 0xef4b4b, true, { flyMs: 160, dramatic, onLand: () => landed++ });
    for (let t = 0; t < 1200; t += 10) { layer.update(10, 30); peak = Math.max(peak, layer.gfx.vertexCount); }
    return { landed, peak, left: layer.count() };
  };
  const plain = run(false), big = run(true);
  assert.equal(big.landed, 1); assert.equal(big.left, 0);
  assert.ok(big.peak >= plain.peak, `dramatic ${big.peak} vs plain ${plain.peak} vertices`);
});

test('the colouring-in brush follows the line the player drew, then swells to fill the inside', () => {
  const path = []; for (let i = 0; i <= 40; i++) path.push(i, 0);               // a straight 40-cell line
  const pts = samplePath(path, 24);
  assert.equal(pts.length, 48);
  assert.deepEqual(pts.slice(0, 2), [0, 0]); assert.ok(Math.abs(pts[46] - 40) < 1e-9, 'both ends are kept');
  const early = brushAt(pts, 0.1, 2, 9), mid = brushAt(pts, 0.3, 2, 9), done = brushAt(pts, 0.6, 2, 9), end = brushAt(pts, 1, 2, 9);
  assert.ok(early.hx < mid.hx && mid.hx < done.hx, 'the head moves along the line');
  assert.ok(early.count < mid.count, 'the part behind it stays inked');
  assert.equal(early.radius, 2); assert.equal(done.radius, 2, 'while it follows the line the disc is small');
  assert.ok(Math.abs(done.hx - 40) < 1e-9, 'it reaches the end of the line when the line share is over');
  assert.ok(Math.abs(end.radius - 9) < 1e-9, 'then it swells to cover everything');
});

test('a capture with a drawn line builds an overlay that uses it', () => {
  const { G } = busyGame();
  const t = createTerritory3D(G);
  t.sync();
  const me = G.players[0];
  const cells = []; for (let i = 0, n = 0; i < G.land.length && n < 12; i++) if (G.land[i] && G.owner[i] === 0) { cells.push(i); n++; }
  t.reveal(cells, new Map(), me.x, me.y, [me.x, me.y, me.x + 5, me.y, me.x + 5, me.y + 5]);
  t.update(0); t.update(300);
  assert.equal(t.ghostCount(), 1);
  t.update(3000);
  assert.equal(t.ghostCount(), 0);
});
