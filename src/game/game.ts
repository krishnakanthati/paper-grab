// Wires the rules modules together into a running game.
import { BOT_COUNT, CAPTIVE, captiveDistance, DEFAULT_RULES, WIN_SHARE, DIR_ANGLES, MAX_BOTS, MILESTONES, MIN_LAND_PER_BOT } from '../config.ts';
import { WORLD_SHAPE } from '../data/worldMask.ts';
import { buildArena, bump, recount } from './arena.ts';
import { tickShields, useDash, useShield } from './shield.ts';
import { chainContacts, kill, lineContacts, resolveHeads, separateHeads } from './combat.ts';
import { stepPlayer, wrapAngle } from './movement.ts';
import { newPlayer, spawn } from './spawn.ts';
import type { Ctx, Game, GameEvents, GameOptions, Rules } from './types.ts';

/** How many bots suit an arena of this many land cells: the default for big arenas, fewer for small ones, never fewer than one. */
export function defaultBotCount(landCount: number): number {
  return Math.max(1, Math.min(BOT_COUNT, Math.floor(landCount / MIN_LAND_PER_BOT) - 1));
}

export function createGame(random: () => number = Math.random, events: GameEvents = {}, rules: Rules = DEFAULT_RULES, options: GameOptions = {}): Game {
  const shape = options.shape ?? WORLD_SHAPE;
  const NX = shape.nx, NY = shape.ny;
  const { land, landCount, arena } = buildArena(shape);
  const botCount = Math.max(0, Math.min(MAX_BOTS, Math.floor(options.botCount ?? defaultBotCount(landCount))));

  const g: Ctx = {
    shape, NX, NY, botCount, land, arena,
    owner: new Uint8Array(NX * NY), trail: new Uint16Array(NX * NY), landCount,
    players: [], counts: new Array(botCount + 2).fill(0), ver: new Array(botCount + 2).fill(0),
    running: false, tickCount: 0, bestCells: 0, rules,
    random, events, labelBuf: new Uint32Array(NX * NY), labelGen: 0, countsDirty: true, lastLeader: 0, milestone: 0,
    startGame: () => startGame(), respawnHuman: () => respawnHuman(), tick: () => tick(), setTarget: (a) => setTarget(a),
    setDir: (d) => setTarget(DIR_ANGLES[d]), leaderId: () => leaderId(), useShield: () => useShield(g, g.players[0]), useDash: () => useDash(g, g.players[0]),
  };

  function startGame() {
    g.owner.fill(0); g.trail.fill(0);
    g.players = [];
    for (let id = 1; id <= botCount + 1; id++) {
      const p = newPlayer(id);
      g.players.push(p);
      spawn(g, p);
    }
    g.bestCells = 0; g.tickCount = 0; g.lastLeader = 0; g.milestone = 0;
    g.running = true;
    for (let id = 0; id < g.ver.length; id++) bump(g, id);
    recount(g);
  }

  /** The human was eliminated: put them back on a fresh patch in the same world. Everyone else carries on. */
  function respawnHuman() {
    const p = g.players[0];
    if (!p || p.alive) return false;
    p.kills = 0; p.trail = []; p.path = [];
    if (!spawn(g, p)) return false;
    g.bestCells = 0; g.milestone = 0;
    g.running = true;
    recount(g);
    return true;
  }

  function tick() {
    g.tickCount++;
    for (const p of g.players) {
      stepPlayer(g, p);
      if (p.alive) { p.walk.push(p.x, p.y); p.walk.trim(captiveDistance(p.captives.length) + CAPTIVE.historyMargin); }
    }
    lineContacts(g);
    resolveHeads(g);
    separateHeads(g);
    chainContacts(g);
    tickShields(g);
    if (g.countsDirty) recount(g);
    for (const p of g.players) if (p.alive && g.counts[p.id] === 0) kill(g, p, null, 'you lost all your land');
    for (const p of g.players) if (p.isBot && !p.alive && !p.capturedBy && --p.respawnIn <= 0) spawn(g, p);
    if (g.countsDirty) recount(g);
    g.bestCells = Math.max(g.bestCells, g.counts[1]);
    const lead = leaderId();                                     // the crown changed hands
    if (lead !== g.lastLeader) { g.lastLeader = lead; if (lead) g.events.onLeader?.(lead); }
    const share = (g.counts[1] / g.landCount) * 100;             // the human passed a share-of-the-world milestone
    while (g.players[0].alive && g.milestone < MILESTONES.length && share >= MILESTONES[g.milestone]) {
      const passed = g.milestone++;                              // advance first: `handler?.(g.milestone++)` would skip the increment when there is no handler
      g.events.onMilestone?.(passed);
    }
    if (g.running && g.players[0].alive && g.counts[1] >= g.landCount * WIN_SHARE) {
      if (g.counts[1] < g.landCount) {                           // a sliver is left: it is yours too, so the board really is all one colour
        const lost = new Set<number>();
        for (let i = 0; i < g.owner.length; i++) if (g.land[i] && g.owner[i] !== 1) { if (g.owner[i]) lost.add(g.owner[i]); g.owner[i] = 1; }
        for (const id of lost) bump(g, id);
        bump(g, 1); recount(g);
      }
      g.running = false; g.events.onWin?.();
    }
  }

  function setTarget(angle: number) {
    const p = g.players[0];
    if (!g.running || !p || !p.alive) return;
    p.target = wrapAngle(angle);
  }

  function leaderId() {
    let best = 0, id = 0;
    for (const p of g.players) if (p.alive && g.counts[p.id] > best) { best = g.counts[p.id]; id = p.id; }
    return id;
  }

  return g;
}
