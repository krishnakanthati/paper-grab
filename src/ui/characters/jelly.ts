// The "jiggle wiggle": a character is a bit of jelly. Squash, roll and hop are each a damped spring that settles back to
// rest after being kicked, so a poke, a swap or a cheer all overshoot and wobble the same natural way. Pure maths, no Three.js.

import { SpringAnimator } from '../../anim/spring.ts';

/** The damped spring behind every jelly motion (see anim/spring.ts). */
export const Spring = SpringAnimator;
export type Spring = SpringAnimator;

export const JELLY = {
  squash: { stiffness: 230, damping: 9.5 },   // vertical squash/stretch: bouncy, a few visible wobbles
  roll: { stiffness: 150, damping: 6.5 },     // side-to-side tilt
  hop: { stiffness: 190, damping: 8.5 },      // the jump: an arc whose peak is about kick / 13.8 character units
  spin: { stiffness: 0, damping: 3.2 },       // yaw: no pull back while it turns, just friction (so it keeps turning, then stops)
  wobble: { stiffness: 340, damping: 5.5 },   // the jelly jiggle: width and depth swap places, then wobble out
  pokeSquash: -8, pokeRoll: 5.5, pokeHop: 4.2,
  tickleSquash: -1.6, tickleRoll: 3.2, tickleExcite: 0.55,      // a tickle is a small, quick giggle: a shake and a little squeeze, no hop
  breatheHz: 0.33, breatheAmount: 0.022,
  anticipateSeconds: 0.16, anticipateSquash: -17,                 // a crouch (about 0.72 tall) just before every idle jump
  hopEverySeconds: 2.4, hopKick: 4.6, spinHopKick: 7.2,       // every other idle jump is a full turn in the air
  landSquash: -7, landWobble: 4.5,                              // landing presses it flat and sets it jiggling
  faceFrontPerSecond: 6,                                        // after a spin it settles to face the front again
  squashToScale: 0.3, rollToRad: 0.22, wobbleToScale: 0.09,
};

export interface JellyPose {
  sx: number; sy: number; sz: number;         // scale of the body (volume-preserving: stretch tall = slim)
  roll: number;                                // radians about the forward axis
  hop: number;                                 // lift in character units
  yaw: number;                                 // extra turn in radians
  energy: number;                              // 0..1.4: how lively the ears/tail should be right now
}

export class Jelly {
  squash = new Spring(JELLY.squash.stiffness, JELLY.squash.damping);
  roll = new Spring(JELLY.roll.stiffness, JELLY.roll.damping);
  hop = new Spring(JELLY.hop.stiffness, JELLY.hop.damping);
  spin = new Spring(JELLY.spin.stiffness, JELLY.spin.damping);
  wobble = new Spring(JELLY.wobble.stiffness, JELLY.wobble.damping);
  private clock = 0;
  private nextHop = JELLY.hopEverySeconds * 0.5;
  private hops = 0;
  private launchAt = -1;                                         // the moment the crouch ends and the jump leaves the ground
  private airborne = false;
  private excitement = 0;

  /** A poke or tap: squash down, roll to a side, hop, then wobble back. `dir` is -1 or 1 (which way to roll). */
  poke(dir = 1, strength = 1) {
    this.squash.kick(JELLY.pokeSquash * strength); this.roll.kick(JELLY.pokeRoll * strength * dir); this.hop.kick(JELLY.pokeHop * strength); this.wobble.kick(2.5 * strength);
    this.excitement = Math.min(1.4, this.excitement + 0.9);
  }
  /** A tickle: a quick little shake and squeeze, much gentler than a poke. */
  tickle(dir = 1) {
    this.roll.kick(JELLY.tickleRoll * dir); this.squash.kick(JELLY.tickleSquash); this.wobble.kick(1.2);
    this.excitement = Math.min(1.4, this.excitement + JELLY.tickleExcite);
  }
  /** Drag spin: add angular velocity (radians/second). */
  push(angularVelocity: number) { this.spin.v += angularVelocity; }
  /** A jump with a full turn in the air. */
  jumpSpin(dir = 1) { this.hop.kick(JELLY.spinHopKick); this.squash.kick(2.5); this.spin.v += dir * Math.PI * 2 * JELLY.spin.damping; this.excitement = Math.min(1.4, this.excitement + 0.6); }

  step(dt: number): JellyPose {
    this.clock += dt;
    if (this.launchAt < 0 && this.clock >= this.nextHop) {              // time to jump: crouch first (anticipation) ...
      this.nextHop = this.clock + JELLY.hopEverySeconds;
      this.launchAt = this.clock + JELLY.anticipateSeconds;
      this.squash.kick(JELLY.anticipateSquash);
    }
    if (this.launchAt >= 0 && this.clock >= this.launchAt) {              // ... then launch
      this.launchAt = -1;
      if (++this.hops % 2 === 0) this.jumpSpin(this.hops % 4 === 0 ? -1 : 1);
      else { this.hop.kick(JELLY.hopKick); this.squash.kick(2.2); this.excitement = Math.min(1.4, this.excitement + 0.35); }
    }
    for (const s of [this.squash, this.roll, this.hop, this.spin, this.wobble]) s.step(dt);
    if (this.hop.x > 0.03) this.airborne = true;
    else if (this.airborne && this.hop.x <= 0 && this.hop.v < 0) {           // touchdown: a hard stop, then the jelly takes the hit
      this.airborne = false; this.hop.x = 0; this.hop.v = 0;
      this.squash.kick(JELLY.landSquash); this.wobble.kick(JELLY.landWobble);
    }
    if (Math.abs(this.spin.v) < 0.4) {                                          // spun down: ease round to the nearest way-it-faces-front
      const turn = Math.PI * 2, front = Math.round(this.spin.x / turn) * turn;
      this.spin.x += (front - this.spin.x) * (1 - Math.exp(-dt * JELLY.faceFrontPerSecond));
      if (Math.abs(front - this.spin.x) < 1e-3) { this.spin.x = 0; this.spin.v = 0; }
    }
    this.excitement = Math.max(0, this.excitement - dt * 0.9);
    const breathe = Math.sin(this.clock * Math.PI * 2 * JELLY.breatheHz) * JELLY.breatheAmount;
    const stretch = 1 + this.squash.x * JELLY.squashToScale + breathe;
    const girth = 1 / Math.sqrt(Math.max(0.2, stretch));         // keep the volume: taller means slimmer
    const jig = this.wobble.x * JELLY.wobbleToScale;             // width and depth trade places, like jelly settling
    return { sx: girth * (1 + jig), sy: girth * (1 - jig), sz: stretch, roll: this.roll.x * JELLY.rollToRad, hop: Math.max(0, this.hop.x), yaw: this.spin.x, energy: this.excitement };
  }
}
