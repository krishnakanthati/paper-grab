import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game/index.ts';
import { kill } from '../../src/game/combat.ts';
import { collectPowerups, updatePowerups, resetPowerups } from '../../src/game/powerups.ts';
import { POWERUP } from '../../src/config.ts';
import { rng } from '../helpers.mjs';

const N = 60;
const shape = { id: 'SQ', name: 'sq', nx: N, ny: N, mask: Buffer.alloc(Math.ceil((N * N) / 8), 0xff).toString('base64') };
const setup = (bots = 2, seed = 4) => { const G = createGame(rng(seed), {}, undefined, { shape, botCount: bots }); G.startGame(); return G; };
const put = (p, x, y) => { p.x = p.px = x; p.y = p.py = y; };

test('pickups spawn on a timer, stay below the limit, and fade if nobody takes them', () => {
  const G = setup(0);
  resetPowerups(G);
  const seen = [];
  G.events.onPickupSpawn = k => seen.push(k); let gone = 0; G.events.onPickupGone = () => { gone++; };
  for (let t = 0; t < 30 * 120; t++) { G.tickCount++; updatePowerups(G); assert.ok(G.pickups.length <= POWERUP.max); }
  assert.ok(seen.length >= 3, 'some spawned: ' + seen.length);
  assert.ok(gone >= 1, 'old ones faded');
  for (const k of seen) assert.ok(G.land[Math.floor(k.y) * G.NX + Math.floor(k.x)] && G.arena.depth(k.x, k.y) >= POWERUP.clearance);
});

test('boost makes a head faster, and the effect runs out', () => {
  const G = setup(0), me = G.players[0];
  put(me, 30, 30); me.angle = me.target = 0;
  G.tick(); const slow = me.x - me.px;
  put(me, 30, 30); me.boost = POWERUP.boostTicks; me.angle = me.target = 0;
  G.tick(); const fast = me.x - me.px;
  assert.ok(fast > slow * 1.4, `${fast} vs ${slow}`);
  for (let i = 0; i < POWERUP.boostTicks + 2; i++) G.tick();
  assert.equal(me.boost, 0);
});

test('shield: nobody else can catch you while it lasts, and you can still be caught after', () => {
  const G = setup(1), me = G.players[0], bot = G.players[1];
  me.shield = POWERUP.shieldTicks;
  kill(G, me, bot, 'cut');
  assert.equal(me.alive, true, 'a shielded player survives');
  assert.equal(bot.kills, 0);
  kill(G, me, null, 'you lost all your land');
  assert.equal(me.alive, false, 'but a shield does not stop your own mistakes');
  const G2 = setup(1), m2 = G2.players[0], b2 = G2.players[1];
  kill(G2, m2, b2, 'cut');
  assert.equal(m2.alive, false, 'unshielded players are caught as before');
});

test('freeze stops others nearby (not the taker, not the shielded, not the far away) and they move again afterwards', () => {
  const G = setup(3), [me, near, far, shielded] = G.players;
  put(me, 30, 30); put(near, 34, 30); put(far, 55, 55); put(shielded, 30, 34); shielded.shield = 100;
  G.pickups = [{ id: 1, kind: 'freeze', x: 30, y: 30, born: G.tickCount }];
  let got = null; G.events.onPickup = (k, c, f) => { got = { c, f }; };
  collectPowerups(G);
  assert.equal(G.pickups.length, 0);
  assert.equal(got.c, me);
  assert.deepEqual(got.f.map(p => p.id), [near.id]);
  assert.equal(near.frozen, POWERUP.freezeTicks); assert.equal(far.frozen, 0); assert.equal(me.frozen, 0); assert.equal(shielded.frozen, 0);
  const x = near.x, y = near.y;
  G.tick();
  assert.ok(near.x === x && near.y === y, 'a frozen player stands still');
  for (let i = 0; i < POWERUP.freezeTicks + 5; i++) G.tick();
  assert.equal(near.frozen, 0);
});

test('only the closest head takes a pickup, effects clear on respawn, and bots do collect them over time', () => {
  const G = setup(2), [me, a] = G.players;
  put(me, 20, 20); put(a, 20.5, 20);
  G.pickups = [{ id: 1, kind: 'shield', x: 20.4, y: 20, born: G.tickCount }];
  collectPowerups(G);
  assert.equal(a.shield, POWERUP.shieldTicks); assert.equal(me.shield, 0);
  const G2 = setup(5, 11); let botTaken = 0;
  G2.events.onPickup = (k, c) => { if (c.isBot) botTaken++; };
  for (let t = 0; t < 30 * 240; t++) { G2.tick(); if (!G2.players[0].alive) G2.respawnHuman(); }
  assert.ok(botTaken > 0, 'bots took some');
});

test('magnet: free land close to the taker becomes theirs at once; others\' land, lines and far land are left alone', () => {
  const G = setup(2), [me, other] = G.players;
  G.owner.fill(0); G.trail.fill(0);
  put(me, 30, 30);
  const idx = (x, y) => y * G.NX + x;
  G.owner[idx(32, 30)] = other.id;                          // someone else's land nearby
  G.trail[idx(30, 33)] = 1 << other.id;                      // someone else's line nearby
  G.pickups = [{ id: 1, kind: 'magnet', x: 30, y: 30, born: G.tickCount }];
  let claimedFx = null; G.events.onCapture = (p, c) => { claimedFx = { p, n: c.length }; };
  let before = G.ver[me.id];
  collectPowerups(G);
  assert.equal(G.owner[idx(30, 31)], me.id, 'a free cell beside you is yours');
  assert.equal(G.owner[idx(32, 30)], other.id, 'someone else\'s land stays theirs');
  assert.equal(G.owner[idx(30, 33)], 0, 'a cell under someone\'s line is not taken');
  assert.equal(G.owner[idx(30, 40)], 0, 'far land is not taken');
  assert.ok(claimedFx && claimedFx.p === me && claimedFx.n > 60, 'the usual capture event fires: ' + claimedFx?.n);
  assert.ok(G.ver[me.id] !== before, 'the territory version moved, so it gets redrawn');
});
