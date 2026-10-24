import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCountries } from '../../src/data/countries.ts';
import { createMapScene } from '../../src/ui/picker/mapScene.ts';
import { parseConquered } from '../../src/ui/picker/conquered.ts';
import { mergeSaved, storage } from '../../src/platform/storage.ts';

const countries = parseCountries(JSON.parse(fs.readFileSync(new URL('../../public/countries.json', import.meta.url), 'utf8')));

test('conquered ids parse leniently: duplicates, blanks and unknown ids are dropped', () => {
  assert.deepEqual(parseConquered('FRA, DEU,,FRA,XXX', id => id !== 'XXX'), ['FRA', 'DEU']);
  assert.deepEqual(parseConquered(null), []);
  assert.deepEqual(parseConquered('A_VERY_LONG_ID'), []);
});

test('every country can be conquered and still be saved (the whole list fits one stored value)', () => {
  const text = countries.map(c => c.id).join(',');
  assert.equal(mergeSaved(JSON.stringify({ conquered: text })), 1);
  assert.equal(storage.get('conquered'), text);
});

test('conquered countries get a tinted shell and no flag stands on the globe; unknown ids are ignored', () => {
  const m = createMapScene(countries, 2);
  const flags = () => m.scene.children.filter(o => o.isSprite).length;
  assert.equal(flags(), 0);
  assert.ok(!m.overlays.conquered.visible);
  m.setConquered([countries[0].id, countries[1].id, 'NOPE']);
  assert.equal(flags(), 0, 'no flag is planted on the globe');
  assert.ok(m.overlays.conquered.visible);
  m.setConquered([]);
  assert.ok(m.overlays.conquered.visible === false);
  assert.ok(!m.overlays.conquered.visible);
  m.dispose();
});

import { parseFlags } from '../../src/data/flags.ts';
test('every playable country has its own real flag in flags.json, as a PNG', () => {
  const set = parseFlags(JSON.parse(fs.readFileSync(new URL('../../public/flags.json', import.meta.url), 'utf8')));
  assert.equal(set.mime, 'image/png');
  for (const c of countries) {
    const b = Buffer.from(set.flags[c.id] ?? '', 'base64');
    assert.ok(b.length > 60, `${c.name} has a flag`);
    assert.equal(b.subarray(1, 4).toString(), 'PNG', `${c.name}'s flag is a PNG`);
  }
  assert.throws(() => parseFlags({ mime: 1 }));
  assert.deepEqual(parseFlags({ mime: 'image/png', flags: { A: '<script>', B: 'AAAA' } }).flags, { B: 'AAAA' }, 'anything that is not base64 is dropped');
});
