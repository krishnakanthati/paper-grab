import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_COUNT, MAX_BOTS } from '../../src/config.ts';
import { parseCountries } from '../../src/data/countries.ts';
import { createGame, defaultBotCount } from '../../src/game/game.ts';
import { colorOf, cssColorOf } from '../../src/render/palette.ts';
import { nameOf } from '../../src/config.ts';
import { rng } from '../helpers.mjs';

const countries = parseCountries(JSON.parse(fs.readFileSync(new URL('../../public/countries.json', import.meta.url), 'utf8')));
const smallest = [...countries].sort((a, b) => a.shape.nx * a.shape.ny - b.shape.nx * b.shape.ny)[0].shape;

test('any number of bots works, including none, and absurd requests are clamped', () => {
  for (const [asked, expected] of [[0, 0], [1, 1], [7, 7], [14, 14], [99, MAX_BOTS], [-5, 0], [3.9, 3]]) {
    const G = createGame(rng(1), {}, undefined, { botCount: asked });
    G.startGame();
    assert.equal(G.botCount, expected, `asked for ${asked}`);
    assert.equal(G.players.length, expected + 1);
    for (let t = 0; t < 120; t++) { G.tick(); if (!G.players[0].alive) G.startGame(); }
    for (const p of G.players) assert.ok(p.id >= 1 && p.id <= 15);
  }
});

test('a solo game (no bots) is playable: you can claim land and cannot be eliminated by anyone', () => {
  const G = createGame(rng(2), {}, undefined, { botCount: 0 });
  G.startGame();
  for (let t = 0; t < 600; t++) { if (t % 40 === 0) G.setTarget(t / 13); G.tick(); }
  assert.equal(G.players[0].alive, true);
  assert.ok(G.counts[1] >= 16);
});

test('the default number of bots scales with the size of the arena', () => {
  assert.equal(defaultBotCount(1e9), BOT_COUNT, 'never more than the default');
  assert.equal(BOT_COUNT + 1, 15, 'a full game is 15 players');
  assert.ok(defaultBotCount(2000) < BOT_COUNT && defaultBotCount(2000) >= 1);
  assert.equal(defaultBotCount(10), 1, 'never fewer than one');
});

test('even in the smallest arena with the most bots, YOU always get a place to start', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const G = createGame(rng(seed), {}, undefined, { shape: smallest, botCount: MAX_BOTS });
    G.startGame();
    const me = G.players[0];
    assert.ok(me.alive, `seed ${seed}: the human could not be placed in a ${smallest.nx}x${smallest.ny} arena`);
    assert.ok(G.arena.inside(me.x, me.y));
    assert.ok(G.counts[1] >= 10);
    const placed = G.players.filter(p => p.alive).length;
    assert.ok(placed >= 3, `only ${placed} players could be placed`);
    for (let t = 0; t < 300; t++) { G.tick(); if (!G.players[0].alive) G.respawnHuman() || G.startGame(); }   // dead bots keep trying to respawn without crashing
  }
});

test('respawning works at any moment: alive (no-op), dead, and in a tiny arena', () => {
  const G = createGame(rng(3), {}, undefined, { shape: smallest });
  G.startGame();
  assert.equal(G.respawnHuman(), false, 'respawning while alive must do nothing');
  G.players[0].alive = false;
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === 1) G.owner[i] = 0;
  G.countsDirty = true;
  assert.equal(G.respawnHuman(), true);
  assert.ok(G.players[0].alive);
});

test('starting a new round clears everything from the old one', () => {
  const G = createGame(rng(4));
  G.startGame();
  for (let t = 0; t < 300; t++) G.tick();
  G.startGame();
  assert.equal(G.tickCount, 0); assert.equal(G.bestCells, 0); assert.equal(G.milestone, 0);
  for (const p of G.players) { assert.equal(p.trail.length, 0); assert.equal(p.path.length, 0); assert.equal(p.kills, 0); }
  assert.ok(G.trail.every(v => v === 0));
});

test('every player id up to the maximum has a distinct colour and a name', () => {
  const seen = new Set();
  for (let id = 1; id <= MAX_BOTS + 1; id++) {
    const c = colorOf(id);
    assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `bad colour for ${id}`);
    assert.match(cssColorOf(id), /^#[0-9a-f]{6}$/);
    seen.add(c);
    assert.ok(nameOf(id).length > 0);
  }
  assert.equal(seen.size, MAX_BOTS + 1, 'two players share a colour');
  assert.equal(nameOf(1), 'You');
  assert.equal(nameOf(12), 'Bot 12');
});

test('line ownership bits can never collide: the highest player id still fits the 16-bit mask', () => {
  assert.ok(MAX_BOTS + 1 <= 15);
  const G = createGame(rng(5), {}, undefined, { botCount: MAX_BOTS });
  G.startGame();
  assert.ok(G.trail instanceof Uint16Array);
  const top = G.players.at(-1).id;
  assert.ok((1 << top) < 65536);
});
