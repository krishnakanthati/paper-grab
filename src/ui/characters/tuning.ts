// Every number that shapes the character-select stage.
export const STAGE = {
  fov: 28,
  elevationDeg: 20,           // how far above the horizon the camera looks from
  lookAtZ: 0.85,              // height of the point the camera aims at
  charScale: 1.55,            // the character is built about 1 unit tall; show it bigger
  fitHalfWidth: 2.7, fitHalfHeight: 2.35,   // what must stay on screen (pedestal glow, character with ears)
  pedestal: { radius: 1.75, height: 0.16, glowRadius: 2.7, beamTop: 1.25, beamHeight: 2.6, beamOpacity: 0.1 },
  compact: { halfHeight: 0.88, halfWidth: 0.92, lookAtZ: 0.62, elevationDeg: 16 },   // the small inline picker: just the character, framed tight
  maxPixelRatio: 3,           // render as sharp as the screen can show: the canvas is small, so a high ratio is cheap
  compactGlow: { scale: 0.42, opacity: 0.5 },   // the soft pool of light under the inline character
  popMs: 560,                 // a new character pops in this fast, with overshoot
  leaveMs: 200, leaveSpin: 5, swaySeedSpread: 6,
  poke: { arrive: 0.55, tap: 1, cheer: 1.25, cheerHop: 3.4 },               // the old one shrinks away this fast
  idleSwayRad: 0.32, idleSwayHz: 0.16,
  dragSpin: 0.012,            // radians of spin velocity per px of drag speed
  blinkEveryMs: [1800, 4200] as const, blinkMs: 130,
  colors: { pedestal: 0xf4fbff, glow: 0xbff4ff, beam: 0xaef0ff, sun: 0xffffff, rim: 0x9fdcff },
  light: { ambient: 1.1, key: 1.8, rim: 0.7 },
};


/** The inline picker's tickle: how often it can giggle again while the pointer keeps moving over it. */
export const PICKER = { tickleEveryMs: 700 };
