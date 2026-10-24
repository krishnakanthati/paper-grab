// Beacons: glowing power-ups. They appear at random open spots, bots (sometimes) race the human to them, and whoever reaches the orb
// first claims the circle round it and captures every other player standing in it. See BEACON in config.ts.
import { BEACON } from '../config.ts';
import { bump } from './arena.ts';
import { kill } from './combat.ts';
import type { Beacon, Ctx, Player } from './types.ts';

export function resetBeacons(g: Ctx) { g.beacons = []; g.nextBeaconAt = BEACON.firstAfterTicks; g.beaconSeq = 0; }

/** Spawn a beacon when it is time (and there is room for one), and let old unclaimed ones fade away. */
export function updateBeacons(g: Ctx) {
  for (let i = g.beacons.length - 1; i >= 0; i--) {
    const b = g.beacons[i];
    if (g.tickCount - b.born >= BEACON.lifetimeTicks) { g.beacons.splice(i, 1); g.events.onBeaconGone?.(b); }
  }
  if (g.tickCount < g.nextBeaconAt || g.beacons.length >= BEACON.max) return;
  g.nextBeaconAt = g.tickCount + BEACON.everyTicks;
  for (let t = 0; t < BEACON.tries; t++) {
    const x = Math.floor(g.random() * g.NX), y = Math.floor(g.random() * g.NY);
    if (!g.land[y * g.NX + x] || g.arena.depth(x + 0.5, y + 0.5) < BEACON.clearance) continue;
    if (g.beacons.some(o => Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < BEACON.radius * 2)) continue;     // not on top of another
    const b: Beacon = { id: ++g.beaconSeq, x: x + 0.5, y: y + 0.5, born: g.tickCount };
    g.beacons.push(b); g.events.onBeaconSpawn?.(b);
    return;
  }
}

export function nearestBeacon(g: Ctx, x: number, y: number): { beacon: Beacon; dist: number } | null {
  let best: Beacon | null = null, bd = Infinity;
  for (const b of g.beacons) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
  return best ? { beacon: best, dist: bd } : null;
}

/** Take any beacon a head has reached. If two heads arrive on the same tick, the one closer to the orb gets it. */
export function collectBeacons(g: Ctx) {
  for (let i = g.beacons.length - 1; i >= 0; i--) {
    const b = g.beacons[i];
    let taker: Player | null = null, td = BEACON.collectRadius;
    for (const p of g.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < td) { td = d; taker = p; }
    }
    if (!taker) continue;
    g.beacons.splice(i, 1);
    trigger(g, b, taker);
  }
}

function trigger(g: Ctx, b: Beacon, p: Player) {
  const R = BEACON.radius;
  const victims = g.players.filter(o => o !== p && o.alive && Math.hypot(o.x - b.x, o.y - b.y) <= R);
  // the circle becomes the collector's land
  const claimed: number[] = [], takenFrom = new Map<number, number[]>(), lost = new Set<number>();
  for (let y = Math.max(0, Math.floor(b.y - R)); y <= Math.min(g.NY - 1, Math.ceil(b.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(b.x - R)); x <= Math.min(g.NX - 1, Math.ceil(b.x + R)); x++) {
      const i = y * g.NX + x;
      if (!g.land[i] || g.owner[i] === p.id || Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) > R) continue;
      const from = g.owner[i];
      if (from) { lost.add(from); (takenFrom.get(from) ?? takenFrom.set(from, []).get(from)!).push(i); }
      g.owner[i] = p.id; claimed.push(i);
    }
  }
  for (const id of lost) bump(g, id);
  bump(g, p.id); g.countsDirty = true;
  if (claimed.length) g.events.onCapture?.(p, claimed, takenFrom);
  g.events.onBeacon?.(b, p, victims, claimed);
  for (const v of victims) kill(g, v, p, 'caught in a beacon');         // each joins the collector's chain (and, for the human, that is the end of the round)
}
