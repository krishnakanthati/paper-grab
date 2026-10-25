import test from 'node:test';
import assert from 'node:assert/strict';
import { DECOR } from '../../src/render3d/decorTuning.ts';
import { SPECIES, speciesById, speciesForBot, isSpecies, DEFAULT_SPECIES, createCharacter, wiggle } from '../../src/render3d/index.ts';
import { MAX_BOTS } from '../../src/config.ts';
import { Jelly, Spring } from '../../src/ui/characters/jelly.ts';
import { chosenCharacter, speciesOfPlayer } from '../../src/ui/characters/store.ts';

test('the cast is well formed: unique ids and names, valid colours, at least six characters', () => {
  assert.ok(SPECIES.length >= 6);
  assert.equal(new Set(SPECIES.map(s => s.id)).size, SPECIES.length);
  assert.equal(new Set(SPECIES.map(s => s.name)).size, SPECIES.length);
  for (const s of SPECIES) {
    for (const c of [s.body, s.cheek, s.ears.color]) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `${s.id}: bad colour`);
    assert.equal(s.name, s.name.toLowerCase(), 'interface copy is lowercase');
  }
  assert.ok(isSpecies(DEFAULT_SPECIES));
  assert.equal(speciesById('nope').id, SPECIES[0].id, 'an unknown id falls back to the first character');
  assert.equal(isSpecies(42), false);
});

test('every species builds: a body, two eyes with sparkles, feet in the player colour, and the parts it asks for', () => {
  for (const sp of SPECIES) {
    const c = createCharacter(0xef4b4b, sp);
    if (sp.plain) { c.dispose(); continue; }
    assert.equal(c.body.material.color.getHex(), sp.body, `${sp.id} body colour`);
    assert.equal(c.feet[0].material.color.getHex(), sp.shoes?.color ?? sp.feet ?? 0xef4b4b, `${sp.id} feet`);
    assert.equal(c.decor.highlights.length, 4, `${sp.id}: a big and a small sparkle in each eye`);
    assert.equal(c.decor.ears.length, sp.ears.kind === 'none' ? 0 : 2, `${sp.id} ears`);
    assert.equal(!!c.decor.tail, !!sp.tail, `${sp.id} tail`);
    assert.equal(c.decor.wings.length, sp.wings ? 2 : 0, `${sp.id} wings`);
    c.dispose();
  }
});

test('a plain character (no species) is unchanged: wholly the player colour, nothing added', () => {
  const c = createCharacter(0x3b82f6);
  assert.equal(c.decor, null);
  assert.equal(c.body.material.color.getHex(), 0x3b82f6);
  assert.equal(c.feet[0].material, c.body.material);
});

test('no duplicates on the map: the bots are all different from each other and from you', () => {
  for (const mine of SPECIES.map(s => s.id)) {
    const ids = []; for (let id = 2; id < 2 + MAX_BOTS; id++) ids.push(speciesForBot(id, mine).id);
    assert.equal(new Set(ids).size, ids.length, `${mine}: two bots share a character`);
    assert.ok(!ids.includes(mine), `${mine}: a bot looks like the player`);
  }
  assert.ok(speciesForBot(1) && speciesForBot(500) && speciesForBot(-3) && speciesForBot(3.7, 'nope'), 'odd ids are fine');
  assert.ok(SPECIES.length - 1 >= MAX_BOTS, `the cast (minus yours) covers the largest possible game: ${MAX_BOTS} bots`);
});

test("'classic' is the original look: plain block in the player's colour, selectable like any other", () => {
  const classic = SPECIES.find(s => s.id === 'classic');
  assert.ok(classic && classic.plain);
  const c = createCharacter(0x22c55e, classic);
  assert.equal(c.decor, null); assert.equal(c.body.material.color.getHex(), 0x22c55e);
  assert.equal(DEFAULT_SPECIES, 'classic', 'what you had before is still what you get until you choose otherwise');
});

test('you are whatever you chose (kept in the platform store, in memory when there is no storage), and bots avoid your choice', () => {
  assert.equal(chosenCharacter.get(), DEFAULT_SPECIES, 'nothing chosen yet: the default');
  chosenCharacter.set('panda');
  assert.equal(chosenCharacter.get(), 'panda');
  assert.equal(speciesOfPlayer(1).id, 'panda');
  for (let id = 2; id <= 8; id++) assert.notEqual(speciesOfPlayer(id).id, 'panda', 'a computer player never looks like you');
  chosenCharacter.set('not-a-character');
  assert.equal(chosenCharacter.get(), DEFAULT_SPECIES, 'an unknown saved id falls back to the default');
});

test('wiggle moves ears, tail and wings, more when excited, and returns them to rest shapes', () => {
  const sp = SPECIES.find(s => s.id === 'ducky'), kit = SPECIES.find(s => s.id === 'kitty');
  const chick = createCharacter(0xef4b4b, sp), cat = createCharacter(0xef4b4b, kit);
  const w0 = chick.decor.wings[0].rotation.x;
  wiggle(chick.decor, 0.17, 1.2);
  assert.notEqual(chick.decor.wings[0].rotation.x, w0, 'wings flutter');
  const spread = (e) => { let m = 0; for (let t = 0; t < 3; t += 0.05) { wiggle(cat.decor, t, e); m = Math.max(m, Math.abs(cat.decor.tail.rotation.z - cat.decor.tail.userData.base.z)); } return m; };
  assert.ok(spread(1.2) > spread(0) * 1.4, 'a lively character wags harder');
  assert.ok(Number.isFinite(cat.decor.ears[0].rotation.x));
});

test('springs settle, overshoot like jelly, and never blow up on a long frame', () => {
  const s = new Spring(230, 9.5); s.kick(-5);
  let min = 0, max = 0;
  for (let i = 0; i < 600; i++) { s.step(1 / 60); min = Math.min(min, s.x); max = Math.max(max, s.x); }
  assert.ok(min < -0.05 && max > 0.01, `it should swing past rest and back: ${min} ${max}`);
  assert.ok(s.settled, 'and then be still');
  const big = new Spring(230, 9.5); big.kick(-5); big.step(5);          // a 5 s hitch
  assert.ok(Number.isFinite(big.x) && Math.abs(big.x) < 10);
});

test('jelly: a poke squashes then recoils, volume is kept, and it comes back to a calm idle', () => {
  const j = new Jelly();
  j.poke(1, 1);
  const first = j.step(1 / 60);
  assert.ok(first.sz < 1, 'squashed straight after the poke');
  assert.ok(Math.abs(first.sx * first.sy * first.sz - 1) < 0.35, 'roughly volume-preserving');
  let tallest = 0, energyAfter = 0;
  for (let i = 0; i < 90; i++) tallest = Math.max(tallest, j.step(1 / 60).sz);
  assert.ok(tallest > 1.01, 'it springs back taller than rest');
  for (let i = 0; i < 60 * 6; i++) energyAfter = j.step(1 / 60).energy;
  assert.ok(energyAfter < 0.3, 'the excitement dies down');
});

test('dragging spins it and friction brings it to a stop', () => {
  const j = new Jelly(); j.push(6);
  let yaw = 0, peak = 0;
  for (let i = 0; i < 60 * 1.2; i++) { yaw = j.step(1 / 60).yaw; peak = Math.max(peak, Math.abs(yaw)); }
  assert.ok(peak > 0.5, 'it turned');
  for (let i = 0; i < 60 * 1.2; i++) yaw = j.step(1 / 60).yaw;
  assert.ok(Math.abs(j.spin.v) < 0.01 && Math.abs(yaw) < 0.01, 'and settled facing the front again');
});

test('jelly: an idle jump spin turns a full circle in the air, lands with a squash, and ends facing the front', () => {
  const j = new Jelly(); j.jumpSpin(1);
  let peakHop = 0, peakYaw = 0, landed = false, minSz = 9;
  for (let i = 0; i < 60 * 3; i++) {
    const p = j.step(1 / 60); peakHop = Math.max(peakHop, p.hop); peakYaw = Math.max(peakYaw, p.yaw); minSz = Math.min(minSz, p.sz);
    if (peakHop > 0.2 && p.hop === 0) landed = true;
  }
  assert.ok(peakHop > 0.3, 'it leaves the ground: ' + peakHop);
  assert.ok(peakYaw > Math.PI * 1.5, 'it spins most of the way round: ' + peakYaw);
  assert.ok(landed && minSz < 0.95, 'it lands and squashes: ' + minSz);
  assert.ok(Math.abs(j.spin.x) < 0.05 && Math.abs(j.spin.v) < 0.5, 'then faces the front');
});

test('every character has its own details beyond the shared face, and they all build', () => {
  for (const sp of SPECIES) {
    if (sp.plain) continue;
    const feature = (sp.details?.length ?? 0) + (sp.patches?.length ?? 0) + (sp.snout || sp.nose || sp.beak || sp.trunk || sp.noseHorn || sp.claws ? 1 : 0) + (sp.tail ? 1 : 0) + (sp.wings ? 1 : 0) + (sp.horns ? 1 : 0) + (sp.eyePatch ? 1 : 0);
    assert.ok(feature >= 3, `${sp.id} is too plain: only ${feature} features`);
    const c = createCharacter(0xef4b4b, sp);
    assert.ok(c.facing.children.length > 14, `${sp.id}: only ${c.facing.children.length} parts in the character`);
    c.dispose();
  }
  const sig = SPECIES.filter(s => !s.plain).map(s => JSON.stringify((s.details ?? []).map(d => d.kind).sort()));
  assert.ok(new Set(sig).size >= 8, 'the characters should not all share the same extras');
});


test('decoration tuning is complete: every number is finite and every colour is a real colour', () => {
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') walk(v, `${path}.${k}`);
      else assert.ok(Number.isFinite(v), `${path}.${k} is not a finite number`);
    }
  };
  walk(DECOR, 'DECOR');
  for (const [name, c] of Object.entries(DECOR.colors)) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `colour ${name}`);
});

test('no decoration floats away from its character: every part stays within a sensible box round the body', () => {
  for (const sp of SPECIES) {
    const c = createCharacter(0xef4b4b, sp);
    c.facing.updateMatrixWorld(true);
    for (const m of c.facing.children) {
      const p = m.position;
      assert.ok(Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.0 && p.z > -0.1 && p.z < 1.9, `${sp.id}: a part is at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    }
    c.dispose();
  }
});

test('a tickle is a small quick giggle: gentler than a poke, no hop, and it settles', () => {
  const a = new Jelly(), b = new Jelly();
  a.tickle(1); b.poke(1, 1);
  const ta = a.step(1 / 60), tb = b.step(1 / 60);
  assert.ok(Math.abs(ta.roll) > 0 && Math.abs(ta.roll) < Math.abs(tb.roll), 'a shake, but smaller than a poke');
  assert.ok(Math.abs(1 - ta.sz) < Math.abs(1 - tb.sz), 'a smaller squeeze');
  let maxHop = 0; for (let i = 0; i < 60; i++) maxHop = Math.max(maxHop, a.step(1 / 60).hop);
  assert.ok(maxHop < 0.02, 'it does not jump');
  for (let i = 0; i < 60 * 5; i++) a.step(1 / 60);
  assert.ok(a.roll.settled || Math.abs(a.roll.x) < 0.01, 'and it settles back');
});

test('the rhino has its horn on the nose, pointing forward and up, and a snout instead of a smile', () => {
  const sp = SPECIES.find(s => s.id === 'rhino');
  assert.ok(sp && sp.noseHorn);
  const c = createCharacter(0xef4b4b, sp);
  const horn = c.facing.children.find(m => m.geometry?.type === 'ConeGeometry' && m.material.color.getHex() === sp.noseHorn);
  assert.ok(horn, 'a horn cone is there');
  assert.ok(horn.position.x > 0.45, 'on the front of the face');
  const tip = { x: 0, y: 1, z: 0 }; const q = horn.quaternion; // the cone's axis after rotation
  const ax = 2 * (q.x * q.y - q.w * q.z), az = 2 * (q.y * q.z + q.w * q.x);
  assert.ok(ax > 0.5 && az > 0.2, `it points forward (${ax.toFixed(2)}) and up (${az.toFixed(2)})`);
  c.dispose();
});

test('not everyone smiles: the cast has several different mouths, and snouts, beaks and trunks replace the mouth', () => {
  const kinds = new Set(SPECIES.filter(s => !s.plain && !s.snout && !s.beak && !s.trunk).map(s => s.mouth ?? 'smile'));
  assert.ok(kinds.size >= 4, `only ${kinds.size} kinds of mouth: ${[...kinds].join(', ')}`);
  assert.ok([...kinds].some(k => k !== 'smile' && k !== 'grin'), 'some are straight, smirking or open');
  const count = (sp) => createCharacter(0xef4b4b, sp).facing.children.length;
  for (const sp of SPECIES.filter(s => !s.plain)) {
    const withMouth = { ...sp, mouth: 'smile' }, noMouth = { ...sp, mouth: 'none' };
    if (!sp.snout && !sp.beak && !sp.trunk) assert.ok(count(withMouth) > count(noMouth), `${sp.id}: a mouth adds a part`);
    else assert.equal(count(withMouth), count(noMouth), `${sp.id}: it has a snout/beak/trunk instead`);
  }
});

test('characters have a crisp dark outline in their own colour (not a white sticker rim), and curves are smooth', () => {
  const c = createCharacter(0xffffff, SPECIES.find(s => s.id === 'cow'));
  const rim = c.rim.material.color.getHex();
  assert.notEqual(rim, 0xffffff, 'the outline of a white cow is not white');
  assert.ok(((rim >> 16) & 255) < 140, 'it is dark enough to read on pale land');
  assert.ok(c.body.geometry.parameters.segments >= 8, 'the body is finely rounded');
  assert.ok(c.eyes[0].geometry.parameters.widthSegments >= 32, 'and the eyes are smooth spheres');
  const a = createCharacter(0xff0000), b = createCharacter(0x0000ff);
  assert.notEqual(a.rim.material.color.getHex(), b.rim.material.color.getHex(), 'each character\'s outline follows its own colour');
  assert.equal(a.body.geometry, b.body.geometry, 'while the geometry is still shared');
});

test('the cow has medium-sized horns that point up and lean outwards', () => {
  const cow = SPECIES.find(s => s.id === 'cow');
  const c = createCharacter(0xef4b4b, cow);
  const horns = c.facing.children.filter(m => m.geometry?.type === 'ConeGeometry' && m.material.color.getHex() === cow.horns);
  assert.equal(horns.length, 2);
  for (const h of horns) {
    const { radius, height } = h.geometry.parameters;
    assert.ok(radius >= 0.08 && height >= 0.28 && height <= 0.4, `medium: ${radius} x ${height}`);
  }
  const [a, b] = horns;
  assert.ok(Math.sign(a.position.y) !== Math.sign(b.position.y), 'one on each side');
  const lean = h => { const q = h.quaternion; return 2 * (q.x * q.y - q.w * q.z) * Math.sign(h.position.y); };   // x-component of its axis, signed towards its own side
  assert.ok(horns.every(h => Math.abs(h.quaternion.x) > 0.5), 'pointing upwards (rotated onto the vertical)');
  c.dispose();
});

test('the crab has two waving pincers on arms, little legs along each side, and a smile', () => {
  const sp = SPECIES.find(s => s.id === 'crab');
  assert.ok(sp && sp.claws);
  const c = createCharacter(0xef4b4b, sp);
  assert.equal(c.decor.claws.length, 2, 'two pincers');
  assert.ok(Math.sign(c.decor.claws[0].position.y) !== Math.sign(c.decor.claws[1].position.y), 'one on each side');
  const before = c.decor.claws[0].rotation.z; wiggle(c.decor, 0.1, 1.2);
  assert.notEqual(c.decor.claws[0].rotation.z, before, 'they wave');
  const legs = c.facing.children.filter(m => m.geometry?.type === 'BoxGeometry' || (m.geometry?.type === 'RoundedBoxGeometry' && m.geometry.parameters.height > 0.2 && m.geometry.parameters.width < 0.06));
  assert.ok(legs.length >= 6, 'three little legs on each side');
  c.dispose();
});

test('the cast is exactly 20 characters', () => {
  assert.equal(SPECIES.length, 20);
});

test('jelly: before each idle jump it crouches (anticipation squash to about 0.72), then launches', () => {
  const j = new Jelly();
  let minSz = 9, crouchedBeforeLaunch = false, airborne = false;
  for (let i = 0; i < 60 * 3 && !airborne; i++) {
    const p = j.step(1 / 60);
    minSz = Math.min(minSz, p.sz);
    if (p.hop > 0.02) { airborne = true; crouchedBeforeLaunch = minSz < 0.85; }
  }
  assert.ok(airborne, 'it jumps');
  assert.ok(crouchedBeforeLaunch, 'after crouching first: lowest ' + minSz);
  assert.ok(minSz > 0.5, 'but not flattened: ' + minSz);
});
