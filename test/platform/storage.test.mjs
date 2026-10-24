import test from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the Playables SDK's save slot, installed before the module is used.
const saved = { text: '', saves: 0, loads: 0 };
globalThis.window = { ytgame: { game: { loadData: async () => { saved.loads++; return saved.text; }, saveData: async (t) => { saved.saves++; saved.text = t; } } } };
const { storage, initStorage, mergeSaved, serialise, STORAGE } = await import('../../src/platform/storage.ts');

test('saved settings round-trip through the Playables save slot', async () => {
  saved.text = JSON.stringify({ character: 'tiger', country: 'MEX', junk: 5, nested: { a: 1 } });
  await initStorage();
  assert.equal(saved.loads, 1);
  assert.equal(storage.get('character'), 'tiger'); assert.equal(storage.get('country'), 'MEX');
  assert.equal(storage.get('junk'), null, 'only text values are accepted');
  assert.equal(storage.get('nope'), null);
  storage.set('character', 'rhino'); storage.set('character', 'rhino'); storage.set('tilt', 'off');
  assert.equal(storage.get('character'), 'rhino', 'reads are instant');
  await new Promise(r => setTimeout(r, STORAGE.saveDelayMs + 120));
  assert.equal(saved.saves, 1, 'quick changes are saved together, once');
  assert.deepEqual(JSON.parse(saved.text), { character: 'rhino', country: 'MEX', tilt: 'off' });
});

test('bad or hostile saved data is ignored safely, and a failing save slot never breaks the game', async () => {
  for (const bad of [undefined, null, 42, '', 'not json', '[1,2]', '"x"', 'null', '{"a":{"b":1}}']) assert.doesNotThrow(() => mergeSaved(bad));
  assert.equal(mergeSaved('[1,2]'), 0); assert.equal(mergeSaved('not json'), 0);
  assert.equal(mergeSaved(JSON.stringify({ ['k'.repeat(200)]: 'x', ok: 'y', big: 'z'.repeat(1500) })), 1, 'over-long keys and values are dropped');
  window.ytgame.game.loadData = async () => { throw new Error('boom'); }; window.ytgame.game.saveData = () => { throw new Error('boom'); };
  await assert.doesNotReject(initStorage());
  assert.doesNotThrow(() => storage.set('x', '1'));
  await new Promise(r => setTimeout(r, STORAGE.saveDelayMs + 120));
  assert.equal(typeof serialise(), 'string');
});

test('a save slot that never answers does not hold the game up', async () => {
  window.ytgame.game.loadData = () => new Promise(() => {});
  const t0 = Date.now();
  await initStorage();
  assert.ok(Date.now() - t0 < STORAGE.loadTimeoutMs + 400, 'it gave up after the timeout');
});

test('outside YouTube (no SDK) it still works in memory', async () => {
  delete window.ytgame;
  await initStorage();
  storage.set('a', 'b');
  assert.equal(storage.get('a'), 'b');
});
