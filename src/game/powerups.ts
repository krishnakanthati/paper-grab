// Power-up pickups: boost, shield and freeze. They appear at random open spots, bots sometimes race for them, and the first head to
// reach one gets its effect for a few seconds (the effect timers are on the player, counted down here). See POWERUP in config.ts.
import { POWERUP } from '../config.ts';
import { bump } from './arena.ts';
import type { Ctx, Pickup, Player, PowerKind } from './types.ts';

export function resetPowerups(g: Ctx) { g.pickups = []; g.nextPickupAt = POWERUP.firstAfterTicks; g.pickupSeq = 0; }

/** Count the effects down, let old pickups fade, and spawn a new one when it is time (and there is room). */
export function updatePowerups(g: Ctx) {
  for (const p of g.players) { if (p.boost > 0) p.boost--; if (p.shield > 0) p.shield--; if (p.frozen > 0) p.frozen--; }
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const k = g.pickups[i];
    if (g.tickCount - k.born >= POWERUP.lifetimeTicks) { g.pickups.splice(i, 1); g.events.onPickupGone?.(k); }
  }
  if (g.tickCount < g.nextPickupAt || g.pickups.length >= POWERUP.max) return;
  g.nextPickupAt = g.tickCount + POWERUP.everyTicks;
  for (let t = 0; t < POWERUP.tries; t++) {
    const x = Math.floor(g.random() * g.NX), y = Math.floor(g.random() * g.NY);
    if (!g.land[y * g.NX + x] || g.arena.depth(x + 0.5, y + 0.5) < POWERUP.clearance) continue;
    if (g.pickups.some(o => Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < 4)) continue;
    if (g.beacons.some(b => Math.hypot(b.x - x - 0.5, b.y - y - 0.5) < 4)) continue;
    const kind: PowerKind = POWERUP.kinds[Math.floor(g.random() * POWERUP.kinds.length)];
    const k: Pickup = { id: ++g.pickupSeq, kind, x: x + 0.5, y: y + 0.5, born: g.tickCount };
    g.pickups.push(k); g.events.onPickupSpawn?.(k);
    return;
  }
}

export function nearestPickup(g: Ctx, x: number, y: number): { pickup: Pickup; dist: number } | null {
  let best: Pickup | null = null, bd = Infinity;
  for (const k of g.pickups) { const d = Math.hypot(k.x - x, k.y - y); if (d < bd) { bd = d; best = k; } }
  return best ? { pickup: best, dist: bd } : null;
}

/** Give the effect to whoever is closest to a pickup and within reach of it. */
export function collectPowerups(g: Ctx) {
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const k = g.pickups[i];
    let taker: Player | null = null, td = POWERUP.collectRadius;
    for (const p of g.players) {
      if (!p.alive || p.frozen > 0) continue;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d < td) { td = d; taker = p; }
    }
    if (!taker) continue;
    g.pickups.splice(i, 1);
    const frozen: Player[] = [];
    let claimed: number[] = [];
    if (k.kind === 'boost') taker.boost = POWERUP.boostTicks;
    else if (k.kind === 'shield') taker.shield = POWERUP.shieldTicks;
    else if (k.kind === 'magnet') claimed = pullLand(g, taker);
    else for (const o of g.players) {
      if (o === taker || !o.alive || o.shield > 0 || Math.hypot(o.x - taker.x, o.y - taker.y) > POWERUP.freezeRadius) continue;
      o.frozen = POWERUP.freezeTicks; frozen.push(o);
    }
    g.events.onPickup?.(k, taker, frozen, claimed);
  }
}

/** Magnet: every free land cell (nobody's land, nobody's line) within the radius of the taker's head becomes the taker's. */
function pullLand(g: Ctx, p: Player): number[] {
  const R = POWERUP.magnetRadius, claimed: number[] = [];
  for (let y = Math.max(0, Math.floor(p.y - R)); y <= Math.min(g.NY - 1, Math.ceil(p.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(p.x - R)); x <= Math.min(g.NX - 1, Math.ceil(p.x + R)); x++) {
      const i = y * g.NX + x;
      if (!g.land[i] || g.owner[i] !== 0 || g.trail[i] !== 0 || Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > R) continue;
      g.owner[i] = p.id; claimed.push(i);
    }
  }
  if (claimed.length) { bump(g, p.id); g.countsDirty = true; g.events.onCapture?.(p, claimed); }
  return claimed;
}
