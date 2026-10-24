// A damped harmonic oscillator (second-order spring) pulling `x` towards `target`: the one animation primitive behind squash and
// stretch, roll, hops and landings. Integrated in small fixed sub-steps, so a long frame cannot blow it up. Pure maths, no DOM.

export class SpringAnimator {
  x = 0; v = 0;
  stiffness: number; damping: number; target: number;
  constructor(stiffness: number, damping: number, target = 0) { this.stiffness = stiffness; this.damping = damping; this.target = target; }

  /** Advance by `dt` seconds. */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-this.stiffness * (this.x - this.target) - this.damping * this.v) * h; this.x += this.v * h; }
  }
  /** Add speed: a poke, a landing, a pop. */
  kick(v: number) { this.v += v; }
  /** Jump to a value with no movement. */
  set(x: number) { this.x = x; this.v = 0; }
  get settled() { return Math.abs(this.x - this.target) < 1e-3 && Math.abs(this.v) < 1e-2; }
  /** Damping ratio: below 1 it overshoots and rebounds, 1 is critically damped, above 1 it creeps. */
  get dampingRatio() { return this.damping / (2 * Math.sqrt(this.stiffness)); }
}

/** A spring with the given natural frequency (rad/s) and damping ratio. */
export const springFor = (frequency: number, dampingRatio: number, target = 0) => new SpringAnimator(frequency * frequency, 2 * dampingRatio * frequency, target);

/**
 * Volume-preserving squash and stretch: stretching a body to `sy` along its height slims it to 1 / sqrt(sy) across (both horizontal
 * axes), so it keeps its volume. `sy` is floored so a violent squash never produces an absurd width.
 */
export function volumeScale(sy: number, floor = 0.2): { x: number; y: number; z: number } {
  const y = Math.max(floor, sy), w = 1 / Math.sqrt(y);
  return { x: w, y, z: w };
}
