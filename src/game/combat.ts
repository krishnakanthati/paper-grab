// Who dies, and when: cutting lines, the safe-zone rule, head-on crashes, and entering cells.
import { CAPTIVE, CAPTIVES_MAX, HEAD_HIT, LINE_HIT, RESPAWN_TICKS, SELF_GRACE, nameOf } from '../config.ts';
import { bump, cellOf } from './arena.ts';
import { capture } from './capture.ts';
import type { Ctx, Player } from './types.ts';

/** A captive goes free (its captor died, or the chain was too long): a computer player starts its respawn countdown again. */
export function release(g: Ctx, id: number) {
  const q = g.players[id - 1];
  if (!q) return;
  q.capturedBy = 0;
  if (q.isBot && !q.alive) q.respawnIn = RESPAWN_TICKS;
}

/** Put `ids` in `captor`'s chain (they are now held by it), keeping the chain within its limit; whoever falls off the far end is freed. */
export function holdCaptives(g: Ctx, captor: Player, ids: number[]) {
  for (const id of ids) {
    if (id === captor.id || captor.captives.includes(id)) continue;
    captor.captives.push(id);
    const q = g.players[id - 1]; if (q) q.capturedBy = captor.id;
  }
  while (captor.captives.length > CAPTIVES_MAX) release(g, captor.captives.shift()!);
}

export function kill(g: Ctx, p: Player, killer: Player | null, reason: string) {
  if (!p.alive) return;
  if (p.shield > 0 && killer && killer !== p) return;      // a shield: nobody else can catch, cut or crash into this player
  p.alive = false;
  const captor = killer && killer !== p && killer.alive ? killer : null;
  if (killer && killer !== p) killer.kills++;
  for (const i of p.trail) g.trail[i] &= ~(1 << p.id);
  p.trail = []; p.path = [];
  const chain = p.captives;                              // whoever this player had captured: they go to the captor (below), or are freed
  p.captives = [];
  const taken: number[] = [], cleared: number[] = [];
  for (let i = 0; i < g.owner.length; i++) {
    if (g.owner[i] !== p.id) continue;
    if (captor) { g.owner[i] = captor.id; taken.push(i); } else { g.owner[i] = 0; cleared.push(i); }     // a captured player's land becomes the captor's, not nobody's
  }
  bump(g, p.id);
  if (captor) {
    bump(g, captor.id); g.countsDirty = true;
    holdCaptives(g, captor, [...chain, p.id]);                            // the victim's whole chain joins the captor's, then the victim itself: none of them respawn while held
    if (taken.length) { g.events.onConvert?.(p, captor, taken); g.events.onCapture?.(captor, taken, new Map([[p.id, taken]])); }               // the same flash, ring and chime as any grab
  }
  if (cleared.length) g.events.onClear?.(p, cleared);
  g.events.onKill?.(p, killer, reason);
  if (!p.isBot) { g.running = false; g.events.onGameOver?.(reason); }
  else if (captor) p.respawnIn = Infinity;                                  // captured: it stays in the chain, it does not come back
  else { p.respawnIn = RESPAWN_TICKS; p.capturedBy = 0; }
  if (!captor) for (const id of chain) release(g, id);                      // nobody took over this player's chain: its captives go free
}

/** The head of `p` just entered cell `i`: close a loop, or extend its own line. (Cutting is decided by real geometry in lineContacts.) */
export function enterCell(g: Ctx, p: Player, i: number) {
  if (!p.alive || !g.land[i]) return;                    // a head may brush past a few water cells at a coast bend: lines and land are cell-based and ignore them
  const o = g.owner[i];                                  // whose land is under the head now?
  if (o !== p.inOwner) {
    if (p.inOwner === p.id && o !== p.id) g.events.onLeaveHome?.(p);
    if (o !== 0 && o !== p.id) g.events.onEnterEnemyLand?.(p, o);
    p.inOwner = o;
  }
  if (g.owner[i] === p.id) { if (p.trail.length) capture(g, p); }
  else if (!(g.trail[i] & (1 << p.id))) {
    if (!p.trail.length) { p.path = [p.px, p.py]; p.trailStartTick = g.tickCount; }
    g.trail[i] |= 1 << p.id; p.trail.push(i);
  }
}

/** Shortest distance from point (x, y) to the polyline `path` (flat [x0,y0,x1,y1,...]), skipping the last `skip` segments. */
export function distToPath(path: number[], x: number, y: number, skip: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < path.length - skip * 2; i += 2) {
    const ax = path[i], ay = path[i + 1], bx = path[i + 2], by = path[i + 3];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Touching a drawn line: a head cuts a rival when its body overlaps the line as it is actually drawn (head circle
 * against the line's width), not merely because it entered a grid cell the line passes through. The grid is only
 * used to find which lines are anywhere near. The segment attached to the owner's own head is excluded, so two
 * heads meeting is decided by head-on rules instead.
 */
export function lineContacts(g: Ctx) {
  for (const a of g.players) {
    if (!a.alive) continue;
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    let near = 0;                                                  // bitset of line owners within one cell of the head
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= g.NX || y >= g.NY) continue;
        near |= g.trail[y * g.NX + x];
      }
    if (!near) continue;
    for (const b of g.players) {
      if (!b.alive || !(near & (1 << b.id))) continue;
      if (b === a) {
        if (!g.rules.selfCollisionKills) continue;                   // criss-crossing your own line is harmless and claims nothing: land is only claimed by getting home
        if (distToPath(a.path, a.x, a.y, SELF_GRACE * 4) < LINE_HIT * 0.75) { kill(g, a, null, 'you ran into your own line'); }
      } else if (distToPath(b.path, a.x, a.y, 1) < LINE_HIT) {
        kill(g, b, a, 'cut by ' + nameOf(a.id).toLowerCase());
      }
    }
  }
}

/** Heads that touch: your own land protects you; outside land the older line loses (a tie kills both). */
export function resolveHeads(g: Ctx) {
  const ps = g.players;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (!a.alive || !b.alive || Math.hypot(a.x - b.x, a.y - b.y) >= HEAD_HIT) continue;
      const ia = g.owner[cellOf(g, a)] === a.id, ib = g.owner[cellOf(g, b)] === b.id;
      if (ia && ib) continue;
      if (ia) kill(g, b, a, 'caught on ' + nameOf(a.id).toLowerCase() + "'s land");
      else if (ib) kill(g, a, b, 'caught on ' + nameOf(b.id).toLowerCase() + "'s land");
      else if (a.trailStartTick < b.trailStartTick) kill(g, a, b, 'head-on crash');
      else if (b.trailStartTick < a.trailStartTick) kill(g, b, a, 'head-on crash');
      else { kill(g, a, b, 'head-on crash'); kill(g, b, a, 'head-on crash'); }
    }
}

/**
 * Heads that touch and kill nobody (both on their own land, or a shield) must not pass through each other: push them
 * apart to just-touching. A head drawing a line is never moved, since that would kink its path; if it meets a free head
 * only the free one gives way.
 */
export function separateHeads(g: Ctx) {
  const ps = g.players;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= HEAD_HIT) continue;
      if (d < 1e-6) { dx = Math.cos(a.angle + Math.PI); dy = Math.sin(a.angle + Math.PI); d = 1; }
      const ux = dx / d, uy = dy / d, gap = HEAD_HIT - Math.min(d, HEAD_HIT);
      const aFixed = a.trail.length > 0, bFixed = b.trail.length > 0;
      if (aFixed && bFixed) continue;
      const wa = aFixed ? 0 : bFixed ? 1 : 0.5, wb = 1 - wa;
      const shove = (p: Player, sx: number, sy: number) => {
        if (!g.arena.inside(p.x + sx, p.y + sy)) return false;
        p.x += sx; p.y += sy; p.px += sx; p.py += sy;
        return true;
      };
      const okA = wa === 0 || shove(a, -ux * gap * wa, -uy * gap * wa);
      const okB = wb === 0 || shove(b, ux * gap * wb, uy * gap * wb);
      if (!okA && okB && wb < 1 && !bFixed) shove(b, ux * gap * wa, uy * gap * wa);       // blocked by the coast: the other takes the whole push
      else if (!okB && okA && wa < 1 && !aFixed) shove(a, -ux * gap * wb, -uy * gap * wb);
    }
}

/**
 * Captives follow their leader along the path it walked, so each one is a real place on the map. A head that touches a
 * captive takes it and everyone behind it (a cut tail); the captives in front of it stay safe with their leader. Touching
 * the first captive therefore takes the whole chain. The leader's own head never cuts its own chain.
 */
export function chainContacts(g: Ctx) {
  for (const a of g.players) {
    if (!a.alive) continue;
    for (const b of g.players) {
      if (b === a || !b.alive || !b.captives.length) continue;
      const slots = b.walk.slots(b.captives.length, CAPTIVE.spacing, CAPTIVE.firstOffset);
      for (let i = 0; i < b.captives.length; i++) {
        const slot = slots[i];
        if (Math.hypot(a.x - slot.x, a.y - slot.y) >= CAPTIVE.hitRadius) continue;
        const cut = b.captives.splice(i), taken = cut.filter(id => id !== a.id && !a.captives.includes(id));
        for (const id of cut) if (id === a.id) release(g, id);              // cutting out the one holding... yourself: you are free
        holdCaptives(g, a, taken);
        if (taken.length) g.events.onChainCut?.(b, a, taken);
        break;                                            // one cut per pair per tick
      }
    }
  }
}
