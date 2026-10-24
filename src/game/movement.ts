// One tick of motion for one player: steer, move, glide along the rim, and report cells entered.
import { EDGE_RELEASE, EDGE_SPEED_MULT, SPEED, TICK_HZ, TURN_RATE } from '../config.ts';
import { HEAD_DEPTH } from './arena.ts';
import { idx } from './arena.ts';
import { thinkBot } from './bots.ts';
import { enterCell } from './combat.ts';
import type { Ctx, Player } from './types.ts';

/** How far past the hugging depth a head may be and still count as being on the coast (cells). */
const STICK_BAND = 0.35;
/** How far (radians) the steering must swing from the heading held at the coast before the head leaves it. */
const RELEASE_TURN = 0.8;

export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

export function stepPlayer(g: Ctx, p: Player) {
  if (!p.alive) return;
  const dt = 1 / TICK_HZ;
  if (p.isBot) thinkBot(g, p);

  p.pa = p.angle;
  const diff = wrapAngle(p.target - p.angle), maxTurn = TURN_RATE * dt;
  p.angle = wrapAngle(p.angle + (Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn));

  const lastDx = p.x - p.px, lastDy = p.y - p.py;        // how we actually moved last tick (used to keep sliding the same way)
  p.px = p.x; p.py = p.y;
  const speed = SPEED;
  let nx = p.x + Math.cos(p.angle) * speed * dt, ny = p.y + Math.sin(p.angle) * speed * dt;
  p.blocked = false;
  // Once on the coast you STAY on it (following it round every bend) until you deliberately steer inland: the heading
  // alone leaving the coast does not count, only your steering target pointing into the land.
  if (p.stuck) {
    const [wx, wy] = g.arena.inward(p.px, p.py);
    const wantsInland = Math.cos(p.target) * wx + Math.sin(p.target) * wy > EDGE_RELEASE;
    // Judged against the heading held when we hit the coast, not the local inward normal: on a lobe or bay the normal
    // swings round, which used to read as "wants inland" and flung the head off into a loop.
    const turnedAway = Math.abs(wrapAngle(p.target - p.stuckIntent)) > RELEASE_TURN;
    if ((wantsInland && turnedAway) || g.arena.depth(p.px, p.py) > HEAD_DEPTH + STICK_BAND) p.stuck = false;
    else if (!wantsInland) p.stuckIntent = p.target;
  }
  if (p.stuck || !g.arena.inside(nx, ny)) {              // the coast never stops you: you keep moving at full speed along it
    const hitHeading = p.angle;                          // before the slide below rewrites it
    const len = Math.hypot(nx - p.px, ny - p.py) * EDGE_SPEED_MULT;   // twice as fast along the coast
    const [ix, iy] = g.arena.inward(p.px, p.py);         // unit vector into the land
    const tx = -iy, ty = ix;                             // along the coast
    const along = Math.cos(p.target) * tx + Math.sin(p.target) * ty;   // which way the PLAYER wants to go along it
    // Which way along the coast? Two rules, in this order:
    //  1. the player steered somewhere new -> follow the new steering;
    //  2. otherwise keep going the way we were PHYSICALLY moving. (A label like "+1 = clockwise" is relative to the local
    //     inward normal, which flips at a sharp tip, so keeping the label made the head reverse there and ping-pong.)
    const continuity = lastDx * tx + lastDy * ty;
    const sameIntent = p.slideLock > 0 && Math.abs(wrapAngle(p.target - p.slideIntent)) < 0.6;
    let first = p.slide;
    if (!sameIntent) {
      p.slideIntent = p.target;
      if (Math.abs(along) >= 0.05) first = along > 0 ? 1 : -1;
      else if (Math.abs(continuity) > 1e-6) first = continuity > 0 ? 1 : -1;
    } else if (Math.abs(continuity) > 1e-6) first = continuity > 0 ? 1 : -1;
    p.slideLock = 12;                                    // refreshed on every tick of contact; expires shortly after leaving
    let moved = false;
    for (const side of [first, -first]) {                // prefer our direction; in a concave corner take the other way out
      // step along the coast, then project onto the contour heads hug: the gap to the edge stays uniform and the path smooth
      const [cx, cy] = g.arena.snap(p.px + tx * side * len, p.py + ty * side * len);
      if (g.arena.inside(cx, cy)) {
        nx = cx; ny = cy; p.slide = side; moved = true;
        p.angle = Math.atan2(ny - p.py, nx - p.px);      // face the way we actually moved
        break;
      }
    }
    if (!moved) { nx = p.px + ix * len * 0.5; ny = p.py + iy * len * 0.5; p.angle = Math.atan2(iy, ix); }
    if (!p.stuck) p.stuckIntent = hitHeading;            // the heading we actually hit the coast with, not the target: a head still mid-turn after being released would otherwise record its inland target as the held heading and never be able to leave again
    p.blocked = true; p.stuck = true;
  } else if (p.slideLock > 0) p.slideLock--;

  const ocx = Math.floor(p.px), ocy = Math.floor(p.py), ncx = Math.floor(nx), ncy = Math.floor(ny);
  p.x = nx; p.y = ny;
  if (ncx !== ocx || ncy !== ocy) {
    if (ncx !== ocx && ncy !== ocy) {                    // diagonal: also enter the cell the path crossed first, so lines stay gap-free
      const tx = ((ncx > ocx ? ncx : ocx) - p.px) / (nx - p.px), ty = ((ncy > ocy ? ncy : ocy) - p.py) / (ny - p.py);
      const mid = tx < ty ? idx(g, ncx, ocy) : idx(g, ocx, ncy);
      if (g.land[mid]) enterCell(g, p, mid);
    }
    if (p.alive) enterCell(g, p, idx(g, ncx, ncy));
  }
  if (p.alive && p.trail.length) p.path.push(p.x, p.y);
}
