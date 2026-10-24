import { COAST_FILL, RIM_WIN } from '../config.ts';
import { bump } from './arena.ts';
import type { Ctx, Player } from './types.ts';

/**
 * Close a loop: own the line, then split the land beside it into regions that aren't ours and claim the ones the
 * loop actually ENCLOSES. The rim and our own land bound regions, so a loop can be closed against the rim, and a pocket
 * walled in by our own crossing line counts too. "Enclosed" means inside the path we walked (closed back through our
 * own land), not "the smaller side": a loop right round the rim claims the whole interior, not the thin strip beside
 * the coast. Land that belonged to someone else is taken, which is how territory is stolen.
 */
const SAMPLES_PER_REGION = 9;

/** Even-odd point-in-polygon against a flat [x0,y0,x1,y1,...] path, closed from its last point back to its first. */
export function insidePath(path: number[], x: number, y: number): boolean {
  let inside = false;
  const n = path.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = path[2 * i], yi = path[2 * i + 1], xj = path[2 * j], yj = path[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Shortest distance from (x, y) to the open polyline `path` (flat [x0,y0,x1,y1,...]). */
function distToLine(path: number[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < path.length; i += 2) {
    const ax = path[i], ay = path[i + 1], dx = path[i + 2] - ax, dy = path[i + 3] - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * The line cells wall the loop in, so they are all claimed while the inside is worked out. But a cell is taken whole, so one the drawn line
 * only grazes (its centre is outside the walked outline and well away from the line) used to drag a strip of land out past the outline: the
 * fill "bled". Once the inside is settled, give such cells back to whoever held them. Cells next to our own land and cells at the coast
 * are kept, so the loop still joins up without slivers and the coast-hugging rules are untouched.
 */
const GRAZE_GIVE_BACK = 0.3;
function giveBackGrazed(g: Ctx, p: Player, walked: number[], before: Map<number, number>, claimed: number[]) {
  if (walked.length < 6) return;
  const back = new Set<number>();
  for (const [i, prev] of before) {
    const x = i % g.NX, y = (i / g.NX) | 0, cx = x + 0.5, cy = y + 0.5;
    if (g.arena.depth(cx, cy) <= COAST_FILL.nearCoast || insidePath(walked, cx, cy) || distToLine(walked, cx, cy) <= GRAZE_GIVE_BACK) continue;
    let ours = false;
    for (let dy = -1; dy <= 1 && !ours; dy++) for (let dx = -1; dx <= 1 && !ours; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < g.NX && ny < g.NY && g.owner[ny * g.NX + nx] === p.id && !before.has(ny * g.NX + nx)) ours = true;
    }
    if (ours) continue;
    let links = 0;                                       // a cell with two of our cells at its sides joins them: handing it back would cut a thin strip into separate beads
    if (x > 0 && g.owner[i - 1] === p.id) links++;
    if (x < g.NX - 1 && g.owner[i + 1] === p.id) links++;
    if (y > 0 && g.owner[i - g.NX] === p.id) links++;
    if (y < g.NY - 1 && g.owner[i + g.NX] === p.id) links++;
    if (links >= 2) continue;
    g.owner[i] = prev; back.add(i);
    if (prev) bump(g, prev);
  }
  if (!back.size) return;
  bump(g, p.id); g.countsDirty = true;
  for (let k = claimed.length - 1; k >= 0; k--) if (back.has(claimed[k])) claimed.splice(k, 1);
}

export function capture(g: Ctx, p: Player) {
  const loop = p.trail, walked = p.path.slice();
  const before = new Map<number, number>();                                // what each line cell was before we took it, so a cell the line only grazes can be given back
  for (const i of loop) { before.set(i, g.owner[i]); g.owner[i] = p.id; g.trail[i] &= ~(1 << p.id); }
  p.trail = []; p.path = [];
  bump(g, p.id);

  const gen = ++g.labelGen;
  const { land, owner, labelBuf } = g;
  const regions: number[][] = [];
  const stack: number[] = [];
  const open = (k: number) => land[k] === 1 && owner[k] !== p.id && labelBuf[k] !== gen;
  const grow = (start: number) => {
    const cells: number[] = [];
    labelBuf[start] = gen; stack.push(start);
    while (stack.length) {
      const c = stack.pop()!, x = c % g.NX, y = (c / g.NX) | 0;
      cells.push(c);
      if (x > 0 && open(c - 1)) { labelBuf[c - 1] = gen; stack.push(c - 1); }
      if (x < g.NX - 1 && open(c + 1)) { labelBuf[c + 1] = gen; stack.push(c + 1); }
      if (y > 0 && open(c - g.NX)) { labelBuf[c - g.NX] = gen; stack.push(c - g.NX); }
      if (y < g.NY - 1 && open(c + g.NX)) { labelBuf[c + g.NX] = gen; stack.push(c + g.NX); }
    }
    regions.push(cells);
  };
  for (const i of loop) {
    const x = i % g.NX, y = (i / g.NX) | 0;
    if (x > 0 && open(i - 1)) grow(i - 1);
    if (x < g.NX - 1 && open(i + 1)) grow(i + 1);
    if (y > 0 && open(i - g.NX)) grow(i - g.NX);
    if (y < g.NY - 1 && open(i + g.NX)) grow(i + g.NX);
  }
  const claimed: number[] = loop.slice();
  const taken = new Map<number, number>();               // how much land each victim lost
  const takenFrom = new Map<number, number[]>();          // and which cells, for the renderer's colour blend
  if (regions.length) {
    const enclosed = (cells: number[]) => {                // vote with a few cells so one cell on the wrong side of the line can't flip a region
      const n = Math.min(SAMPLES_PER_REGION, cells.length);
      let yes = 0;
      for (let k = 0; k < n; k++) {
        const c = cells[Math.floor(((k + 0.5) * cells.length) / n)];
        if (insidePath(walked, (c % g.NX) + 0.5, ((c / g.NX) | 0) + 0.5)) yes++;
      }
      return yes * 2 > n;
    };
    let take = walked.length >= 6 ? regions.map((cells, k) => (enclosed(cells) ? k : -1)).filter(k => k >= 0) : [];
    if (!take.length && regions.length >= 2) {            // a degenerate path: fall back to "everything but the largest region"
      let big = 0;
      for (let k = 1; k < regions.length; k++) if (regions[k].length > regions[big].length) big = k;
      take = regions.map((_, k) => k).filter(k => k !== big);
    }
    for (const k of take) {
      for (const c of regions[k]) { if (owner[c]) { bump(g, owner[c]); taken.set(owner[c], (taken.get(owner[c]) ?? 0) + 1); (takenFrom.get(owner[c]) ?? takenFrom.set(owner[c], []).get(owner[c])!).push(c); } owner[c] = p.id; claimed.push(c); }
    }
  }
  giveBackGrazed(g, p, walked, before, claimed);
  fillPockets(g, p, claimed, taken, takenFrom);
  fillCoastGap(g, p, loop, claimed, taken, takenFrom);
  if (p.id === 1) claimRim(g, p, claimed, walked);
  p.inOwner = p.id;
  g.events.onCapture?.(p, claimed, takenFrom);
  for (const [id, n] of taken) g.events.onLandLost?.(g.players[id - 1], p, n);
}

/**
 * A loop all the way round the edge wins (see RIM_WIN): either only the thin strip beside the coast is left, or everybody
 * else is inside the loop. Whatever is left then goes to the player, and owning everything ends the round as a win.
 */
function claimRim(g: Ctx, p: Player, claimed: number[], walked: number[]) {
  let mine = 0;
  for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === p.id) mine++;
  if (mine < g.landCount * RIM_WIN.minShare) return;
  const others = g.players.filter(o => o !== p && o.alive);
  const encircled = walked.length >= 6 && others.length > 0 && others.every(o => insidePath(walked, o.x, o.y));      // with nobody else in the game there is nobody to have encircled
  const rest: number[] = [];
  for (let i = 0; i < g.owner.length; i++) {
    if (!g.land[i] || g.owner[i] === p.id) continue;
    if (!encircled && g.arena.depth((i % g.NX) + 0.5, ((i / g.NX) | 0) + 0.5) > RIM_WIN.bandCells) return;   // something deeper inland is not yours: the edge is not complete
    rest.push(i);
  }
  const lost = new Set<number>();
  for (const i of rest) { if (g.owner[i]) lost.add(g.owner[i]); g.owner[i] = p.id; claimed.push(i); }
  for (const id of lost) bump(g, id);
  if (rest.length) { bump(g, p.id); g.countsDirty = true; }
}

/**
 * Claim the thin coastal gap beside a line that hugged the coast (see COAST_FILL): land next to a trail cell that is also
 * very close to the water. Interior loops never reach here (their trail cells are far from the coast), so this costs nothing there.
 */
function fillCoastGap(g: Ctx, p: Player, loop: number[], claimed: number[], taken: Map<number, number>, takenFrom: Map<number, number[]>) {
  const seen = new Set<number>();
  for (const i of loop) {
    const x = i % g.NX, y = (i / g.NX) | 0;
    if (g.arena.depth(x + 0.5, y + 0.5) > COAST_FILL.nearCoast) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= g.NX || cy >= g.NY) continue;
      const j = cy * g.NX + cx;
      if (seen.has(j) || !g.land[j] || g.owner[j] === p.id) continue;
      seen.add(j);
      if (g.arena.depth(cx + 0.5, cy + 0.5) > COAST_FILL.fillDepth) continue;
      const from = g.owner[j];
      if (from) { bump(g, from); taken.set(from, (taken.get(from) ?? 0) + 1); (takenFrom.get(from) ?? takenFrom.set(from, []).get(from)!).push(j); }
      g.owner[j] = p.id; claimed.push(j);
    }
  }
}

/**
 * Seal the air gaps: a small patch of land that is walled in by our territory (and the sea) on every side is part of the
 * shape we just coloured, so claim it. The enclosed-region vote and the graze give-back can both leave such slivers behind.
 * Only small patches qualify, so the big unclaimed remainder of the map is never swallowed.
 */
const POCKET_MAX_CELLS = 40;
function fillPockets(g: Ctx, p: Player, claimed: number[], taken: Map<number, number>, takenFrom: Map<number, number[]>) {
  const { land, owner } = g;
  const seen = new Set<number>();
  const seeds = new Set<number>();
  for (const c of claimed) {
    const x = c % g.NX, y = (c / g.NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.NX || ny >= g.NY) continue;
      const j = ny * g.NX + nx;
      if (land[j] && owner[j] !== p.id) seeds.add(j);
    }
  }
  for (const s of seeds) {
    if (seen.has(s)) continue;
    const cells: number[] = [], stack = [s];
    seen.add(s);
    let escaped = false;
    while (stack.length) {
      const c = stack.pop()!, x = c % g.NX, y = (c / g.NX) | 0;
      cells.push(c);
      if (cells.length > POCKET_MAX_CELLS) { escaped = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.NX || ny >= g.NY) continue;
        const j = ny * g.NX + nx;
        if (!land[j] || owner[j] === p.id || seen.has(j)) continue;
        seen.add(j); stack.push(j);
      }
    }
    if (escaped) { for (const c of stack) seen.add(c); continue; }
    for (const c of cells) {
      const from = owner[c];
      if (from) { bump(g, from); taken.set(from, (taken.get(from) ?? 0) + 1); (takenFrom.get(from) ?? takenFrom.set(from, []).get(from)!).push(c); }
      owner[c] = p.id; claimed.push(c);
    }
    bump(g, p.id); g.countsDirty = true;
  }
}
