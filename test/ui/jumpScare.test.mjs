import test from 'node:test';
import assert from 'node:assert/strict';
import { SCARE, scareDue } from '../../src/ui/jumpScare.ts';

test('no scare during the grace period or the cooldown, however lucky the roll', () => {
  assert.equal(scareDue({ roundMs: SCARE.graceMs - 1, sinceLastMs: SCARE.cooldownMs, trail: SCARE.minTrail }, 0), false);
  assert.equal(scareDue({ roundMs: SCARE.graceMs, sinceLastMs: SCARE.cooldownMs - 1, trail: SCARE.minTrail }, 0), false);
});

test('once allowed, a scare needs a rare roll', () => {
  const ok = { roundMs: SCARE.graceMs, sinceLastMs: SCARE.cooldownMs, trail: SCARE.minTrail };
  assert.equal(scareDue(ok, 0), true);
  assert.equal(scareDue(ok, SCARE.chancePerCheck), false);
  assert.equal(scareDue(ok, 0.5), false);
});

test('it only hits while you are out on a long line', () => {
  const base = { roundMs: SCARE.graceMs, sinceLastMs: SCARE.cooldownMs };
  assert.equal(scareDue({ ...base, trail: 0 }, 0), false);
  assert.equal(scareDue({ ...base, trail: SCARE.minTrail - 1 }, 0), false);
  assert.equal(scareDue({ ...base, trail: SCARE.minTrail }, 0), true);
});

test('the first scare of a round needs only a short line and is far likelier', () => {
  const base = { roundMs: SCARE.graceMs, sinceLastMs: SCARE.cooldownMs, trail: SCARE.firstMinTrail };
  assert.equal(scareDue({ ...base, first: true }, 0.05), true);
  assert.equal(scareDue({ ...base, first: false }, 0.05), false);
  assert.equal(scareDue({ ...base, first: true, trail: SCARE.firstMinTrail - 1 }, 0), false);
});
