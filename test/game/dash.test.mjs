import test from 'node:test';
import assert from 'node:assert/strict';
import { DASH } from '../../src/config.ts';
import { kill } from '../../src/game/combat.ts';
import { alone, game, startWithRoom } from '../helpers.mjs';

test('the dash lasts a moment, then needs time to recharge', () => {
  const G = game(5), h = startWithRoom(G); alone(G);
  let fired = 0; G.events.onDash = () => fired++;
  assert.equal(G.useDash(), true); assert.equal(fired, 1);
  assert.equal(h.dash, DASH.ticks); assert.equal(h.dashCool, DASH.cooldownTicks);
  assert.equal(G.useDash(), false, 'not while it is going');
  for (let i = 0; i < DASH.ticks; i++) G.tick();
  assert.equal(h.dash, 0); assert.equal(G.useDash(), false, 'still recharging');
  for (let i = 0; i < DASH.cooldownTicks - DASH.ticks; i++) G.tick();
  assert.equal(G.useDash(), true, 'ready again');
});

test('a dash is faster than walking and nobody can take you out while it lasts', () => {
  const walk = (dash) => {
    const G = game(8), h = startWithRoom(G); alone(G);
    if (dash) G.useDash();
    const x0 = h.x, y0 = h.y; G.tick();
    return Math.hypot(h.x - x0, h.y - y0);
  };
  assert.ok(walk(true) > walk(false) * 1.5);
  assert.ok(walk(true) < 1, 'still under a cell per tick, so no cell is skipped');
  const G = game(6), h = startWithRoom(G); alone(G);
  const rival = G.players[1]; rival.alive = true;
  G.useDash(); kill(G, h, rival, 'cut');
  assert.equal(h.alive, true, 'protected');
  h.dash = 0; kill(G, h, rival, 'cut');
  assert.equal(h.alive, false);
});
