// Bot planning: leave home, run a leg, turn 90 degrees, run a second leg, then head back to close the loop.
import { BEACON, BOT_AI, BOT_EDGE, CAPTIVE, POWERUP, SELF_GRACE } from '../config.ts';
import { nearestBeacon } from './beacons.ts';
import { nearestPickup } from './powerups.ts';
import { cellOf, idx } from './arena.ts';
import { wrapAngle } from './movement.ts';
import type { Ctx, Player } from './types.ts';

/** The point on the flat path [x0,y0,x1,y1,...] nearest to (x, y), skipping the last `skip` segments (the ones at the owner's head). */
export function nearestOnPath(path: number[], x: number, y: number, skip = 0): { x: number; y: number; d: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let i = 0; i + 3 < path.length - skip * 2; i += 2) {
    const ax = path[i], ay = path[i + 1], dx = path[i + 2] - ax, dy = path[i + 3] - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(x - qx, y - qy);
    if (!best || d < best.d) best = { x: qx, y: qy, d };
  }
  return best;
}

/** Can this rival be hurt (or hurt us)? Not out, held captive, or shielded (nobody can cut or catch a shielded player). */
const exposed = (q: Player) => q.alive && !q.capturedBy && q.shield <= 0;

/** Is some rival about to cut our open line? Its head is close to the line, or to the spot it reaches a moment from now. */
export function lineThreatened(g: Ctx, p: Player): boolean {
  if (p.path.length < 6) return false;
  for (const q of g.players) {
    if (q === p || !exposed(q) || q.frozen > 0) continue;
    const ax = q.x + Math.cos(q.angle) * BOT_AI.fleeLook, ay = q.y + Math.sin(q.angle) * BOT_AI.fleeLook;
    const now = nearestOnPath(p.path, q.x, q.y, 1), soon = nearestOnPath(p.path, ax, ay, 1);
    if ((now && now.d < BOT_AI.fleeRange) || (soon && soon.d < BOT_AI.fleeRange * 0.6)) return true;
  }
  return false;
}

/** Where to aim to take a rival out, or null: a trespasser on our land (head-on, led a little), or the nearest piece of a rival's open line. */
export function preyAim(g: Ctx, p: Player): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  const homeSafe = g.owner[cellOf(g, p)] === p.id;
  for (const q of g.players) {
    if (q === p || !exposed(q)) continue;
    const bias = q.id === 1 ? BOT_AI.humanBias : 1;
    if (q.inOwner === p.id && g.owner[cellOf(g, q)] === p.id) {            // standing on our land: our head touching theirs wins
      const d = Math.hypot(q.x - p.x, q.y - p.y) * bias;
      if (d < BOT_AI.interceptRange && d < bestD) { bestD = d; best = { x: q.x + Math.cos(q.angle) * 1.5, y: q.y + Math.sin(q.angle) * 1.5 }; }
      continue;
    }
    if (p.trail.length > BOT_AI.huntMaxTrail && !homeSafe) continue;
    if (q.captives.length) {                                                // a chain of captives: touching it takes them (and everyone behind the touch)
      const slots = q.walk.slots(q.captives.length, CAPTIVE.spacing, CAPTIVE.firstOffset);
      for (const slot of slots) {
        const d = Math.hypot(slot.x - p.x, slot.y - p.y) * bias * 0.7;      // worth going further for than a bare line
        if (d < BOT_AI.chainRange && d < bestD) { bestD = d; best = { x: slot.x, y: slot.y }; }
      }
    }
    const hit = q.path.length >= 6 ? nearestOnPath(q.path, p.x, p.y, 1) : null;
    if (hit && hit.d * bias < BOT_AI.huntRange && hit.d * bias < bestD) { bestD = hit.d * bias; best = { x: hit.x, y: hit.y }; }
  }
  return best;
}

/**
 * A rival head about to meet ours (both off their own land): the OLDER line loses the crash, and whoever stands on their own land wins it.
 * Returns the heading to take, or null when nothing is about to happen: dodge sideways if we would lose, charge if we would win.
 */
export function headOnReaction(g: Ctx, p: Player): number | null {
  if (g.owner[cellOf(g, p)] === p.id) return null;                           // on our own land we win every crash: nothing to dodge
  const pStart = p.trail.length ? p.trailStartTick : Infinity;
  for (const q of g.players) {
    if (q === p || !exposed(q)) continue;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
    if (d > BOT_AI.headOnRange) continue;
    if (Math.cos(wrapAngle(q.angle - Math.atan2(dy, dx))) < 0.55) continue;     // it is not heading for us
    const qHome = g.owner[cellOf(g, q)] === q.id, qStart = q.trail.length ? q.trailStartTick : Infinity;
    const lose = qHome || pStart < qStart;
    if (!lose && pStart === qStart) continue;                                // a tie kills both: not worth it
    if (!lose) return Math.atan2(-dy, -dx);                                  // we would win: charge
    let best: number | null = null, bestD = -1;
    for (const side of [Math.PI / 2, -Math.PI / 2]) {                        // dodge to whichever side stays inside the arena and ends up furthest from it
      const a = q.angle + side, ax = p.x + Math.cos(a) * 3, ay = p.y + Math.sin(a) * 3;
      if (!g.arena.inside(ax, ay)) continue;
      const dist = Math.hypot(ax - q.x, ay - q.y);
      if (dist > bestD) { bestD = dist; best = a; }
    }
    return best ?? p.angle + Math.PI / 2;
  }
  return null;
}

export function thinkBot(g: Ctx, p: Player) {
  if (--p.thinkIn > 0) return;
  p.thinkIn = 3 + ((g.random() * 4) | 0);
  const rnd = g.random;
  const inHome = g.owner[cellOf(g, p)] === p.id;
  if (inHome) {                                          // back on our land: plan the next loop
    p.returning = false; p.phase = 0; p.edgeRun = rnd() < BOT_EDGE.chance;
    p.leg = 8 + Math.floor(rnd() * 12); p.leg2 = 6 + Math.floor(rnd() * 10); p.turnSign = rnd() < 0.5 ? -1 : 1;
    if (g.players.some(q => q !== p && exposed(q) && g.owner[cellOf(g, q)] !== p.id && Math.hypot(q.x - p.x, q.y - p.y) < BOT_AI.cautiousRange)) {
      p.leg = Math.ceil(p.leg * BOT_AI.cautiousLoop); p.leg2 = Math.ceil(p.leg2 * BOT_AI.cautiousLoop); p.edgeRun = false;      // rivals about: a short, safe loop
    }
  }

  let want = p.target;
  if (inHome) {
    if (rnd() < 0.3) want = p.angle + (rnd() - 0.5) * Math.PI;
  } else if (p.edgeRun && p.phase === 0) {                        // an edge run: aim outward until the coast is reached, then follow it
    const [ix, iy] = g.arena.inward(p.x, p.y);
    want = Math.atan2(-iy, -ix);
    if (p.trail.length >= BOT_EDGE.minLeg && g.arena.depth(p.x, p.y) < 1.5) { p.phase = 1; p.leg2 = p.trail.length + 14 + Math.floor(rnd() * 16); want = p.angle + p.turnSign * Math.PI / 2; }
  } else if (p.phase === 0 && p.trail.length >= p.leg) {          // first leg done: turn 90 degrees
    p.phase = 1; p.leg2 += p.trail.length; want = p.angle + p.turnSign * Math.PI / 2;
  } else if (p.phase === 1 && p.trail.length >= p.leg2) {         // second leg done: head home
    p.phase = 2; p.returning = true;
  }
  let alert = false;
  if (!inHome && !p.returning && lineThreatened(g, p)) { p.returning = true; p.phase = 2; alert = true; }       // somebody is about to cut our line: get home
  if (p.returning) {
    let best = 1e9, bx = g.NX / 2, by = g.NY / 2;
    for (let i = 0; i < g.owner.length; i++) {
      if (g.owner[i] !== p.id) continue;
      const d = Math.hypot((i % g.NX) + 0.5 - p.x, ((i / g.NX) | 0) + 0.5 - p.y);
      if (d < best) { best = d; bx = (i % g.NX) + 0.5; by = ((i / g.NX) | 0) + 0.5; }
    }
    want = Math.atan2(by - p.y, bx - p.x);
  }
  if (!p.returning && g.beacons.length) {                         // a beacon close by: sometimes race the others to it
    const near = nearestBeacon(g, p.x, p.y);
    if (near && near.dist < BEACON.botRange && rnd() < BEACON.botChance) want = Math.atan2(near.beacon.y - p.y, near.beacon.x - p.x);
  }
  if (!p.returning && g.pickups.length) {                         // a power-up close by: sometimes go and take it
    const near = nearestPickup(g, p.x, p.y);
    if (near && near.dist < POWERUP.botRange && rnd() < POWERUP.botChance) want = Math.atan2(near.pickup.y - p.y, near.pickup.x - p.x);
  }
  if (!p.returning && rnd() < BOT_AI.huntChance) {                // a rival's exposed line (or a trespasser): go and take it
    const prey = preyAim(g, p);
    if (prey) { want = Math.atan2(prey.y - p.y, prey.x - p.x); alert = true; }
  }
  const crash = headOnReaction(g, p);                              // about to meet a head: dodge or charge (this beats everything above)
  if (crash !== null) { want = crash; alert = true; }
  if (alert) p.thinkIn = BOT_AI.reactTicks;
  const ahead = 3.2;                                              // about to run into the coast: bend back inland
  if (!p.edgeRun && !g.arena.inside(p.x + Math.cos(want) * ahead, p.y + Math.sin(want) * ahead)) {
    const [ix, iy] = g.arena.inward(p.x, p.y);
    want = Math.atan2(iy, ix) + (rnd() - 0.5) * 0.6;
  }
  if (g.rules.selfCollisionKills) {                               // look ahead and steer off our own line
    for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
      const a = want + turn;
      const k = p.trail.lastIndexOf(idx(g, Math.floor(p.x + Math.cos(a) * 2), Math.floor(p.y + Math.sin(a) * 2)));
      if (k === -1 || k >= p.trail.length - SELF_GRACE) { want = a; break; }
    }
  }
  p.target = wrapAngle(want);
}
