import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game/index.ts';
import { BEACON } from '../../src/config.ts';
import { collectBeacons, nearestBeacon, updateBeacons } from '../../src/game/beacons.ts';
import { rng } from '../helpers.mjs';

const N = 60, MOAT = 4;
const moatShape = (() => {
  const bits = new Uint8Array(Math.ceil((N * N) / 8));
  for (let y = MOAT; y < N - MOAT; y++) for (let x = MOAT; x < N - MOAT; x++) { const i = y * N + x; bits[i >> 3] |= 0x80 >> (i & 7); }
  return { id: 'MOAT', name: 'moat', nx: N, ny: N, mask: Buffer.from(bits).toString('base64') };
})();
function scene(bots = 2, seed = 4) {
  const G = createGame(rng(seed), {}, undefined, { shape: moatShape, botCount: bots });
  G.startGame();
  G.owner.fill(0);
  return G;
}
const placeBeacon = (G, x = 30.5, y = 30.5) => { const b = { id: 99, x, y, born: G.tickCount }; G.beacons.push(b); return b; };
const place = (p, x, y) => { p.x = p.px = x; p.y = p.py = y; };

test('a beacon appears after the first delay, away from the coast, never more than the limit, and announces itself', () => {
  const G = scene(); const seen = []; G.events.onBeaconSpawn = b => seen.push(b);
  G.players.forEach(p => { p.alive = false; p.respawnIn = 1e9; });                // nobody to interfere
  assert.equal(G.beacons.length, 0);
  for (let t = 0; t < BEACON.firstAfterTicks - 2; t++) G.tick();
  assert.equal(G.beacons.length, 0, 'not before its time');
  for (let t = 0; t < 6; t++) G.tick();
  assert.equal(G.beacons.length, 1); assert.equal(seen.length, 1);
  const b = G.beacons[0];
  assert.ok(G.arena.depth(b.x, b.y) >= BEACON.clearance, 'well inside the land');
  for (let t = 0; t < BEACON.everyTicks * 6; t++) { G.tick(); assert.ok(G.beacons.length <= BEACON.max, 'never more than the limit'); }
  for (let i = 0; i < G.beacons.length; i++) for (let j = i + 1; j < G.beacons.length; j++) assert.ok(Math.hypot(G.beacons[i].x - G.beacons[j].x, G.beacons[i].y - G.beacons[j].y) >= BEACON.radius * 2, 'circles do not overlap');
});

test('reach the orb first: you claim the whole circle and everyone inside it joins your chain', () => {
  const G = scene(3);
  const [me, a, b, c] = G.players;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { G.owner[(15 + dy) * N + 15 + dx] = me.id; G.owner[(40 + dy) * N + 40 + dx] = a.id; }
  const bc = placeBeacon(G);
  place(a, 33, 31); place(b, 28, 29); place(c, 50, 50); place(me, bc.x, bc.y);        // a and b are inside the circle, c is far away
  let evt = null; G.events.onBeacon = (beacon, collector, victims, claimed) => { evt = { collector, victims: victims.map(v => v.id), claimed: claimed.length }; };
  collectBeacons(G);
  assert.equal(G.beacons.length, 0, 'the beacon is used up');
  assert.equal(evt.collector, me); assert.deepEqual(evt.victims.sort(), [a.id, b.id]);
  assert.equal(a.alive, false); assert.equal(b.alive, false); assert.equal(c.alive, true, 'the one outside is untouched');
  assert.ok(me.captives.includes(a.id) && me.captives.includes(b.id) && !me.captives.includes(c.id), 'inside the circle: in my chain');
  let inside = 0, mine = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (G.land[y * N + x] && Math.hypot(x + 0.5 - bc.x, y + 0.5 - bc.y) <= BEACON.radius) { inside++; if (G.owner[y * N + x] === me.id) mine++; }
  assert.equal(mine, inside, 'every land cell in the circle is mine now');
  assert.ok(evt.claimed >= inside - 1);
  assert.equal(G.owner[28 * N + 12], 0, 'and nothing outside it was touched');
});

test('lose the race and you are inside: you are captured into THEIR chain (and for you that ends the round)', () => {
  const G = scene(1);
  const [me, bot] = G.players;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(15 + dy) * N + 15 + dx] = me.id;
  const bc = placeBeacon(G);
  place(bot, bc.x, bc.y); place(me, bc.x + 3, bc.y - 2);
  let over = 0; G.events.onGameOver = () => over++;
  collectBeacons(G);
  assert.equal(me.alive, false); assert.equal(over, 1);
  assert.ok(bot.captives.includes(me.id), 'you are in the bot\'s chain');
});

test('outside the circle you are safe even if someone else takes the beacon, and the closer head wins a tie', () => {
  const G = scene(2);
  const [me, a, b] = G.players;
  const bc = placeBeacon(G);
  place(me, bc.x + BEACON.radius + 3, bc.y); place(a, bc.x + 0.9, bc.y); place(b, bc.x - 0.3, bc.y);
  let winner = null; G.events.onBeacon = (_, collector) => { winner = collector; };
  collectBeacons(G);
  assert.equal(winner, b, 'the head closest to the orb takes it');
  assert.equal(me.alive, true, 'outside the circle: untouched');
  assert.equal(a.alive, false, 'the other racer, inside the circle, is captured');
});

test('a beacon nobody takes fades away, and bots near one sometimes race for it', () => {
  const G = scene(1);
  const [me, bot] = G.players;
  place(me, 6, 6); place(bot, 8, 8);
  const gone = []; G.events.onBeaconGone = b => gone.push(b);
  const bc = placeBeacon(G, 50.5, 50.5);
  G.tickCount = bc.born + BEACON.lifetimeTicks;
  updateBeacons(G);
  assert.equal(G.beacons.includes(bc), false); assert.equal(gone.length, 1);
  const near = placeBeacon(G, 40.5, 40.5);
  place(bot, 28, 28);
  assert.ok(nearestBeacon(G, bot.x, bot.y).dist < BEACON.botRange);
  const d0 = Math.hypot(bot.x - near.x, bot.y - near.y);
  me.alive = false; me.respawnIn = 1e9;
  for (let t = 0; t < 40 && G.beacons.length; t++) G.tick();
  const d1 = Math.hypot(bot.x - near.x, bot.y - near.y);
  assert.ok(G.beacons.length === 0 || d1 < d0, `the bot closed in or took it (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
});

test('beacons are deterministic for a given seed, and a new round starts with none', () => {
  const spots = (seed) => { const G = scene(0, seed); G.players.forEach(p => { p.alive = false; }); for (let t = 0; t < BEACON.firstAfterTicks + 5; t++) G.tick(); return G.beacons.map(b => [b.x, b.y]); };
  assert.deepEqual(spots(9), spots(9));
  assert.notDeepEqual(spots(9), spots(10));
  const G = scene(1); placeBeacon(G); G.startGame();
  assert.equal(G.beacons.length, 0);
});
