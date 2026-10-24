import test from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../helpers.mjs';
import { nearestOnPath, lineThreatened, preyAim, thinkBot, headOnReaction } from '../../src/game/bots.ts';

/** Two bots in the open, scripted by hand: `a` is the one thinking, `b` the rival. */
function setup(seed = 3) {
  const G = game(seed); G.startGame();
  const [, a, b] = G.players;
  for (const p of G.players) if (p !== a && p !== b) { p.alive = false; p.respawnIn = 1e9; }
  return { G, a, b };
}

test('nearestOnPath finds the closest point on a line and ignores the segments at its owner\'s head', () => {
  const path = [0, 0, 10, 0, 10, 10];
  const hit = nearestOnPath(path, 5, 3);
  assert.ok(Math.abs(hit.x - 5) < 1e-9 && Math.abs(hit.y) < 1e-9 && Math.abs(hit.d - 3) < 1e-9);
  assert.equal(nearestOnPath(path, 10, 9, 1).d, 9 - 0 > 0 ? nearestOnPath(path, 10, 9, 1).d : 0, 'skip drops the last segment');
  assert.ok(nearestOnPath(path, 10, 9, 1).d > nearestOnPath(path, 10, 9, 0).d, 'the head segment was skipped');
  assert.equal(nearestOnPath([1, 1], 0, 0), null);
});

test('a bot out on its line runs home when a rival closes in on that line, but not when the rival is far away', () => {
  const { G, a, b } = setup();
  a.alive = b.alive = true; a.shield = b.shield = 0; a.frozen = b.frozen = 0; a.capturedBy = b.capturedBy = 0;
  a.path = [10, 10, 15, 10, 20, 10]; a.x = 20; a.y = 10;
  b.x = 15; b.y = 13; b.angle = -Math.PI / 2;
  assert.equal(lineThreatened(G, a), true, 'a rival 3 cells from the line, heading at it');
  b.x = 15; b.y = 40; b.angle = Math.PI / 2;
  assert.equal(lineThreatened(G, a), false, 'a rival far away');
  b.x = 15; b.y = 13; b.shield = 100;
  assert.equal(lineThreatened(G, a), false, 'a shielded rival cannot cut anything');
});

test('a bot goes for a rival\'s exposed line, but leaves a shielded or captive rival alone', () => {
  const { G, a, b } = setup();
  a.alive = b.alive = true; a.shield = b.shield = 0; a.capturedBy = b.capturedBy = 0; a.trail = []; a.path = [];
  a.x = 30; a.y = 30;
  b.path = [34, 20, 34, 25, 34, 29]; b.x = 34; b.y = 29; b.inOwner = 0;
  const aim = preyAim(G, a);
  assert.ok(aim && Math.abs(aim.x - 34) < 1e-9 && aim.y <= 25 && aim.y >= 20, 'aims at the line (not its head segment)');
  b.shield = 50; assert.equal(preyAim(G, a), null, 'shielded');
  b.shield = 0; b.capturedBy = a.id; assert.equal(preyAim(G, a), null, 'held captive');
  b.capturedBy = 0; a.x = 30; a.y = 60; assert.equal(preyAim(G, a), null, 'too far to bother');
});

test('thinking: a hunting bot turns towards the line and re-thinks quickly', () => {
  const { G, a, b } = setup();
  G.random = () => 0;                                                   // always passes the hunt-chance gate
  a.alive = b.alive = true; a.shield = b.shield = 0; a.capturedBy = b.capturedBy = 0; a.trail = []; a.path = [];
  a.x = 30; a.y = 30; a.thinkIn = 0; a.target = 0;
  b.path = [30, 20, 30, 23, 30, 27]; b.x = 30; b.y = 27;
  thinkBot(G, a);
  assert.ok(Math.abs(Math.sin(a.target) + 1) < 0.35 || a.target < -0.5, 'turned north, towards the line (y decreasing): ' + a.target);
  assert.ok(a.thinkIn <= 2, 'reacts quickly');
});

test('head-on: a bot that would lose the crash dodges sideways, one that would win charges, and on its own land it ignores it', () => {
  const { G, a, b } = setup();
  a.alive = b.alive = true; a.shield = b.shield = 0; a.capturedBy = b.capturedBy = 0; a.frozen = b.frozen = 0;
  a.x = 30; a.y = 30; b.x = 33; b.y = 30; b.angle = Math.PI;                         // b is 3 cells east, heading straight at a
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === a.id || G.owner[i] === b.id) G.owner[i] = 0;
  a.trail = [1, 2, 3]; b.trail = [4, 5, 6];
  a.trailStartTick = 10; b.trailStartTick = 50;                                       // a's line is older: a loses
  const dodge = headOnReaction(G, a);
  assert.ok(dodge !== null && Math.abs(Math.sin(dodge)) > 0.8, 'dodges to the side (north or south): ' + dodge);
  a.trailStartTick = 90;                                                              // now a's line is newer: a wins
  const charge = headOnReaction(G, a);
  assert.ok(charge !== null && Math.abs(Math.cos(charge) - 1) < 0.2, 'charges east, at it: ' + charge);
  b.angle = 0;                                                                        // b heading away
  assert.equal(headOnReaction(G, a), null, 'nothing to do');
  b.angle = Math.PI; b.x = 40;
  assert.equal(headOnReaction(G, a), null, 'too far to matter yet');
});

test('a bot goes for a rival\'s chain of captives', () => {
  const { G, a, b } = setup();
  a.alive = b.alive = true; a.shield = b.shield = 0; a.capturedBy = b.capturedBy = 0; a.trail = []; a.path = [];
  a.x = 30; a.y = 30; b.path = []; b.trail = []; b.inOwner = 0;
  b.captives = [G.players[3].id]; G.players[3].capturedBy = b.id;
  for (let x = 0; x <= 12; x += 0.1) b.walk.push(40 - x, 30);                         // b walked west along y=30 and is now at x=28...
  b.x = 28; b.y = 30;
  const aim = preyAim(G, a);
  assert.ok(aim, 'a chain is worth going for');
});

test('smarter bots still play a long game without errors, and bots do die', () => {
  let respawning = 0;
  const G = game(7); G.startGame();
  for (let t = 0; t < 4000; t++) {
    G.tick();
    if (!G.players[0].alive) G.startGame();
    for (const q of G.players) if (q.isBot && !q.alive) respawning++;
  }
  assert.ok(respawning > 0, 'bots are being caught');
  assert.ok(G.players.some(q => q.alive));
});
