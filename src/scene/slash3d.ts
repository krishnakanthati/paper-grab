// The "tag" effect: when somebody is taken out, a spinning ninja star swoops through them in a quick, bright swoosh, a second one
// crosses it (so it reads as an X), a bright streak trails each star, and star-shaped sparkles pop where it hits. From far
// away the star is THROWN: it winds up, spins hard through the air, slowing as it lands and sticks in, quivering. Each star has a dark outline and a glow in the
// thrower's colour so it shows on any floor. No blood or gore: steel, sparkles and a puff. All in world units (cells), flat on the
// ground, so it scales with the camera on every screen; the streak is never thinner than a few real pixels, so it stays visible on a phone.
import { lighten } from '../render/palette.ts';
import { GroundBatch } from './groundBatch.ts';

export const SLASH = {
  planeMs: 340,                // one plane crosses the victim in this long
  fadeMs: 190,                 // then its streak fades over this long
  secondDelayMs: 140,           // the second plane follows this much later
  reachCells: 1.7,             // each swoop is this long (centre to each end)
  minStarPx: 42,              // ...and never smaller than this many screen pixels across, whatever the zoom
  planeCells: 1.15,            // diameter of the star itself (big enough to read at a glance, even on a phone)
  streakCells: 0.3,            // the streak's widest part
  minStreakPx: 3.5,            // ...but never thinner than this on screen
  swingRad: 0.5,               // the plane banks this much as it sweeps, so it does not look like a sliding sticker
  crossRad: 1.15,              // angle between the two swipes
  throwMinCells: 2.4,          // an attacker farther than this from its victim THROWS the plane instead of slashing
  throwMsPerCell: 40, throwMinMs: 300, throwMaxMs: 480,    // flight time grows with distance, within limits
  throwSpins: 7,               // turns the plane makes on the way: it spins fast off the hand and has straightened out, nose first, by the time it lands
  throwArcCells: 0.1,          // the flight bows a little (this share of the distance, at most `throwMaxArc`)
  throwMaxArc: 1.4,
  windupMs: 260,               // the thrower draws the plane back before letting go
  windupCells: 0.5,            // ...this far
  throwGrow: 0.4,              // the plane looks bigger at the top of its flight (it rises towards the camera), by this share
  trailSteps: 9,               // the trail is a curved, tapering ribbon of this many pieces
  trailLen: 0.5,               // ...as long as this share of the flight
  ringMs: 260, ringCells: 1.9, // the shockwave ring where it lands
  stickMs: 620,                // it stays in the victim, quivering, then fades
  handMs: 200,                 // after letting go, the open hand flicks forward and stays visible this long, fading
  maxLive: 8,                  // at most this many at once (a busy fight must not slow the frame)
  colors: { paper: 0xffffff, edge: 0xffffff, shade: 0xc6dcf2, fold: 0x8fb4de, steel: 0xf6faff, steelShade: 0xa9bad0, outline: 0x1b2233, handle: 0x5a3b2a, skin: 0xf3c8a1, skinShade: 0xd29a72 },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** Where a swipe has got to: 0 at its start, 1 at its end (it speeds up, then settles). Pure, for tests. */
export const planeProgress = (ageMs: number, delayMs = 0) => easeOutCubic((ageMs - delayMs) / SLASH.planeMs);

interface Swipe { x: number; y: number; angle: number; delay: number; scale: number; accent: number; hit: boolean; swing: number }
interface Live { swipes: Swipe[]; age: number }

/** Flight time of a thrown plane for a throw of `cells`: quick, a little longer for longer throws. Pure, for tests. */
export const throwDuration = (cells: number) => Math.max(SLASH.throwMinMs, Math.min(SLASH.throwMaxMs, cells * SLASH.throwMsPerCell));
/** Is this attacker far enough away that the plane is thrown rather than swung? */
export const isThrow = (cells: number) => cells > SLASH.throwMinCells;

interface Throw { x0: number; y0: number; x1: number; y1: number; age: number; flyMs: number; scale: number; accent: number; hit: boolean; launched: boolean; dramatic: boolean; thrower: number; armOut: boolean; hx?: number; hy?: number; route?: { pts: number[]; cum: number[] }; onLand?: () => void }

/** A point `k` (0..1) of the way along a polyline's length, for a throw that follows a line. Pure, for tests. */
const routeOf = (pts: number[]) => { const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])); return { pts, cum }; };

export function pointAlong(pts: number[], cum: number[], k: number): readonly [number, number] {
  const total = cum[cum.length - 1], d = clamp01(k) * total;
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const span = cum[i] - cum[i - 1], u = span > 0 ? (d - cum[i - 1]) / span : 0;
  return [pts[(i - 1) * 2] + (pts[i * 2] - pts[(i - 1) * 2]) * u, pts[(i - 1) * 2 + 1] + (pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]) * u];
}

/** Where a thrown plane is along its flight: 0 at the hand, 1 at the victim (it leaves fast and eases a little towards the target). Pure, for tests. */
export const throwProgress = (u: number) => 1 - Math.pow(1 - clamp01(u), 1.5);

/** The thrower's own 3D arm (part of its character): the slash effect tells it how far along the throw is, and where its hand is comes back so the star is held in it. */
export interface ThrowArm {
  set(id: number, dx: number, dy: number, wind: number, rel: number): void;
  clear(id: number): void;
  hand(id: number): readonly [number, number] | null;
}

export function createSlash3D(onHit?: (x: number, y: number, scale: number) => void, onLaunch?: (x: number, y: number, scale: number) => void, arm?: ThrowArm) {
  const gfx = new GroundBatch(0.9, 13);                                    // flies at body height, not on the floor...
  (gfx.mesh.material as { depthTest: boolean }).depthTest = false;         // ...and is never hidden behind a character or the land
  const live: Live[] = [];
  const throws: Throw[] = [];
  const total = () => SLASH.secondDelayMs + SLASH.planeMs + SLASH.fadeMs;

  /** A ninja star (shuriken): four swept blades round a centre hole, a dark outline and a soft glow in the thrower's colour so it shows on any floor, two-tone steel. `size` is its diameter; `ang` is how far round it has turned. */
  const planeShape = (g: GroundBatch, x: number, y: number, ang: number, size: number, alpha: number, accent = 0xef4b4b) => {
    const K = SLASH.colors, R = size * 0.5;
    const at = (a: number, r: number) => [x + Math.cos(ang + a) * r * R, y + Math.sin(ang + a) * r * R] as const;
    const tips = [0, 1, 2, 3].map(i => at(i * Math.PI / 2, 1));
    const inner = [0, 1, 2, 3].map(i => at(i * Math.PI / 2 + 1.08, 0.36));       // each blade's long leading edge sweeps round to here: a pinwheel, not a plus sign
    const ring: number[] = [];
    for (let i = 0; i < 4; i++) ring.push(tips[i][0], tips[i][1], inner[i][0], inner[i][1]);
    g.circle(x, y, R * 1.3, accent, alpha * 0.2, 20);                                  // a soft halo so it never disappears into the floor
    g.polyline([...ring, ring[0], ring[1]], Math.max(0.07 * size, 0.05), K.outline, alpha);   // the dark outline
    for (let i = 0; i < 4; i++) {
      const prev = inner[(i + 3) % 4];
      g.tri(x, y, tips[i][0], tips[i][1], inner[i][0], inner[i][1], K.steel, alpha);        // the lit side of each blade
      g.tri(x, y, prev[0], prev[1], tips[i][0], tips[i][1], K.steelShade, alpha);           // and the shaded side
      g.line(x, y, tips[i][0], tips[i][1], 0.03 * size, 0xffffff, alpha * 0.9, false);      // the bright ridge down each blade
    }
    g.circle(x, y, R * 0.24, K.outline, alpha, 14);                                     // the centre hole, rimmed in the thrower's colour
    g.circle(x, y, R * 0.15, accent, alpha, 12);
  };

  return {
    gfx,
    count: () => live.length + throws.length,
    clear() { if (arm) for (const T of throws) if (T.thrower) arm.clear(T.thrower); live.length = 0; throws.length = 0; },
    /**
     * A plane kill at (x, y). `heading` is the way the killer was moving (the first swipe cuts across it), `strong` makes the full
     * crossed pair, otherwise it is a single, smaller swipe (for fights you are only watching).
     */
    add(x: number, y: number, heading: number, accent: number, strong: boolean) {
      if (live.length + throws.length >= SLASH.maxLive) { if (live.length) live.shift(); else throws.shift(); }      // swings and throws share the cap
      const base = heading + Math.PI / 2 + (Math.random() - 0.5) * 0.5, scale = strong ? 1 : 0.7;
      const swipes: Swipe[] = [{ x, y, angle: base - SLASH.crossRad / 2, delay: 0, scale, accent, hit: false, swing: 1 }];
      if (strong) swipes.push({ x, y, angle: base + SLASH.crossRad / 2 + Math.PI, delay: SLASH.secondDelayMs, scale, accent, hit: false, swing: -1 });
      live.push({ swipes, age: 0 });
    },
    /** A plane thrown from the attacker at (x0, y0) to the victim at (x1, y1): it spins through the air, then sticks in. */
    addThrow(x0: number, y0: number, x1: number, y1: number, accent: number, strong: boolean, opts: { flyMs?: number; windup?: boolean; dramatic?: boolean; thrower?: number; route?: number[]; onLand?: () => void } = {}) {
      if (live.length + throws.length >= SLASH.maxLive) { if (throws.length) throws.shift(); else live.shift(); }
      const flyMs = opts.flyMs ?? throwDuration(Math.hypot(x1 - x0, y1 - y0));
      throws.push({ x0, y0, x1, y1, age: opts.windup === false ? SLASH.windupMs : 0, flyMs, scale: strong ? 1 : 0.7, accent, hit: false, launched: false, dramatic: !!opts.dramatic, thrower: opts.thrower ?? 0, armOut: false, route: opts.route && opts.route.length >= 4 ? routeOf(opts.route) : undefined, onLand: opts.onLand });
    },
    update(dtMs: number, pxPerCell: number) {
      gfx.begin();
      if (!live.length && !throws.length) { gfx.end(); return; }
      const minWt = SLASH.minStreakPx / Math.max(1, pxPerCell);
      const starSize = (scale: number) => Math.max(SLASH.planeCells * scale, SLASH.minStarPx * scale / Math.max(1, pxPerCell));
      for (let i = throws.length - 1; i >= 0; i--) {
        const T = throws[i];
        T.age += dtMs;
        const W = SLASH.windupMs, fly = T.age - W;
        if (fly >= T.flyMs + SLASH.stickMs) { if (T.thrower && T.armOut) arm?.clear(T.thrower); throws.splice(i, 1); continue; }
        const dx = T.x1 - T.x0, dy = T.y1 - T.y0, dist = Math.hypot(dx, dy) || 1e-6, ang = Math.atan2(dy, dx), nx = -Math.sin(ang), ny = Math.cos(ang);
        const size = Math.max(SLASH.planeCells * T.scale * 0.9, SLASH.minStarPx / Math.max(1, pxPerCell));
        if (fly < 0) {                                              // winding up: the star is drawn back, spinning up and growing, and let go
          const w = T.age / W, D = T.dramatic, back = SLASH.windupCells * T.scale * (D ? 2.4 : 1) * Math.sin(w * Math.PI / 2);
          let sx = T.x0 - Math.cos(ang) * back, sy = T.y0 - Math.sin(ang) * back;
          if (arm && T.thrower) {                                   // the star is held in the character's own hand, wherever its arm has drawn it
            arm.set(T.thrower, Math.cos(ang), Math.sin(ang), w, 0); T.armOut = true;
            const h = arm.hand(T.thrower); if (h) { sx = h[0]; sy = h[1]; T.hx = sx; T.hy = sy; }
          }
          if (D) {                                                  // the replay: a taut aim line to the victim and a charging glow, so it is unmistakable who is about to throw
            gfx.line(T.x0, T.y0, T.x1, T.y1, Math.max(minWt * 0.7, 0.07), T.accent, 0.15 + 0.4 * w, false);
            gfx.circle(sx, sy, size * (0.5 + 1.1 * w), SLASH.colors.edge, 0.18 + 0.3 * w, 20);
            gfx.ring(sx, sy, size * (2.2 - 1.5 * w), Math.max(minWt, 0.1), T.accent, 0.8 * w);      // a ring that CONVERGES on the star as it charges
          }
          const bigger = size * (1 + (D ? 0.6 : 0.25) * w);
          planeShape(gfx, sx, sy, ang + (D ? w * w * Math.PI * 6 : 0), bigger, 1, T.accent);
          continue;
        }
        if (!T.launched) { T.launched = true; if (T.hx !== undefined && T.hy !== undefined) { T.x0 = T.hx; T.y0 = T.hy; } onLaunch?.(T.x0, T.y0, T.scale); }      // it leaves the hand, not the middle of the body
        const u = clamp01(fly / T.flyMs), arc = Math.min(SLASH.throwMaxArc, dist * SLASH.throwArcCells);
        const k = throwProgress(u), flying = u < 1, after = Math.max(0, fly - T.flyMs);
        const at = (kk: number) => { if (T.route) return pointAlong(T.route.pts, T.route.cum, kk); const bow = arc * Math.sin(Math.PI * kk); return [T.x0 + dx * kk + nx * bow, T.y0 + dy * kk + ny * bow] as const; };   // the path bows around the straight line
        if (u >= 1 && !T.hit) { T.hit = true; onHit?.(T.x1, T.y1, T.scale); T.onLand?.(); }
        const [px, py] = at(k);
        const fade = flying ? 1 : 1 - clamp01((after - SLASH.stickMs * 0.55) / (SLASH.stickMs * 0.45));
        if (flying && u > 0.03) {                                   // the trail: a curved ribbon that tapers to nothing behind the plane
          const from = Math.max(0, k - SLASH.trailLen * Math.min(1, u * 4)), n = SLASH.trailSteps;
          let [ax, ay] = at(from);
          for (let s2 = 1; s2 <= n; s2++) {
            const kk = from + (k - from) * (s2 / n), [bx, by] = at(kk), taper = s2 / n;
            gfx.line(ax, ay, bx, by, Math.max(minWt * 1.4 * taper, 0.34 * T.scale * taper), T.accent, 0.5 * taper, true);
            gfx.line(ax, ay, bx, by, Math.max(minWt * 0.6 * taper, 0.12 * T.scale * taper), SLASH.colors.edge, 1 * taper, true);
            ax = bx; ay = by;
          }
        }
        if (arm && T.thrower && T.armOut) {                         // the hand flicks forward after letting go, then the arm is put away
          if (fly < SLASH.handMs) arm.set(T.thrower, Math.cos(ang), Math.sin(ang), 1, Math.max(0.001, fly / SLASH.handMs));
          else { arm.clear(T.thrower); T.armOut = false; }
        }
        const turn = flying ? ang + SLASH.throwSpins * Math.PI * 2 * (1 - k) : ang + 0.5 * Math.sin(after * 0.05) * (1 - clamp01(after / SLASH.stickMs));   // spinning in the air, nose first on landing, then quivering where it stuck
        const rise = 1 + SLASH.throwGrow * (flying ? Math.sin(Math.PI * k) : 0);
        planeShape(gfx, px, py, turn, size * rise, fade, T.accent);
        if (T.dramatic && after > 0 && after < SLASH.ringMs * 1.6) {  // the impact: a white flash and lines bursting out of the hit
          const r = after / (SLASH.ringMs * 1.6), e = easeOutCubic(r);
          gfx.circle(T.x1, T.y1, (0.6 + 1.3 * e) * T.scale, SLASH.colors.edge, 0.7 * (1 - r) * (1 - r), 20);
          for (let i = 0; i < 12; i++) {
            const a = ang + (i / 12) * Math.PI * 2, r0 = (0.5 + 0.6 * e) * T.scale, r1 = (0.9 + 3.2 * e) * T.scale;
            gfx.line(T.x1 + Math.cos(a) * r0, T.y1 + Math.sin(a) * r0, T.x1 + Math.cos(a) * r1, T.y1 + Math.sin(a) * r1, Math.max(minWt * 0.8, 0.12 * (1 - r)), i % 2 ? T.accent : SLASH.colors.edge, 0.95 * (1 - r), true);
          }
        }
        if (after > 0 && after < SLASH.ringMs) {                    // a shockwave ring spreads from where it struck
          const r = after / SLASH.ringMs, e = easeOutCubic(r);
          gfx.ring(T.x1, T.y1, SLASH.ringCells * T.scale * e, Math.max(minWt, 0.14 * (1 - r)), SLASH.colors.edge, 0.85 * (1 - r));
        }
      }
      if (!live.length) { gfx.end(); return; }
      const minW = SLASH.minStreakPx / Math.max(1, pxPerCell);
      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i];
        L.age += dtMs;
        if (L.age >= total()) { live.splice(i, 1); continue; }
        for (const s of L.swipes) {
          const u = planeProgress(L.age, s.delay);
          if (L.age < s.delay) continue;
          const reach = SLASH.reachCells * s.scale, dx = Math.cos(s.angle), dy = Math.sin(s.angle);
          const pos = (k: number) => [s.x + dx * reach * (2 * k - 1), s.y + dy * reach * (2 * k - 1)] as const;   // k 0..1 along the swipe
          if (!s.hit && u >= 0.5) { s.hit = true; onHit?.(s.x, s.y, s.scale); }
          const fade = 1 - clamp01((L.age - s.delay - SLASH.planeMs) / SLASH.fadeMs);
          const [hx, hy] = pos(u), [sx, sy] = pos(0);
          const w = Math.max(minW, SLASH.streakCells * s.scale);
          // the streak: wide and faint underneath, then a bright thin core: it reads as a flash of speed
          for (const [k, col, a] of [[1, lighten(s.accent, 0.45), 0.32], [0.62, SLASH.colors.shade, 0.7], [0.26, SLASH.colors.edge, 1]] as const) {
            gfx.line(sx, sy, hx, hy, Math.max(minW * k, w * k), col, a * fade, true);
          }
          if (u < 1) planeShape(gfx, hx, hy, s.angle + L.age * 0.035, starSize(s.scale), 1, s.accent);       // the star itself, until it has crossed
          else if (fade > 0) planeShape(gfx, hx, hy, s.angle + L.age * 0.035, starSize(s.scale), fade, s.accent);
        }
      }
      gfx.end();
    },
  };
}
export type Slash3D = ReturnType<typeof createSlash3D>;
