// The animation of a 3D character, as pure maths: where it stands, how it bobs while running, how it leans into a
// turn, how it pops in when it spawns, and when it blinks. No Three.js and no GPU in here, so it is unit-testable.
import type { Player } from '../game/index.ts';
import { clamp, lerpAngle, smoothK, wrapPi } from '../anim/interp.ts';
import { CHARACTER } from './tuning.ts';

export { clamp, lerpAngle, smoothK, wrapPi };

export interface Pose {
  x: number; y: number;          // position in cells (already interpolated between logic ticks)
  heading: number;               // radians, same convention as the game (y down)
  bob: number;                   // lift above the ground in cells (running bounce)
  lean: number;                  // roll into a turn, radians
  squash: number;                // 1 = neutral; < 1 squashed, > 1 stretched along the vertical axis
  scale: number;                 // overall scale: 0 -> 1 with a little overshoot when spawning
  stepL: number; stepR: number;  // the two feet's forward swing in cells
  blink: number;                 // eye height multiplier: 1 open, ~0.1 closed
}

export interface PoseState {
  phase: number;                 // running-cycle phase (radians), advanced by distance travelled
  bornAt: number;                // when this life started (ms), or -1 while not alive
  nextBlink: number;             // when the next blink starts (ms)
  turn: number;                  // smoothed turn rate (radians per second)
  wobble: number;                // seed so characters don't blink in sync
  sq: number; sqv: number;       // sprung squash and its velocity: follows the gait's target with a little overshoot
  hd: number;                    // the heading actually drawn: it eases towards the game's heading instead of stepping with each logic tick
  move: number;                  // eased 0..1.6 running amount, so starting, stopping and the coast's double speed never snap the gait
  lean: number; leanv: number;   // sprung roll into turns
  ex: number; sc: number; de: number;   // eased 0..1 strengths of excited / scared / determined
  pop: number; popv: number;     // an elastic pop in size when it captures or spawns: a spring around 0
  excitedUntil: number;          // the clock (ms) until which a win keeps it excited
  lastCount: number; lastCaptives: number;   // what it owned / held last frame, to notice a capture
  stepSide: number;              // which side of a footfall the running cycle is on (-1/1), to catch the landing
}

export const newPoseState = (seed: number): PoseState => ({ phase: seed * 1.7, bornAt: -1, nextBlink: 0, turn: 0, wobble: seed, sq: 1, sqv: 0, hd: NaN, move: 0, lean: 0, leanv: 0, ex: 0, sc: 0, de: 0, pop: 0, popv: 0, excitedUntil: 0, lastCount: -1, lastCaptives: -1, stepSide: 0 });

const HEADING_MS = 55;                     // how quickly the drawn heading catches the real one: fast enough to feel direct, slow enough to hide the 30 Hz steps
const MOVE_MS = 90;
const LEAN_SPRING = { stiffness: 190, damping: 17 };
const spring = (x: number, v: number, target: number, stiffness: number, damping: number, dtMs: number): [number, number] => {
  const n = Math.max(1, Math.ceil(dtMs / 6)), h = dtMs / 1000 / n;      // small fixed steps so a long frame can't blow a spring up
  for (let i = 0; i < n; i++) { v += (-stiffness * (x - target) - damping * v) * h; x += v * h; }
  return [x, v];
};
const SQUASH_SPRING = { stiffness: 300, damping: 20, landKick: 0.6 };   // lightly underdamped: one soft rebound after each footfall

export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/**
 * Pose a player for this frame. `f` is how far through the current logic tick we are (0..1), `tickSeconds` the logic
 * tick length, `dtMs` the frame time, `nowMs` the clock. Mutates `st` (the running cycle, blink timer, ...).
 */
export function poseFor(p: Player, f: number, tickSeconds: number, dtMs: number, nowMs: number, st: PoseState): Pose {
  if (st.bornAt < 0) { st.bornAt = nowMs; st.nextBlink = nowMs + 1500 + (st.wobble * 977) % 2500; }
  const x = p.px + (p.x - p.px) * f, y = p.py + (p.y - p.py) * f;
  const headingNow = lerpAngle(p.pa, p.angle, f);
  if (Number.isNaN(st.hd)) st.hd = headingNow;
  st.hd = wrapPi(st.hd + wrapPi(headingNow - st.hd) * smoothK(dtMs, HEADING_MS));
  const heading = st.hd;

  const speed = Math.hypot(p.x - p.px, p.y - p.py) / tickSeconds;                 // cells per second
  st.move += (clamp(speed / CHARACTER.runSpeedRef, 0, 1.6) - st.move) * smoothK(dtMs, MOVE_MS);
  const moving = st.move;
  st.phase += (dtMs / 1000) * CHARACTER.gait * moving;

  const turnNow = wrapPi(p.angle - p.pa) / tickSeconds;                           // radians per second
  st.turn += (turnNow - st.turn) * smoothK(dtMs, CHARACTER.turnSmoothMs);
  [st.lean, st.leanv] = spring(st.lean, st.leanv, clamp(-st.turn * CHARACTER.leanPerTurn, -CHARACTER.maxLean, CHARACTER.maxLean), LEAN_SPRING.stiffness, LEAN_SPRING.damping, dtMs);
  const lean = clamp(st.lean, -CHARACTER.maxLean, CHARACTER.maxLean);

  const bounce = Math.abs(Math.sin(st.phase));
  const bob = bounce * CHARACTER.bobHeight * Math.min(1, moving);
  const squashTarget = 1 + (0.5 - bounce) * CHARACTER.squashAmount * Math.min(1, moving);   // stretches in the air, squashes on landing
  const side = Math.sin(st.phase) >= 0 ? 1 : -1;
  if (st.stepSide !== 0 && side !== st.stepSide) st.sqv -= SQUASH_SPRING.landKick * Math.min(1, moving);   // a footfall: a quick press that the spring rebounds from
  st.stepSide = side;
  [st.sq, st.sqv] = spring(st.sq, st.sqv, squashTarget, SQUASH_SPRING.stiffness, SQUASH_SPRING.damping, dtMs);
  const squash = st.sq;

  const age = nowMs - st.bornAt;
  const scale = age < CHARACTER.popMs ? easeOutBack(age / CHARACTER.popMs) : 1;

  let blink = 1;
  if (nowMs >= st.nextBlink) {
    const k = (nowMs - st.nextBlink) / CHARACTER.blinkMs;
    if (k >= 1) st.nextBlink = nowMs + 2200 + ((nowMs * 0.37 + st.wobble * 131) % 2600);
    else blink = 1 - Math.sin(k * Math.PI) * 0.9;
  }

  const swing = Math.sin(st.phase) * CHARACTER.stepSwing * Math.min(1, moving);
  return { x, y, heading, bob, lean, squash, scale, stepL: swing, stepR: -swing, blink };
}

/** A player died or was removed: the next life will pop in again. */
export const resetPose = (st: PoseState) => { st.bornAt = -1; };

/** What a character is feeling this frame, and how that reads on its face and body. */
export interface Emotion {
  eyeOpen: number;      // multiplies eye height: narrowed when determined, wide when excited or scared
  eyeWide: number;      // multiplies eye width
  pupil: number;        // multiplies pupil size: big and sparkly when excited, tiny when scared
  shake: number;        // sideways tremble in cells (scared)
  hop: number;          // extra lift in cells (excited, a happy little bounce)
  pop: number;          // size added to its scale, an elastic overshoot after a capture (0 at rest)
}
export interface EmotionInput {
  count: number; captives: number;   // cells owned and captives held right now
  outside: boolean;                  // out on its own open line
  danger: boolean;                   // a rival is close while it is exposed
}
export const EMOTION = { exciteMs: 1500, gainCells: 3, rise: 70, fall: 320, popKick: 9, popSpring: { stiffness: 240, damping: 11 } };

/** Ease the three feelings towards what is happening now (a capture makes it excited, an exposed line near a rival scared, a long line determined). */
export function emotionFor(st: PoseState, inp: EmotionInput, nowMs: number, dtMs: number): Emotion {
  if (st.lastCount >= 0 && (inp.count - st.lastCount >= EMOTION.gainCells || inp.captives > st.lastCaptives)) { st.excitedUntil = nowMs + EMOTION.exciteMs; st.popv += EMOTION.popKick; }       // a capture: pop
  st.lastCount = inp.count; st.lastCaptives = inp.captives;
  const ease = (cur: number, target: number) => cur + (target - cur) * smoothK(dtMs, target > cur ? EMOTION.rise : EMOTION.fall);
  const scared = inp.outside && inp.danger;
  st.ex = ease(st.ex, nowMs < st.excitedUntil ? 1 : 0);
  st.sc = ease(st.sc, scared ? 1 : 0);
  st.de = ease(st.de, inp.outside && !scared ? 1 : 0);
  [st.pop, st.popv] = spring(st.pop, st.popv, 0, EMOTION.popSpring.stiffness, EMOTION.popSpring.damping, dtMs);
  const calm = 1 - st.sc;                                              // fear wins over the other two on the face
  return {
    eyeOpen: clamp(1 - 0.2 * st.de * calm + 0.1 * st.ex * calm + 0.18 * st.sc, 0.7, 1.3),
    eyeWide: 1 + 0.12 * st.ex + 0.22 * st.sc,
    pupil: clamp(1 + 0.2 * st.ex * calm - 0.38 * st.sc + 0.08 * st.de * calm, 0.55, 1.25),
    shake: st.sc * 0.012 * Math.sin(nowMs * 0.07),
    hop: st.ex * 0.07 * Math.abs(Math.sin(nowMs / 95)),
    pop: clamp(st.pop * 0.12, -0.12, 0.25),
  };
}

/** The flip trick (Space or a double tap): a hop with a somersault, squashing to launch and squashing again to land. There are several kinds, so it is never the same twice in a row. */
export const FLIP = { ms: 760, height: 1.05, cooldownMs: 900, crouch: 0.14, land: 0.16 };
export const FLIP_KINDS = ['front', 'back', 'roll', 'spin', 'double', 'corkscrew'] as const;
export type FlipKind = (typeof FLIP_KINDS)[number];
export const flipDurationMs = (kind: FlipKind) => (kind === 'double' ? 1000 : FLIP.ms);
/** A random kind other than the one just done. */
export function pickFlipKind(prev: FlipKind | null, random: () => number = Math.random): FlipKind {
  const pool = FLIP_KINDS.filter(k => k !== prev);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
export interface FlipPose { lift: number; pitch: number; roll: number; yaw: number; squash: number; done: boolean }
const REST: FlipPose = { lift: 0, pitch: 0, roll: 0, yaw: 0, squash: 1, done: false };
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Where a flip of this kind is `t` (0..1) of the way through: height in cells, the three turn angles in radians, and the squash multiplier. */
export function flipAt(t: number, kind: FlipKind = 'front'): FlipPose {
  if (t >= 1) return { ...REST, done: true };
  t = Math.max(0, t);
  const c = FLIP.crouch, l = FLIP.land;
  if (t < c) return { ...REST, squash: 1 - 0.2 * Math.sin((t / c) * Math.PI / 2) };                // wind up: crouch down
  const air = (t - c) / (1 - c - l);                                       // 0..1 across the time in the air
  if (air < 1) {
    const turn = easeInOutCubic(air) * Math.PI * 2, arc = 4 * air * (1 - air) * FLIP.height * (kind === 'double' ? 1.25 : 1);
    const squash = 1 + 0.2 * Math.sin(air * Math.PI) - 0.2 * Math.max(0, 1 - air * 6);
    switch (kind) {
      case 'back': return { ...REST, lift: arc, pitch: -turn, squash };
      case 'roll': return { ...REST, lift: arc, roll: turn, squash };
      case 'spin': return { ...REST, lift: arc, yaw: turn, squash };
      case 'double': return { ...REST, lift: arc, pitch: turn * 2, squash };
      case 'corkscrew': return { ...REST, lift: arc, pitch: turn, yaw: turn, squash };
      default: return { ...REST, lift: arc, pitch: turn, squash };
    }
  }
  const k = (t - (1 - l)) / l;                                             // landing: a squash that springs back
  return { ...REST, squash: 1 - 0.24 * Math.sin(Math.min(1, k) * Math.PI) * (1 - k * 0.4) };
}
