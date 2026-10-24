import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIELD } from '../../src/config.ts';
import { kill } from '../../src/game/combat.ts';
import { alone, game, startWithRoom } from '../helpers.mjs';

test('the shield comes on for a few seconds, then needs time to recharge before it can be used again', () => {
  const G = game(5), h = startWithRoom(G); alone(G);
  let fired = 0; G.events.onShield = () => fired++;
  assert.equal(G.useShield(), true, 'ready at the start of a round');
  assert.equal(h.shield, SHIELD.ticks); assert.equal(h.shieldCool, SHIELD.cooldownTicks); assert.equal(fired, 1);
  assert.equal(G.useShield(), false, 'not while it is already on');
  for (let i = 0; i < SHIELD.ticks; i++) G.tick();
  assert.equal(h.shield, 0, 'it drops after its time');
  assert.equal(G.useShield(), false, 'still recharging');
  for (let i = 0; i < SHIELD.cooldownTicks - SHIELD.ticks; i++) G.tick();
  assert.equal(h.shieldCool, 0);
  assert.equal(G.useShield(), true, 'ready again'); assert.equal(fired, 2);
});

test('while the shield is up nobody else can take you out; once it drops they can', () => {
  const G = game(6), h = startWithRoom(G); alone(G);
  const rival = G.players[1]; rival.alive = true;
  G.useShield();
  kill(G, h, rival, 'cut');
  assert.equal(h.alive, true, 'protected');
  h.shield = 0;
  kill(G, h, rival, 'cut');
  assert.equal(h.alive, false, 'unprotected');
});

test('a dead player, or a round that is not running, cannot use the shield, and a respawn starts with it ready', () => {
  const G = game(7), h = startWithRoom(G); alone(G);
  h.alive = false; assert.equal(G.useShield(), false);
  h.alive = true; G.running = false; assert.equal(G.useShield(), false);
  G.running = true; G.useShield();
  assert.ok(h.shieldCool > 0);
  h.alive = false; G.respawnHuman();
  assert.equal(h.shield, 0); assert.equal(h.shieldCool, 0, 'fresh start');
});
