// Small, pure interpolation helpers shared by the rules-to-screen smoothing (no DOM, no Three.js, so they are testable in Node).

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Wrap an angle into (-PI, PI]. */
export const wrapPi = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
/** Interpolate between two angles the SHORT way round the circle (the +-PI seam never makes it spin the long way). */
export const lerpAngle = (a: number, b: number, t: number) => a + wrapPi(b - a) * t;

/** Frame-rate independent exponential smoothing factor: the share of the remaining gap to close in `dtMs` with a time constant of `tauMs`. */
export const smoothK = (dtMs: number, tauMs: number) => 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
/** The same, written with a rate (1 / seconds): `1 - exp(-lambda * dt)`. */
export const dampK = (lambda: number, dtSeconds: number) => 1 - Math.exp(-lambda * Math.max(0, dtSeconds));

/** Where a fixed-rate simulation is between its last two ticks: 0 right after a tick, up to 1 just before the next. */
export const tickAlpha = (accumulatorMs: number, tickMs: number) => clamp(accumulatorMs / tickMs, 0, 1);
