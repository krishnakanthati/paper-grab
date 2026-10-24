// How a character dies: it is hit (a quick squash) and, in the same moment, becomes an angel: a halo and a pair of wings grow in, it
// stays upright, floats gently up, and shrinks away at the top. No tumble, no bounce, no lying on the floor. Pure maths of `t`
// (0 at the moment of death, 1 when it is gone), so it can be tested without a renderer.
export const DEATH = {
  ms: 2000,                    // from the hit to gone
  hitShare: 0.08,              // the opening squash lasts this much
  hitSquash: 0.5,              // and flattens it to this share of its height
  angelFrom: 0.03,             // the halo and wings pop out right away...
  angelGrow: 0.14,             // ...over this share of the animation
  riseFrom: 0.1,               // it floats up from here...
  riseCells: 2.4,              // ...this high (character units), where it hovers
  bobCells: 0.12, bobHz: 1.6,  // a little bob as it floats
  fadeFrom: 0.86,              // and only shrinks away at the end of its hover
  sparklesAt: [0.12, 0.3, 0.5, 0.7], // golden glints rise off it at these points (drawn by the scene, not the pose)
  poofAt: 0.95,                // and it vanishes in a puff here
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const easeOutBack = (t: number) => { const x = clamp01(t) - 1, c = 1.4; return 1 + (c + 1) * x * x * x + c * x * x; };

export interface DeathPose {
  dx: number; dy: number;      // where it has been moved to, in cells from where it died (it stays put)
  lift: number;                // height above the ground in character units
  yaw: number;                 // extra spin about the vertical axis (radians); none
  roll: number;                // tilt; none, it stays upright
  squash: number;              // 1 = normal height; < 1 flattened
  scale: number;               // 1, then to 0 as it shrinks away
  eyesShut: boolean;
  angel: number;               // 0..1: how much of its halo and wings are out (overshoots a little so they pop)
  done: boolean;
}

export function deathPose(t: number, _heading: number): DeathPose {
  const u = clamp01(t), D = DEATH;
  const hit = u < D.hitShare ? Math.sin((u / D.hitShare) * Math.PI) : 0;
  const rise = easeInOut((u - D.riseFrom) / (1 - D.riseFrom));
  const fade = clamp01((u - D.fadeFrom) / (1 - D.fadeFrom));
  return {
    dx: 0, dy: 0,
    lift: rise * D.riseCells + (u > D.riseFrom ? Math.sin((u - D.riseFrom) * D.ms / 1000 * D.bobHz * Math.PI * 2) * D.bobCells * Math.min(1, (u - D.riseFrom) * 6) : 0),
    yaw: 0, roll: 0,
    squash: 1 - (1 - D.hitSquash) * hit,
    scale: 1 - fade * fade,
    eyesShut: u > 0.05,
    angel: u < D.angelFrom ? 0 : easeOutBack((u - D.angelFrom) / D.angelGrow),
    done: u >= 1,
  };
}
