import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game/index.ts';
import { kill } from '../../src/game/combat.ts';
import { spawn as spawnPlayer } from '../../src/game/spawn.ts';
import { CAPTIVES_MAX } from '../../src/config.ts';
import { rng } from '../helpers.mjs';

const N = 40;
const shape = { id: 'SQ', name: 'sq', nx: N, ny: N, mask: Buffer.alloc(Math.ceil((N * N) / 8), 0xff).toString('base64') };
function setup(bots = 3) {
  const G = createGame(rng(9), {}, undefined, { shape, botCount: bots });
  G.startGame();
  G.owner.fill(0);
  G.players.forEach((p, k) => { p.alive = true; p.captives = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.owner[(5 + k * 6 + dy) * N + 5 + dx] = p.id; });
  G.countsDirty = true;
  return G;
}
const cellsOf = (G, id) => { const out = []; G.owner.forEach((o, i) => { if (o === id) out.push(i); }); return out; };

test('a captured player\'s land becomes the captor\'s, not nobody\'s', () => {
  const G = setup(), human = G.players[0], bot = G.players[1];
  const before = cellsOf(G, bot.id);
  assert.ok(before.length > 0);
  let converted = null; G.events.onConvert = (v, c, cells) => { converted = { v, c, n: cells.length }; };
  kill(G, bot, human, 'cut');
  assert.equal(cellsOf(G, bot.id).length, 0, 'the victim keeps nothing');
  for (const i of before) assert.equal(G.owner[i], human.id, 'every one of their cells is now yours');
  assert.equal(converted.v, bot); assert.equal(converted.c, human); assert.equal(converted.n, before.length);
});

test('the captured player joins the captor\'s chain, oldest first, and each capture is counted', () => {
  const G = setup(), human = G.players[0];
  kill(G, G.players[1], human, 'a'); kill(G, G.players[2], human, 'b');
  assert.deepEqual(human.captives, [2, 3]);
  assert.equal(human.kills, 2);
});

test('the chain is capped: the oldest captive is let go beyond the limit', () => {
  const G = setup(CAPTIVES_MAX + 3), human = G.players[0];
  for (let i = 1; i <= CAPTIVES_MAX + 3; i++) { kill(G, G.players[i], human, 'x'); assert.ok(human.captives.length <= CAPTIVES_MAX, 'over the cap'); }
  assert.equal(human.captives.length, CAPTIVES_MAX);
  assert.ok(!human.captives.includes(2), 'the oldest was let go');
  assert.equal(human.captives.at(-1), CAPTIVES_MAX + 4);
});

test('capture someone and their whole chain becomes part of yours, and the same the other way round', () => {
  const G = setup(4), human = G.players[0], a = G.players[1], b = G.players[2], c = G.players[3], d = G.players[4];
  kill(G, c, a, 'x'); kill(G, d, a, 'y');              // a captures c and d: a's chain is [c, d]
  assert.deepEqual(a.captives, [4, 5]);
  kill(G, a, human, 'z');                              // you capture a: a's chain, then a itself, join yours
  assert.deepEqual(human.captives, [4, 5, 2], 'their complete chain is now part of mine');
  kill(G, human, b, 'w');                              // b captures you: your whole chain, then you, join b's
  assert.deepEqual(b.captives, [4, 5, 2, 1], 'and vice versa');
  assert.deepEqual(human.captives, [], 'a dead player holds nobody');
});

test('merged chains never contain duplicates or the captor itself, and respect the cap', () => {
  const G = setup(3), human = G.players[0], a = G.players[1], b = G.players[2];
  kill(G, b, a, 'x');                                  // a holds b
  a.alive = true; b.alive = true;
  human.captives = [3];                                // the human already holds b too (a stale duplicate)
  kill(G, a, human, 'y');
  assert.deepEqual(human.captives, [3, 2], 'b is not listed twice');
  assert.ok(!human.captives.includes(1), 'nobody holds themselves');
  human.captives = Array.from({ length: CAPTIVES_MAX }, (_, i) => 100 + i);
  const x = G.players[3]; x.alive = true; x.captives = [200, 201]; kill(G, x, human, 'z');
  assert.equal(human.captives.length, CAPTIVES_MAX, 'still capped');
  assert.equal(human.captives.at(-1), x.id, 'the newest is kept');
});

test('dying with no captor (your own mistake) still just clears the land and captures nobody', () => {
  const G = setup(), bot = G.players[1];
  kill(G, bot, null, 'edge');
  assert.equal(cellsOf(G, bot.id).length, 0);
  assert.ok(G.players.every(p => p.captives.length === 0));
});

test('a head-on crash where both die does not duplicate or lose land', () => {
  const G = setup(), a = G.players[0], b = G.players[1];
  const total = cellsOf(G, a.id).length + cellsOf(G, b.id).length;
  kill(G, a, b, 'head-on'); kill(G, b, a, 'head-on');
  const left = G.owner.filter(o => o === a.id || o === b.id).length;
  assert.ok(left === 0 || left === total, `land is conserved or cleared, got ${left} of ${total}`);
});

test('a new life starts with no captives', () => {
  const G = setup(); G.players[0].captives = [2, 3];
  G.players[0].alive = false; G.respawnHuman();
  assert.deepEqual(G.players[0].captives, []);
});

import { Trail } from '../../src/game/trail.ts';
import { CAPTIVE, captiveDistance } from '../../src/config.ts';
import { chainContacts } from '../../src/game/combat.ts';

/** A leader (id 2) heading east along y = 20 with captives [4, 5, 6] strung out behind it, and the human far away. */
function chainScene() {
  const G = setup(5), human = G.players[0], leader = G.players[1];
  leader.alive = true; leader.walk = new Trail(CAPTIVE.historyStep);
  for (let x = 5; x <= 25; x += 0.05) leader.walk.push(x, 20);
  leader.x = 25; leader.y = 20; leader.captives = [4, 5, 6];
  human.x = 2; human.y = 2; human.captives = [];
  return { G, human, leader, slot: (i) => leader.walk.at(captiveDistance(i)) };
}

test('touch the tail of someone\'s chain and you take that half; the front half stays safe with its leader', () => {
  const { G, human, leader, slot } = chainScene();
  let cut = null; G.events.onChainCut = (from, by, ids) => { cut = { from, by, ids }; };
  const s = slot(1);                                        // the second captive
  human.x = s.x; human.y = s.y + 0.1;
  chainContacts(G);
  assert.deepEqual(leader.captives, [4], 'the captive in front of the cut is safe');
  assert.deepEqual(human.captives, [5, 6], 'you get the cut captive and everyone behind it');
  assert.deepEqual(cut.ids, [5, 6]); assert.equal(cut.from, leader); assert.equal(cut.by, human);
});

test('touch the FIRST captive and you take the complete chain', () => {
  const { G, human, leader, slot } = chainScene();
  const s = slot(0); human.x = s.x; human.y = s.y;
  chainContacts(G);
  assert.deepEqual(leader.captives, []);
  assert.deepEqual(human.captives, [4, 5, 6]);
});

test('a head that is not touching the chain cuts nothing, and a leader never cuts its own chain', () => {
  const { G, human, leader, slot } = chainScene();
  const s = slot(1); human.x = s.x; human.y = s.y + CAPTIVE.hitRadius + 0.3;
  chainContacts(G);
  assert.deepEqual(leader.captives, [4, 5, 6]); assert.deepEqual(human.captives, []);
  leader.x = slot(0).x; leader.y = slot(0).y;               // its own head on top of its own captive
  chainContacts(G);
  assert.deepEqual(leader.captives, [4, 5, 6]);
});

test('a cut chain keeps its order, respects the cap and never lists the cutter itself', () => {
  const { G, human, leader, slot } = chainScene();
  leader.captives = [human.id, 4, 5];                       // the human is itself in this chain
  human.captives = Array.from({ length: CAPTIVES_MAX - 1 }, (_, i) => 100 + i);
  const s = slot(0); human.x = s.x; human.y = s.y;
  chainContacts(G);
  assert.ok(!human.captives.includes(human.id));
  assert.equal(human.captives.length, CAPTIVES_MAX, 'capped');
  assert.deepEqual(human.captives.slice(-2), [4, 5], 'the cut part arrives in its original order');
});

test('the chain really is a place on the map: it follows the leader\'s path through ticks', () => {
  const G = setup(2), leader = G.players[1];
  leader.alive = true; leader.captives = [3];
  for (let i = 0; i < 240; i++) G.tick();                   // the game itself records the walked path each tick
  const slot = leader.walk.at(CAPTIVE.spacing);
  const back = Math.hypot(leader.x - slot.x, leader.y - slot.y);
  assert.ok(back > 0.1 && back <= CAPTIVE.spacing + 1e-6, `the first captive is ${back.toFixed(2)} cells behind the head`);
});

test('a player who dies with no captor dissolves their land (an event tells the renderer which cells), and one with a captor does not', () => {
  const G = setup(), human = G.players[0], bot = G.players[1], other = G.players[2];
  let cleared = null; G.events.onClear = (v, cells) => { cleared = { v, n: cells.length }; };
  const own = cellsOf(G, bot.id).length;
  kill(G, bot, null, 'edge');
  assert.equal(cleared.v, bot); assert.equal(cleared.n, own);
  cleared = null;
  kill(G, other, human, 'cut');
  assert.equal(cleared, null, 'captured land is converted, not cleared');
});

test('a captured computer player does not respawn while it is held, and comes back when freed', () => {
  const G = setup(2), human = G.players[0], bot = G.players[1], other = G.players[2];
  kill(G, bot, human, 'cut');
  assert.equal(bot.capturedBy, human.id);
  for (let i = 0; i < 400; i++) G.tick();                       // far longer than any respawn delay
  assert.equal(bot.alive, false, 'held captives stay out of the game');
  if (!other.alive) spawnPlayer(G, other);                       // a free-running computer player may have died meanwhile
  if (!human.alive) spawnPlayer(G, human);
  kill(G, human, other, 'x');                                   // the captor is captured: the chain moves to the new captor
  assert.equal(bot.capturedBy, other.id, 'still held, now by the new captor');
  for (let i = 0; i < 400; i++) G.tick();
  assert.equal(bot.alive, false);
  kill(G, other, null, 'own mistake');                          // that captor dies with nobody to take over: everyone it held goes free
  assert.equal(bot.capturedBy, 0);
  for (let i = 0; i < 400 && !bot.alive; i++) G.tick();
  assert.equal(bot.alive, true, 'and it respawns');
});

test('a captive that respawns leaves every chain', () => {
  const G = setup(2), human = G.players[0], bot = G.players[1];
  kill(G, bot, human, 'cut');
  assert.deepEqual(human.captives, [bot.id]);
  spawnPlayer(G, bot);
  assert.deepEqual(human.captives, [], 'it is no longer held');
  assert.equal(bot.capturedBy, 0);
});
