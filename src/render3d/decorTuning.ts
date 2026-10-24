// Every number and colour that shapes a character's decorations (decor.ts), in one place. Positions are in the
// character's own units: +x forward, +y left, +z up; "dz" values are heights relative to a named reference (the eyes,
// the top of the body...) so changing the body size in tuning.ts moves the decorations with it.
export const DECOR = {
  colors: { white: 0xffffff, mouth: 0x5a2a3a, freckle: 0x7a4a3a, flowerCentre: 0xff9f3d, bell: 0xffc933 },
  rough: { default: 0.5, body: 0.55, cheek: 0.8, shine: 0.1, inner: 0.7, eyePatch: 0.7, patch: 0.6, nostril: 0.6, nose: 0.4, tooth: 0.4, bell: 0.3, freckle: 0.7, flowerCentre: 0.5 },
  metalness: 0.02,
  ballSegments: [32, 22] as const,                         // smooth spheres: no visible facets at any size

  cheek: { y: 0.36, forward: -0.03, dzFromEye: -0.12, scale: [0.05, 0.13, 0.085] as const },
  sparkle: {
    big: { x: 0.62, y: 0.045, z: 0.5, r: 0.038 },          // x/z as a share of the pupil radius
    small: { x: 0.7, y: -0.04, z: -0.42, r: 0.019 },
  },
  eyePatch: { forward: -0.035, scale: [0.05, 0.19, 0.22] as const, eyeNudge: 0.012 },

  ear: {
    round: { x: -0.04, y: 0.37, dz: 0.01, scale: [0.21, 0.21, 0.17] as const, inner: { at: [0.45, 0, 0.25] as const, scale: [0.5, 0.55, 0.5] as const } },
    long: { size: [0.17, 0.15, 0.6] as const, radius: 0.07, x: -0.06, y: 0.22, dz: 0.3, tilt: 0.18, inner: { size: [0.06, 0.07, 0.38] as const, radius: 0.03, x: 0.07 } },
    point: { radius: 0.18, height: 0.34, sides: 4, x: -0.02, y: 0.32, dz: 0.12, roll: 0.2, inner: { radius: 0.08, height: 0.2, x: 0.05 } },
    floppy: { x: 0.05, y: 0.4, dz: -0.1, scale: [0.2, 0.07, 0.16] as const, tilt: 0.5 },
  },

  snout: { size: [0.24, 0.42, 0.26] as const, radius: 0.1, forward: 0.05, dzFromEye: -0.2, nostril: { forward: 0.17, y: 0.09, dzFromEye: -0.18, scale: [0.025, 0.035, 0.05] as const } },
  trunk: { size: [0.2, 0.24, 0.5] as const, radius: 0.09, forward: 0.14, dzFromEye: -0.22, tipSize: [0.17, 0.21, 0.2] as const, tipRadius: 0.07, tipForward: 0.07, tipDrop: 0.2, tipTilt: -0.35 },
  noseHorn: { radius: 0.11, height: 0.34, sides: 12, forward: 0.2, dzFromEye: -0.07, dir: [0.9, 0, 0.55] as const },
  claws: {
    arm: { size: [0.12, 0.2, 0.11] as const, radius: 0.05, forward: -0.02, y: 0.5, dz: 0.42 },       // the forearm out of the body
    ball: { scale: [0.2, 0.21, 0.17] as const, forward: 0.1, y: 0.7 },                                // the big rounded palm of the claw
    finger: { radius: 0.085, height: 0.3, sides: 14, forward: 0.27, spread: 0.075, close: 0.3 },     // two chunky tapering fingers that curve in towards each other
    tip: { radius: 0.042, forward: 0.4, spread: 0.02, color: 0xfff1e2 },                              // a pale rounded tip on each finger
    wave: { hz: 7, amp: 0.3 },
  },
  legs: { perSide: 3, size: [0.045, 0.24, 0.045] as const, xs: [-0.28, -0.06, 0.16] as const, y: 0.5, dz: 0.26, tilt: 0.55 },
  nose: { forward: 0.01, dzFromEye: -0.08, scale: [0.075, 0.095, 0.065] as const },
  beak: { radius: 0.1, height: 0.2, sides: 10, forward: 0.09, dzFromEye: -0.08 },
  /** mouth shapes as bezier tubes across the face: half width, lift of each corner, dip of the middle, and a skew (smirk) */
  mouths: {
    smile: { half: 0.07, left: 0.035, right: 0.035, mid: -0.035 },
    grin: { half: 0.11, left: 0.05, right: 0.05, mid: -0.075 },
    smirk: { half: 0.075, left: 0.012, right: 0.05, mid: -0.03 },
    flat: { half: 0.06, left: 0.0, right: 0.0, mid: 0.0 },
    frown: { half: 0.065, left: -0.03, right: -0.03, mid: 0.04 },
  },
  mouthOpen: { scale: [0.04, 0.05, 0.062] as const, tongue: [0.03, 0.032, 0.03] as const },
  smile: { half: 0.07, lift: 0.035, dip: -0.035, tube: 0.013, segments: 14, radial: 6, forward: 0.012 },
  horn: { radius: 0.088, height: 0.32, sides: 14, x: 0.1, y: 0.24, dz: 0.1, lean: 0.3 },   // medium horns that lean slightly outwards
  patchCorner: 0.45,                                       // corner rounding of a patch, as a share of its thinnest side

  tail: {
    dz: 0.42,                                              // share of the body height
    puff: { back: -0.04, radius: 0.13 },
    long: { size: [0.28, 0.09, 0.09] as const, radius: 0.04, back: -0.12, dz: 0.1, yaw: -0.5 },
    curl: { radius: 0.07, tube: 0.025, segments: [8, 14] as const, arc: 1.6, back: -0.05, yaw: Math.PI / 2 },
  },
  wings: { x: -0.02, out: 0.01, dz: 0.45, scale: [0.17, 0.05, 0.12] as const, tilt: 0.3, tuft: { radius: 0.07, x: 0.02, dz: 0.05, stretch: 1.6 } },

  stem: { dir: [0.55, -0.55, 0.42] as const, length: 0.46, radius: 0.016, sides: 6, base: { forward: 0.1, y: -0.09, dzMouth: 0.02 }, tip: { scale: [0.05, 0.02, 0.1] as const } },
  whiskers: { perSide: 3, size: [0.012, 0.3, 0.012] as const, forward: 0.03, y: 0.4, dzNose: -0.02, step: 0.05, fan: 0.28, sweep: 0.12 },
  teeth: { size: [0.05, 0.05, 0.08] as const, radius: 0.02, forward: 0.012, gap: 0.028, dzMouth: 0.02 },
  tongue: { size: [0.05, 0.08, 0.09] as const, radius: 0.025, forward: 0.02, y: 0.03, dzMouth: -0.04 },
  bow: { x: 0.02, y: -0.3, dzTop: 0.07 },
  bowtie: { forward: 0.02, dzLift: 0.14 },
  ribbon: { knot: 0.05, loop: { radius: 0.07, height: 0.15, sides: 8, reach: 0.1 } },
  ring: { radius: 0.505, tube: 0.045, segments: [8, 36] as const, dz: 0.2 },    // scarf and collar
  scarf: {
    knot: { size: [0.12, 0.12, 0.2] as const, radius: 0.04, forward: 0.02, y: 0.2, dz: -0.07 },
    tail: { size: [0.09, 0.1, 0.22] as const, radius: 0.04, forward: 0.03, y: 0.28, dz: -0.17, tilt: 0.2 },
  },
  bell: { radius: 0.055, forward: 0.05, dz: -0.06 },
  flower: { petals: 5, ring: 0.07, x: 0.02, y: -0.3, dzTop: 0.06, petal: [0.05, 0.05, 0.03] as const, centre: [0.04, 0.04, 0.035] as const, centreDz: 0.075 },
  leaf: {
    a: { at: [-0.02, 0.16, 0.05] as const, scale: [0.17, 0.09, 0.025] as const, roll: 0.5 },
    b: { at: [0.02, 0.1, 0.05] as const, scale: [0.1, 0.07, 0.025] as const, roll: -0.6 },
  },
  shell: { radius: 0.43, segments: [20, 10] as const, dz: -0.1, squash: 0.55, teeth: { count: 8, radius: 0.06, height: 0.1, sides: 4, ring: 0.42, dz: 0.02 } },
  freckles: { y: 0.36, forward: -0.02, dzFromEye: -0.12, dots: [[0, 0], [0.06, 0.04], [0.06, -0.03]] as const, scale: [0.02, 0.022, 0.022] as const },
  eyebrows: { size: [0.03, 0.15, 0.035] as const, forward: -0.02, dzFromEye: 0.22, tilt: 0.3 },
  tuft: { count: 3, radius: 0.04, height: 0.14, sides: 6, x: 0.1, spread: 0.07, dzTop: 0.05, fan: 0.35, back: -0.2 },

  /** secondary motion: how fast and how far ears, tail and wings move, and how it scales with energy */
  wiggle: {
    base: 0.35,
    ear: { xHz: 5.2, xAmp: 0.1, yHz: 4.1, yAmp: 0.07, phase: 1.7 },
    tail: { hz: 6.3, amp: 0.55 },
    wing: { hz: 9, amp: 0.45 },
    claw: { hz: 6.5, amp: 0.22 },
  },
} as const;
