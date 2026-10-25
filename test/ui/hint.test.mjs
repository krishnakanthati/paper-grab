import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT, shouldShowHint } from '../../src/ui/hint.ts';

test('the how-to-play hint is for brand-new players only', () => {
  const store = new Map();
  assert.equal(shouldShowHint(k => store.get(k) ?? null), true, 'nothing saved: show it');
  store.set(HINT.key, '1');
  assert.equal(shouldShowHint(k => store.get(k) ?? null), false, 'once seen, never again');
});
test('the hint is one short line, lowercase like the rest of the interface, with a touch version that mentions the arrows', () => {
  for (const t of [HINT.text, HINT.touchText]) { assert.equal(t, t.toLowerCase()); assert.ok(t.length < 120); }
  assert.ok(/arrows/.test(HINT.touchText) && !/arrows/.test(HINT.text) && !/tilt/.test(HINT.touchText));
  assert.ok(HINT.showMs >= 3000 && HINT.showMs <= 8000, 'long enough to read, short enough not to nag');
});
