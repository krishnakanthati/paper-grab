// The frame loop: fixed-rate logic, rendering at the display's own refresh rate with interpolation between ticks. It runs on the browser's
// own requestAnimationFrame (the renderer has no clock of its own): a time accumulator turns real elapsed time into whole 30 Hz ticks, and the
// leftover, as a share of a tick (`alpha`), tells the renderer how far between the last two ticks to draw everything.
// It also keeps the game smooth on every device: it watches real frame times and steps the render resolution down when
// frames run long (and back up when there is headroom), and it re-fits the resolution whenever the screen changes.
import { IDLE_RENDER_MS, TICK_MS } from './config.ts';
import type { Game } from './game/index.ts';
import { signalReady } from './platform/youtube.ts';
import type { Renderer } from './scene/sceneRenderer.ts';
import { tickAlpha } from './anim/interp.ts';
import { AdaptiveQuality, FRAME_CAP, initialQualityLevel, pickFrameDivisor, pickResolution, refreshFromFrames } from './render/quality.ts';

export interface LoopHooks {
  game(): Game;
  renderer(): Renderer;
  isPaused(): boolean;
  everyFewTicks(): void;                       // HUD + minimap refresh, a few times a second
  applyResolution(ratio: number, qualityScale: number): void;   // set the renderer's pixel ratio and fit it to the window
}

/** Ticks between HUD refreshes. */
const HUD_EVERY_TICKS = 5;
/** Should a frame that is not live (nothing moving) be drawn now? Yes when the screen changed, or the idle interval is up. */
export const idleFrameDue = (sinceLastDrawMs: number, screenChanged: boolean, everyMs = IDLE_RENDER_MS) => screenChanged || sinceLastDrawMs >= everyMs;

/** A frame longer than this is clamped, so a background tab or a hitch can't fast-forward the game. */
const MAX_FRAME_MS = 200;

export function startLoop(hooks: LoopHooks) {
  let acc = 0, tickNo = 0, firstFrame = true, sinceDraw = 0, changed = true, lastGame: Game | null = null;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const quality = new AdaptiveQuality(initialQualityLevel({ deviceMemoryGB: nav.deviceMemory, cores: nav.hardwareConcurrency }));
  let base = pickResolution(window.devicePixelRatio || 1, window.innerWidth, window.innerHeight);
  const apply = () => { const r = Math.max(0.5, base * quality.scale); hooks.applyResolution(r, quality.scale); hooks.renderer().setQuality?.(quality.effects); };
  window.addEventListener('resize', () => { changed = true; base = pickResolution(window.devicePixelRatio || 1, window.innerWidth, window.innerHeight); apply(); });
  apply();

  // draw every Nth display refresh on very fast screens (see pickFrameDivisor); measured from the first frames, then fixed
  const capFps = matchMedia('(pointer: coarse)').matches ? FRAME_CAP.touchFps : FRAME_CAP.desktopFps;
  const samples: number[] = [];
  let divisor = 1, skipped = 0, owed = 0;

  let lastTs = -1;
  const frame = (ts: number) => {
    requestAnimationFrame(frame);
    const deltaMS = lastTs < 0 ? 16.7 : Math.max(0, ts - lastTs);
    lastTs = ts;
    owed += deltaMS;
    if (samples.length < FRAME_CAP.measureFrames) { samples.push(deltaMS); if (samples.length === FRAME_CAP.measureFrames) divisor = pickFrameDivisor(refreshFromFrames(samples), capFps); }
    else if (divisor > 1 && ++skipped < divisor) return;                        // this refresh is skipped: its time is kept in `owed`
    skipped = 0;
    const frameMs = owed; owed = 0;
    const dt = Math.min(frameMs, MAX_FRAME_MS);
    const game = hooks.game(), renderer = hooks.renderer();
    if (game !== lastGame) { lastGame = game; changed = true; }                 // a new arena: draw it at once
    const live = game.running && !hooks.isPaused();
    if (live) {
      acc += dt;
      while (acc >= TICK_MS && game.running) {
        game.tick(); acc -= TICK_MS;
        if (++tickNo % HUD_EVERY_TICKS === 0) hooks.everyFewTicks();
      }
      if (quality.frame(frameMs / divisor)) apply();                            // judged per display refresh, so skipping frames never looks like slowness
    }
    sinceDraw += dt;
    if (!live && !firstFrame && !renderer.animating?.() && !idleFrameDue(sinceDraw, changed)) return;      // nothing is moving (the death replay counts as moving) and a panel covers the scene: skip the work
    renderer.frame(live ? tickAlpha(acc, TICK_MS) : 1, Math.min(sinceDraw, MAX_FRAME_MS), performance.now());
    sinceDraw = 0; changed = false;
    if (firstFrame) { firstFrame = false; signalReady(); }
  };
  requestAnimationFrame(frame);
}
