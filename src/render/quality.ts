// Keeping the game smooth on every screen: how sharp to render, how big things are on screen, and when to back off.
//
// - pickResolution: sharpness is capped by a pixel budget, so a 4K or 3x-DPR screen never gets a gigantic canvas.
// - pxPerCell: how many CSS pixels one cell is, from the screen size, clamped so cells are never tiny or huge.
// - AdaptiveQuality: watches real frame times and steps resolution (and effect density) down when frames run long,
//   and back up slowly when there is headroom. Hysteresis and a cooldown stop it flapping.

/** Total device pixels we are willing to push per frame. A modest GPU holds 60 fps comfortably at about this. */
export const PIXEL_BUDGET = 4_200_000;
/**
 * The 3D characters are the sharpest thing on screen, so their canvas is NOT tied to the 2D layer's adaptive resolution. It
 * renders at the screen's own pixel ratio, supersampled to at least `minSupersample` (so even a 1x monitor gets smooth
 * edges), up to `max`, within a generous pixel budget (the layer is mostly transparent, so it is cheap). Only on a struggling
 * device (quality scale under `slowBelow`) does it back off a little.
 */
export const CHARACTER_RATIO = { minSupersample: 1.5, max: 3, pixelBudget: 9_000_000, slowBelow: 0.7, slowFactor: 0.8 };

export function characterRatio(dpr: number, w: number, h: number, qualityScale = 1): number {
  const C = CHARACTER_RATIO;
  const want = Math.min(Math.max(dpr || 1, C.minSupersample), C.max);
  const r = Math.min(want, Math.sqrt(C.pixelBudget / Math.max(1, w * h)));
  return Math.max(1, qualityScale < C.slowBelow ? r * C.slowFactor : r);
}

export const MIN_RESOLUTION = 0.75;
export const MAX_RESOLUTION = 2;

/** Device pixel ratio capped by the pixel budget for a screen of w x h CSS pixels. */
export function pickResolution(dpr: number, w: number, h: number, budget = PIXEL_BUDGET): number {
  const byBudget = Math.sqrt(budget / Math.max(1, w * h));
  return Math.max(MIN_RESOLUTION, Math.min(dpr || 1, MAX_RESOLUTION, byBudget));
}

export const MIN_PX_PER_CELL = 18, MAX_PX_PER_CELL = 84;      // never smaller than 18 px per cell: below that the characters are too small to read

/** CSS pixels per cell: `view` cells fit across the screen's shorter side, clamped to a readable range. */
export function pxPerCell(w: number, h: number, view: number): number {
  return Math.max(MIN_PX_PER_CELL, Math.min(MAX_PX_PER_CELL, Math.min(w, h) / view));
}

export interface QualityChange { scale: number; level: number }

const SCALES = [1, 0.82, 0.66, 0.52];     // multiplier applied to the base resolution at each quality level
const SLOW_MS = 21;                        // sustained frame time above this (about 47 fps) means we are struggling
const FAST_MS = 12.5;                      // sustained below this means there is headroom (about 80 fps)
const DOWN_AFTER_MS = 900;                 // how long "slow" must persist before stepping down
const UP_AFTER_MS = 7000;                  // how long "fast" must persist before stepping back up
const COOLDOWN_MS = 6000;                  // after any change, wait before judging again

/**
 * Where to START: a weak device (little memory, few cores) begins one or two steps down instead of stuttering for the
 * first seconds until the adaptive loop notices. The loop still moves it up if the device turns out to be fast.
 */
export function initialQualityLevel(d: { deviceMemoryGB?: number; cores?: number }): number {
  const mem = d.deviceMemoryGB, cores = d.cores;
  if ((mem !== undefined && mem <= 1) || (cores !== undefined && cores <= 2)) return 2;
  if ((mem !== undefined && mem <= 4) || (cores !== undefined && cores <= 4)) return 1;
  return 0;
}

/**
 * Pacing on fast displays. A 120 or 144 Hz screen asks for twice the frames a phone can keep up with for long: it runs hot and
 * then throttles, which is exactly the "slows down after a while" feeling. So we draw every Nth refresh, picking N so the
 * result is an EVEN rhythm (120 Hz -> 60 fps, never a 3-2-3-2 judder) and close to `capFps`.
 */
export const FRAME_CAP = { touchFps: 72, desktopFps: 120, maxDivisor: 4, measureFrames: 40 };

export function pickFrameDivisor(refreshHz: number, capFps: number): number {
  if (!(refreshHz > 0) || refreshHz <= capFps * 1.25) return 1;
  let best = 1, bestErr = Infinity;
  for (let n = 1; n <= FRAME_CAP.maxDivisor; n++) {
    const err = Math.abs(Math.log(refreshHz / n / capFps));
    if (err < bestErr - 1e-9) { bestErr = err; best = n; }
  }
  return best;
}

/** The display's refresh rate from a run of frame times (ms): the median, so a hitch or two cannot skew it. */
export function refreshFromFrames(frameMs: number[]): number {
  const s = frameMs.filter(v => v > 2 && v < 60).sort((a, b) => a - b);
  return s.length ? 1000 / s[Math.floor(s.length / 2)] : 0;
}

/** Hardware anti-aliasing costs a lot of fill rate and does little at 2x pixel density and up: only use it below that. */
export const wantsMsaa = (pixelRatio: number) => pixelRatio < 2;

export class AdaptiveQuality {
  level = 0;
  constructor(startLevel = 0) { this.level = Math.max(0, Math.min(SCALES.length - 1, Math.floor(startLevel))); }
  private ema = 16;
  private slowFor = 0;
  private fastFor = 0;
  private cooldown = 0;

  get scale() { return SCALES[this.level]; }
  /** 0 = everything, 1 = fewer particles, 2+ = minimal effects. */
  get effects() { return this.level >= 2 ? 2 : this.level >= 1 ? 1 : 0; }

  /** Feed one frame's duration; returns the new settings when the level changed, else null. */
  frame(ms: number): QualityChange | null {
    ms = Math.min(ms, 250);                                   // a single hitch (tab switch, GC) must not count as a trend
    this.ema += (ms - this.ema) * 0.08;
    if (this.cooldown > 0) { this.cooldown -= ms; return null; }
    if (this.ema > SLOW_MS) { this.slowFor += ms; this.fastFor = 0; }
    else if (this.ema < FAST_MS) { this.fastFor += ms; this.slowFor = 0; }
    else { this.slowFor = Math.max(0, this.slowFor - ms); this.fastFor = Math.max(0, this.fastFor - ms); }

    if (this.slowFor > DOWN_AFTER_MS && this.level < SCALES.length - 1) return this.move(+1);
    if (this.fastFor > UP_AFTER_MS && this.level > 0) return this.move(-1);
    return null;
  }

  private move(dir: number): QualityChange {
    this.level += dir;
    this.slowFor = this.fastFor = 0;
    this.cooldown = COOLDOWN_MS;
    this.ema = dir > 0 ? SLOW_MS - 2 : 16;                    // judge the new level from a neutral start
    return { scale: this.scale, level: this.level };
  }
}
