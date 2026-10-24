// The slow-motion replay of the hit that ended the human's game: a short history of where every player was (recorded as the game
// runs), a way to read it back at any moment, and the speed curve that crawls through the throw. Pure maths, testable without a renderer.
import { REPLAY } from '../config.ts';

/** Per player, 4 numbers: x, y, heading, alive (1/0). */
export const SNAP_STRIDE = 4;
export interface Snap { t: number; v: Float32Array }

const wrapPi = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function createHistory(keepMs = REPLAY.lookBackMs + 400, everyMs = 30) {
  let snaps: Snap[] = [];
  return {
    /** Record `v` at time `t` (ms); frames closer together than `everyMs` are skipped unless `force`. Old ones are dropped. */
    push(t: number, v: Float32Array, force = false) {
      const last = snaps[snaps.length - 1];
      if (last && !force && t - last.t < everyMs) return;
      snaps.push({ t, v });
      let drop = 0; while (drop < snaps.length - 2 && snaps[drop + 1].t < t - keepMs) drop++;
      if (drop) snaps = snaps.slice(drop);
    },
    clear() { snaps = []; },
    get length() { return snaps.length; },
    get lastT() { return snaps.length ? snaps[snaps.length - 1].t : -1; },
    /** Players at time `t` written into `out`: positions and headings blended between the two records around it; `alive` is the earlier one's. */
    sample(t: number, out: Float32Array): boolean {
      if (!snaps.length) return false;
      let i = 0; while (i + 1 < snaps.length && snaps[i + 1].t <= t) i++;
      const a = snaps[i], b = snaps[Math.min(i + 1, snaps.length - 1)];
      const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0, n = Math.min(out.length, a.v.length, b.v.length);
      for (let j = 0; j + 3 < n; j += SNAP_STRIDE) {
        out[j] = a.v[j] + (b.v[j] - a.v[j]) * k; out[j + 1] = a.v[j + 1] + (b.v[j + 1] - a.v[j + 1]) * k;
        out[j + 2] = a.v[j + 2] + wrapPi(b.v[j + 2] - a.v[j + 2]) * k;
        out[j + 3] = k >= 1 ? b.v[j + 3] : a.v[j + 3];
      }
      return true;
    },
  };
}

/** How fast the replay plays at `g` ms of game time relative to the touch (negative = before it): 1 = real speed. */
export const replaySpeed = (g: number) => g < REPLAY.slowFrom ? REPLAY.speedBefore : g < REPLAY.slowTo ? REPLAY.speedSlow : REPLAY.speedAfter;

/** The replay's real duration in ms if it were played start to finish (for the respawn to wait for). */
export const replayDuration = () => REPLAY.ms;

/**
 * Is this player drawn alive at `g` ms from the touch? Everyone is as they were recorded until the star lands (`landG`), except that the victim's
 * last record says "dead" (it is written the instant of the touch) and must not start the angel before the star has actually hit; from the landing on it is
 * the real outcome, so the angel forms after the hit.
 */
export const replayAlive = (g: number, landG: number, isVictim: boolean, recorded: boolean, outcome: boolean) =>
  g >= landG ? outcome : isVictim && g >= 0 ? true : recorded;
