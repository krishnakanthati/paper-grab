import { CAPTIVE, START_RADIUS } from '../config.ts';
import { bump, idx } from './arena.ts';
import { Trail } from './trail.ts';
import type { Ctx, Player } from './types.ts';

/** Clearance (cells) required around a spawn, tried from comfortable to cramped so a player can always be placed. */
const CLEARANCES = [4, 3, 2, 1];

function findSpawn(g: Ctx): [number, number] | null {
  for (const c of CLEARANCES) {
    const m = Math.max(START_RADIUS + 1, c + 1);                    // keep the whole starting patch inside the grid
    const tries = c === CLEARANCES[0] ? 800 : 500;
    for (let t = 0; t < tries; t++) {
      const x = Math.ceil(m) + Math.floor(g.random() * Math.max(1, g.NX - 2 * Math.ceil(m))), y = Math.ceil(m) + Math.floor(g.random() * Math.max(1, g.NY - 2 * Math.ceil(m)));
      let ok = g.arena.inside(x + 0.5, y + 0.5);
      for (let dy = -c; dy <= c && ok; dy += c) for (let dx = -c; dx <= c; dx += c) if (!g.arena.inside(x + 0.5 + dx, y + 0.5 + dy)) ok = false;
      for (let dy = -c; dy <= c && ok; dy++)
        for (let dx = -c; dx <= c; dx++) {
          const i = idx(g, x + dx, y + dy);
          if (!g.land[i] || g.owner[i] || g.trail[i]) { ok = false; break; }
        }
      if (ok) return [x, y];
    }
  }
  return null;
}

/** Put a player on a random free spot with a small round patch of their own colour. */
export function spawn(g: Ctx, p: Player): boolean {
  const s = findSpawn(g);
  if (!s) return false;
  p.x = s[0] + 0.5; p.y = s[1] + 0.5; p.px = p.x; p.py = p.y;
  p.angle = p.target = p.pa = g.random() * Math.PI * 2 - Math.PI;
  p.inOwner = p.id;
  p.trail = []; p.path = []; p.captives = []; p.capturedBy = 0; for (const q of g.players) if (q.captives.includes(p.id)) q.captives = q.captives.filter(id => id !== p.id); p.walk.reset(); p.walk.push(p.x, p.y); p.alive = true; p.blocked = false; p.slide = 1; p.slideLock = 0; p.slideIntent = 0; p.stuckIntent = 0; p.stuck = false; p.trailStartTick = Infinity;
  p.shield = p.shieldCool = 0; p.dash = p.dashCool = 0; p.returning = false; p.edgeRun = false; p.phase = 0; p.thinkIn = 0;
  p.leg = 8 + Math.floor(g.random() * 10); p.leg2 = 6 + Math.floor(g.random() * 8); p.turnSign = g.random() < 0.5 ? -1 : 1;
  const r = Math.ceil(START_RADIUS);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (Math.hypot(dx, dy) <= START_RADIUS) g.owner[idx(g, s[0] + dx, s[1] + dy)] = p.id;
  bump(g, p.id);
  return true;
}

export function newPlayer(id: number): Player {
  return {
    id, isBot: id > 1, alive: false, x: 0, y: 0, px: 0, py: 0, angle: 0, pa: 0, inOwner: 0, kills: 0, walk: new Trail(CAPTIVE.historyStep), captives: [], target: 0, trail: [], path: [],
    trailStartTick: Infinity, blocked: false, slide: 1, slideLock: 0, slideIntent: 0, stuckIntent: 0, stuck: false, respawnIn: 0, capturedBy: 0,
    shield: 0, shieldCool: 0, dash: 0, dashCool: 0, returning: false, edgeRun: false, phase: 0, leg: 10, leg2: 8, turnSign: 1, thinkIn: 0,
  };
}
