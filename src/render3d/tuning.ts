import { CAPTIVE, CAPTIVE_BASE, setChainScale } from '../config.ts';
// Every number that shapes the 3D characters, in one place.
export const CHARACTER = {
  groundY: 0.1,              // the height they stand at: on top of a territory slab (see scene/territory3d.ts)
  bodySize: [0.96, 0.96, 0.8] as const,   // width, depth, height in cells
  bodyRadius: 0.1,           // corner rounding of the body: a chunky block with soft edges, not a pillow
  bodyLift: 0.16,            // how high the feet raise the body off the ground
  outline: 0.055,            // thickness of the dark outline around the body (cells): thin and crisp
  outlineInk: 0x1a2540,      // the colour each body is darkened towards to make its outline
  outlineMix: 0.62,          // how far (0..1)
  bodySegments: 9, eyeSegments: [36, 24] as const, pupilSegments: [24, 16] as const,   // smooth curves, no facets
  eyeRadius: 0.17,           // big eyes, set low and wide apart, are what read as a baby face
  pupilRadius: 0.118,        // the pupil fills most of the eye: big dark glossy eyes
  eyeSpacing: 0.25,
  eyeHeight: 0.5,            // fraction of the body height
  mouthHeight: 0.28,
  footSize: [0.27, 0.24, 0.14] as const,
  crownLift: 1.2,            // how high above the ground the leader's crown floats
  runSpeedRef: 8,            // cells/second that counts as "running at full gait"
  gait: 15,                  // running-cycle speed (radians per second at full gait)
  bobHeight: 0.09,
  squashAmount: 0.08,
  stepSwing: 0.2,
  turnSmoothMs: 90,
  leanPerTurn: 0.075,        // roll per radian/second of turning
  maxLean: 0.32,
  sizeBoost: 1.1 * 1.25,            // every screen: characters are drawn this much larger than their cell size
  minShareOfStart: 0.88,     // and when the camera zooms out they never shrink below this share of their size at the start of a round (so they stay readable)
  mobileBoost: 1.1 * 1.15 * 1.1 * 1.1 * 1.25,   // on touch screens the characters are drawn this much larger (+10%, then +15%, then +10%, then +10% more): easy to read on a small display
  popMs: 460,                // length of the spawn pop
  blinkMs: 140,
  shadowAlpha: 0.22,
  lights: { ambient: 1.05, key: 1.7, fill: 0.45 },
};

/** The chain of captured players trailing behind their captor. */
export const CHAIN: { spacing: number; footprint: number; gapShare: number; [k: string]: number } = {
  spacing: CAPTIVE.spacing,  // cells between neighbours (shared with the rules, which decide who can be cut out of a chain)
  footprint: 1,              // a character looks about this much wider than its body box (ears, arms, horns), so gaps can be judged on the look, not the box: 1 on web (as tuned), more on phones (layoutChain)
  gapShare: 0.0909,          // the clear gap between neighbours is at least this share of a captive's looked-at width, however big the characters are drawn (web: spacing 1.2 leaves a 0.1 cell gap at the widest)
  scale: 0.75,               // captives are three quarters of their normal size; it multiplies the screen's pixels-per-cell, so it is right on every screen
  historyStep: CAPTIVE.historyStep,
  historyMargin: CAPTIVE.historyMargin,
  joinMs: 450,               // a newly captured player glides from where it was caught into its place
  popMs: 380,                // and grows in over this long
  leaveMs: 220,              // freed captives shrink away over this long
  bob: 0.7,                  // how much of the leader's running bounce the captives copy
  phaseLag: 0.75,            // each captive's running cycle lags the one in front by this much (radians): a ripple down the chain
};

/** How much larger than a cell characters are drawn on this screen (touch screens more). */
export const characterBoost = () => CHARACTER.sizeBoost * (isTouchScreen() ? CHARACTER.mobileBoost : 1);
/** Is this a touch screen (phone / tablet)? */
export const isTouchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/**
 * Lay the chain out for this screen. Web keeps the tuned defaults (spacing 1.2, captives 3/4 of their captor). On a phone the characters are
 * drawn much larger, so captives are judged on how wide they LOOK (ears, arms, horns) and given a clear gap, and the spacing grows to fit
 * them at the same 3/4 share of their captor. Call once at startup, before a game exists.
 */
export function layoutChain(touch: boolean, boost: number) {
  CHAIN.footprint = touch ? 1.3 : 1; CHAIN.gapShare = touch ? 0.2 : 0.0909;
  setChainScale(touch ? Math.max(1, (CHAIN.scale * boost * CHARACTER.bodySize[0] * CHAIN.footprint * (1 + CHAIN.gapShare)) / CAPTIVE_BASE.spacing) : 1);
}
