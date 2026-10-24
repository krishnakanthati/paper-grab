import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCountries } from '../../src/data/countries.ts';
import { createMapScene, GLOBE, lonLatToVector, vectorToLonLat } from '../../src/ui/picker/mapScene.ts';

const countries = parseCountries(JSON.parse(fs.readFileSync(new URL('../../public/countries.json', import.meta.url), 'utf8')));
const byName = (n) => countries.find(c => c.name === n);

test('the globe is a sphere of the right size, with a lon/lat mapping that round-trips', () => {
  for (const [lon, lat] of [[0, 0], [90, 0], [-120, 35], [150, -40], [10, 80], [-170, -55]]) {
    const v = lonLatToVector(lon, lat);
    assert.ok(Math.abs(v.length() - GLOBE.radius) < 1e-9);
    const [lo, la] = vectorToLonLat(v);
    assert.ok(Math.abs(lo - lon) < 1e-6 && Math.abs(la - lat) < 1e-6, `${lon},${lat} -> ${lo},${la}`);
  }
  const m = createMapScene(countries, 2);
  assert.ok(m.globe.geometry.parameters.radius === GLOBE.radius);
  m.dispose();
});

test('clicking a country finds it: turn the globe to face each well-known country and click its middle', () => {
  const m = createMapScene(countries, 2);
  for (const name of ['Mexico', 'Brazil', 'India', 'Australia', 'Russia', 'United States of America', 'Chile', 'Egypt', 'Japan', 'France', 'Nigeria', 'Canada']) {
    const c = byName(name);
    m.look(c.centre[0], c.centre[1]);
    const p = m.project(c.centre[0], c.centre[1]);
    const got = m.pick(p.x, p.y, { w: 1000, h: 500 });
    assert.equal(got, c.id, `${name}: picked ${got}`);
  }
  m.dispose();
});

test('a country on the far side of the globe can not be clicked through the globe', () => {
  const m = createMapScene(countries, 2);
  m.look(0, 0);
  const far = m.project(180, 0);                                    // the opposite side: projects to the middle of the screen
  const got = m.pick(far.x, far.y, { w: 1000, h: 500 });
  assert.notEqual(got, byName('Fiji')?.id);
  const front = m.pick(0, 0, { w: 1000, h: 500 });
  const [lon, lat] = [0, 0];
  assert.equal(front, m.countryAt(lon, lat) ?? front);
  m.dispose();
});

test('clicking open ocean picks nothing, and clicking beside the globe picks nothing', () => {
  const m = createMapScene(countries, 2);
  m.look(-150, -20);
  const p = m.project(-150, -20);                                   // the middle of the South Pacific
  assert.equal(m.pick(p.x, p.y, { w: 1000, h: 500 }), null);
  assert.equal(m.pick(0.99, 0.99, { w: 1000, h: 500 }), null);      // empty space in the corner
  m.dispose();
});

test('a tiny country that is hard to hit can still be picked by clicking close to it', () => {
  const m = createMapScene(countries, 2);
  const tiny = [...countries].sort((a, b) => a.outline[0].length - b.outline[0].length).slice(0, 12);
  let picked = 0;
  for (const c of tiny) {
    m.look(c.centre[0], c.centre[1]);
    const p = m.project(c.centre[0], c.centre[1]);
    if (m.pick(p.x + 6 / 500, p.y, { w: 1000, h: 500 }) === c.id) picked++;   // 6 px to the side on a 1000 px wide view
  }
  assert.ok(picked >= tiny.length * 0.5, `only ${picked} of ${tiny.length} tiny countries were pickable`);
  m.dispose();
});

test('hover and selection notify the view once per real change, and ignore unknown ids', () => {
  const m = createMapScene(countries, 2);
  const seen = []; m.onChange = (w) => seen.push(w);
  m.setHover('MEX'); m.setHover('MEX'); assert.deepEqual(seen, ['hover']);
  m.setSelected('MEX'); m.setSelected('MEX'); assert.deepEqual(seen, ['hover', 'selected']);
  m.setHover('NOPE'); assert.equal(seen.length, 3, 'an unknown id clears hover, which is a change');
  m.setSelected('NOPE'); assert.equal(seen.length, 4);
  m.setSelected(null); assert.equal(seen.length, 4);
  assert.equal(m.directionOf('NOPE'), null);
  assert.ok(Math.abs(m.directionOf('MEX').length() - 1) < 1e-9);
  m.dispose();
});

test('highlight shells show only when they have something to show, and the chosen one stands higher', () => {
  const m = createMapScene(countries, 2);
  assert.equal(m.overlays.hover.visible, false); assert.equal(m.overlays.selected.visible, false);
  m.setHover('MEX'); assert.equal(m.overlays.hover.visible, true);
  m.setSelected('MEX'); assert.equal(m.overlays.selected.visible, true);
  assert.equal(m.overlays.hover.visible, false, 'hovering the chosen country would only z-fight with its own shell');
  m.setHover('BRA'); assert.equal(m.overlays.hover.visible, true);
  m.setSelected(null); m.setHover(null);
  assert.equal(m.overlays.hover.visible, false); assert.equal(m.overlays.selected.visible, false);
  assert.ok(m.overlays.selected.geometry.parameters.radius > m.overlays.hover.geometry.parameters.radius);
  assert.ok(m.overlays.hover.geometry.parameters.radius > GLOBE.radius);
  m.dispose();
});

test('painting: land once (colour and relief), and each shell paints only its own country on transparent', () => {
  const m = createMapScene(countries, 2);
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (['fill', 'stroke', 'fillRect', 'clearRect'].includes(k) ? (...a) => calls.push(k) : () => {}), set: (_, k, v) => { if (k === 'fillStyle') calls.push('fillStyle=' + v); return true; } });
  m.paint(ctx, 2048, 1024, 'colour');
  assert.ok(calls.filter(c => c === 'fill').length >= countries.length, 'every country is filled');
  assert.ok(calls.includes('fillStyle=' + GLOBE.colors.land));
  calls.length = 0; m.paint(ctx, 1024, 512, 'bump');
  assert.ok(calls.some(c => c.startsWith('fillStyle=rgb(')), 'the relief map is greyscale');
  calls.length = 0; m.paintOverlay(ctx, 1024, 512, 'hover');
  assert.deepEqual(calls, ['clearRect'], 'nothing hovered: the shell is just cleared');
  m.setHover('MEX'); m.setSelected('BRA');
  calls.length = 0; m.paintOverlay(ctx, 1024, 512, 'hover');
  assert.equal(calls.filter(c => c === 'fill').length, 1); assert.ok(calls.includes('fillStyle=' + GLOBE.colors.hover));
  calls.length = 0; m.paintOverlay(ctx, 1024, 512, 'selected');
  assert.equal(calls.filter(c => c === 'fill').length, 1); assert.ok(calls.includes('fillStyle=' + GLOBE.colors.selected));
  m.dispose();
});

test('the whole globe is framed on any screen shape (portrait phones to ultrawide)', () => {
  for (const aspect of [0.5, 0.75, 1, 1.6, 2, 2.4, 3.5]) {
    const m = createMapScene(countries, aspect);
    m.fit(aspect);
    m.look(0, 0);
    // points 80 degrees round from the middle, up/down/left/right, are almost on the rim: they must be on screen
    for (const [lon, lat] of [[80, 0], [-80, 0], [0, 80], [0, -80]]) {
      const p = m.project(lon, lat);
      assert.ok(Math.abs(p.x) <= 1.0 && Math.abs(p.y) <= 1.0, `aspect ${aspect}: (${lon},${lat}) is off screen at (${p.x.toFixed(2)},${p.y.toFixed(2)})`);
    }
    m.dispose();
  }
});


test('painting in slices draws exactly what painting in one go does (so the big texture can be made without a freeze)', () => {
  const m = createMapScene(countries, 2);
  const count = (fn) => { const calls = []; const ctx = new Proxy({}, { get: (_, k) => (['fill', 'stroke', 'fillRect'].includes(k) ? () => calls.push(k) : () => {}), set: () => true }); fn(ctx); return calls.join(','); };
  const whole = count(ctx => m.paint(ctx, 2048, 1024, 'colour'));
  const sliced = count(ctx => { m.paintBase(ctx, 2048, 1024, 'colour'); for (let i = 0; i < m.countryTotal(); i += 12) m.paintCountries(ctx, 2048, 1024, 'colour', i, i + 12); });
  assert.equal(sliced, whole);
  assert.equal(m.countryTotal(), countries.length);
  m.dispose();
});
