import test from 'node:test';
import assert from 'node:assert/strict';
import { game, startWithRoom } from '../helpers.mjs';

test('the leader (most land) gets the crown', () => {
  const G = game(31);
  G.startGame();
  for (let i = 0; i < G.owner.length && G.counts[5] < 80; i++) if (G.land[i] && !G.owner[i]) { G.owner[i] = 5; G.counts[5]++; }
  assert.equal(G.leaderId(), 5);
  G.counts[3] = 500;
  assert.equal(G.leaderId(), 3);
});

test('owning 100% of the arena wins', () => {
  let won = 0;
  const G = game(32, { onWin: () => { won++; } });
  G.startGame();
  for (let i = 0; i < G.owner.length; i++) if (G.land[i]) G.owner[i] = 1;
  G.countsDirty = true;                                         // ownership was edited by hand
  G.tick();                                                     // everyone else has no land left
  G.tick();
  assert.equal(won, 1);
  assert.equal(G.running, false);
});

test('losing every cell eliminates you', () => {
  let reason = null;
  const G = game(33, { onGameOver: (r) => { reason = r; } });
  G.startGame();
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === 1) G.owner[i] = 2;
  G.countsDirty = true;
  for (let i = 0; i < 3; i++) G.tick();
  assert.match(reason ?? '', /lost all your land/);
});

test('eliminated bots come back after a short delay', () => {
  const G = game(34);
  G.startGame();
  const bot = G.players[3];
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === bot.id) G.owner[i] = 0;
  G.countsDirty = true;
  for (let i = 0; i < 3; i++) G.tick();
  assert.equal(bot.alive, false);
  for (let i = 0; i < 80; i++) G.tick();
  assert.equal(bot.alive, true);
  assert.ok(G.counts[bot.id] > 10);
});

test('after you die you respawn into the same world: score reset, bots and their land untouched', () => {
  const G = game(36);
  G.startGame();
  const me = G.players[0];
  for (let i = 0; i < 40; i++) G.tick();                       // let bots build some land
  const botLand = G.players.slice(1).map(p => G.counts[p.id]);
  const botIds = G.players.slice(1).map(p => p.alive);
  me.kills = 3;
  // eliminate the human the normal way: take all its land
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === 1) G.owner[i] = 0;
  G.countsDirty = true; G.tick();
  assert.equal(me.alive, false);
  assert.equal(G.running, false);
  assert.equal(G.respawnHuman(), true);
  assert.equal(me.alive, true);
  assert.equal(G.running, true);
  assert.equal(me.kills, 0, 'kills should reset');
  assert.equal(G.bestCells, 0, 'best territory should reset');
  assert.ok(G.counts[1] >= 16, 'respawn patch missing');
  assert.ok(G.arena.inside(me.x, me.y));
  G.players.slice(1).forEach((p, i) => { if (botIds[i]) { assert.equal(p.alive, true); assert.ok(Math.abs(G.counts[p.id] - botLand[i]) < 60, 'a bot lost its land because the human respawned'); } });
  assert.equal(G.respawnHuman(), false, 'respawning while alive should do nothing');
});

test('passing a milestone with NO event handler registered still terminates (optional chaining must not skip the increment)', () => {
  const G = game(36);                                            // no handlers at all
  G.startGame();
  for (let i = 0, n = 0; i < G.owner.length && n < 6000; i++) if (G.land[i] && !G.owner[i]) { G.owner[i] = 1; n++; }   // about 22% of the world: jumps past three milestones at once
  G.countsDirty = true;
  const t0 = performance.now();
  G.tick();
  assert.ok(performance.now() - t0 < 1000, 'tick() did not return promptly');
  assert.ok(G.milestone >= 3, 'milestones were not counted: ' + G.milestone);
});

test('every milestone is reported exactly once, in order, however many are passed in one tick', () => {
  const seen = [];
  const G = game(37, { onMilestone: (i) => seen.push(i) });
  G.startGame();
  for (let i = 0, n = 0; i < G.owner.length && n < 7200; i++) if (G.land[i] && !G.owner[i]) { G.owner[i] = 1; n++; }
  G.countsDirty = true;
  G.tick(); G.tick(); G.tick();
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.equal(new Set(seen).size, seen.length, 'a milestone was reported twice');
  assert.deepEqual(seen.slice(0, 3), [0, 1, 2]);
});
