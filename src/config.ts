// Every tunable number and rule switch lives here, so balancing the game never means hunting through logic.
import type { Rules } from './game/types.ts';

// simulation
/** While nothing is happening (start/pause panel up, game frozen) the scene is redrawn only this often: a panel sits over it, so full-rate drawing is wasted battery. */
/** Name tags float above the head, clear of the 3D character (which is drawn over them), and stay quiet: small, light type. */
export const NAME_TAG = { offset: 1.5, leaderOffset: 1.95, fontSize: 11, fontWeight: '700', strokeWidth: 3, strokeDarken: 0.45, fillAlpha: 0.92 } as const;

/**
 * You win when you own this share of the land (or all of it). The progress bar rounds to whole percents, so a game showing
 * "100%" must really be won: 0.995 is exactly where 99.5% rounds up to 100%. Whatever is left (a sliver, a stray cell) becomes yours.
 */
export const WIN_SHARE = 0.995;

/** Life in the ocean behind the arena: soft ripples spreading and fading. All sizes are for a ~700 px screen and scale with it. */

export const IDLE_RENDER_MS = 500;
export const TICK_HZ = 30;                   // fixed logic rate; rendering interpolates between ticks
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 12;                     // cells per second
export const EDGE_SPEED_MULT = 2;            // speed multiplier while gliding along the coast
export const EDGE_RELEASE = 0.35;            // you let go of the coast only when your steering points inland by more than this (cosine of the angle off the coast)
export const EDGE_HUG = 0.45;                // how far inland (cells) a head's centre stays: small = the line sticks close to the coast
export const TURN_RATE = 6.5;                // radians per second
export const BOT_COUNT = 14;                 // default number of bots (a game can ask for fewer or more)
/**
 * Going all the way round the edge wins. When you close a loop and own at least `minShare` of the land, you win if either
 *  - everything you do not own is just the thin strip between your line and the coast (no deeper than `bandCells`), or
 *  - every other player still in the game is inside your loop.
 * Either way what is left is yours too, so you own it all. Only checked from `minShare` up, so ordinary captures never pay for the scan.
 */
export const RIM_WIN = { bandCells: 1.6, minShare: 0.5 };

/**
 * The chain of captives behind a leader is a physical thing on the map: `spacing` cells between neighbours, and a head that
 * comes within `hitRadius` of a captive takes it AND every captive behind it (the ones in front of it are safe).
 */
export const CAPTIVE_BASE = { spacing: 1.5, firstOffset: 0.8, hitRadius: 1.0 };      // wider than the bodies: at the 50 degree camera pitch an upright captive covers about 1.3 cells of screen depth, so a line of them up the screen needs ~1.7 cells apart (1.2 hid each other)
export const CAPTIVE = {
  spacing: 1.5,              // cells between neighbouring captives: well over a captive's width, so none overlap on screen either (see CAPTIVE_BASE)
  firstOffset: 0.8,            // the first captive sits this much further back than the rest, to clear the leader's own (larger) body
  hitRadius: 1.0, historyStep: 0.1, historyMargin: 2,
};
/**
 * Characters are drawn larger on some screens (phones), so their chain has to be spaced wider there or the captives would have to be
 * drawn smaller than they should be. `k` stretches the spacing, the first captive's offset and the cut radius together; 1 = the default.
 * Call once at startup, before a game exists (the rules and the renderer both read these live).
 */
export function setChainScale(k: number) {
  CAPTIVE.spacing = CAPTIVE_BASE.spacing * k; CAPTIVE.firstOffset = CAPTIVE_BASE.firstOffset * k; CAPTIVE.hitRadius = CAPTIVE_BASE.hitRadius * k;
}
/** Distance (cells, along the walked path) behind the head of the `slot`-th captive (0 = the first). Shared by the rules and the renderer. */
export const captiveDistance = (slot: number) => CAPTIVE.firstOffset + (slot + 1) * CAPTIVE.spacing;

/**
 * Gliding along the coast leaves a thin gap of land between your line and the water (the line hugs the coast at a fixed
 * distance). That gap is open at both ends, so it can never be "enclosed" the usual way and used to stay unclaimed, leaving
 * pale slivers between your land and the sea. When a line runs close to the coast (within `nearCoast` cells), the land beside
 * it that is within `fillDepth` cells of the water is claimed with the loop.
 */
export const COAST_FILL = { nearCoast: 1.7, fillDepth: 1.0 };

/**
 * Power-up beacons: a glowing circle with an orb in the middle appears now and then. Whoever reaches the orb first claims every bit of
 * land inside the circle, and every other player whose head is inside it when that happens is captured into the collector's chain.
 * Reach it first and the players inside join YOUR chain; lose the race and, if you were inside, you join theirs.
 */
export const BEACON = {
  firstAfterTicks: 30 * 9,     // the first beacon appears this long after a round starts
  everyTicks: 30 * 10,         // then one more roughly this often (while fewer than `max` are out)
  max: 4,                      // at most this many beacons at once
  lifetimeTicks: 30 * 45,      // a beacon nobody reaches fades away after this long
  radius: 5.5,                 // the circle it covers, in cells
  collectRadius: 1.0,          // how close a head must come to the orb to take it
  clearance: 3.2,              // spawns at least this far from the coast, so it is reachable and not wedged against the edge
  tries: 60,                   // random spots tried per spawn
  botRange: 18,                // a computer player this close to a beacon may go for it...
  botChance: 0.55,             // ...with this chance each time it thinks (so not every bot rushes it)
};

/**
 * Power-up pickups: small floating orbs that appear now and then. Whoever's head reaches one gets its effect for a few seconds:
 * boost (faster), shield (cannot be caught or cut by anyone), freeze (every other player close by is stopped for a moment) or
 * magnet (all unclaimed land close by becomes yours at once).
 * Computer players go for them too.
 */
export const POWERUP = {
  kinds: ['boost', 'shield', 'freeze', 'magnet'] as const,
  firstAfterTicks: 30 * 2,     // the first one appears this long after a round starts
  everyTicks: 30 * 2,          // then one more roughly this often (while fewer than `max` are out)
  max: 12,                     // a big world: plenty to find
  lifetimeTicks: 30 * 45,      // one nobody takes fades away after this long
  collectRadius: 1.1,
  clearance: 2.2,              // spawns at least this far from the coast
  tries: 60,
  botRange: 14, botChance: 0.5,
  boostTicks: 30 * 5, boostMult: 1.6,
  shieldTicks: 30 * 6,
  freezeTicks: 30 * 3, freezeRadius: 12,
  magnetRadius: 6,             // magnet: every bit of land nobody owns within this many cells of the taker becomes theirs at once
};

/** Captured players who follow their captor in a chain: at most this many at once (the oldest is let go beyond it). */
export const CAPTIVES_MAX = 10;
/** Some computer-player loops head for the coast and run along it, so they reach the edge of the map like a person does. */
export const BOT_EDGE = { chance: 0.35, minLeg: 6 };

/**
 * How smart computer players are, on top of their loop plan. A head touching a rival's open line kills the rival, so they
 * hunt exposed lines and heads trespassing on their land, and they run home when a rival is about to cut their own line.
 * Chances keep them beatable: not every bot reacts every time.
 */
export const BOT_AI = {
  huntRange: 13,               // a rival's open line this close (cells) is a target...
  huntChance: 0.7,             // ...with this chance each time a bot thinks
  huntMaxTrail: 18,            // a bot with a line longer than this (cells) is too exposed to go hunting
  interceptRange: 11,          // a rival standing on this bot's land this close is chased down
  fleeRange: 5.5,              // a rival head this close to our open line, or the spot it is about to reach, makes us run home
  fleeLook: 3,                 // ...looking this far ahead along its heading
  humanBias: 0.75,             // the human's line looks this much closer (distance factor), so bots notice you first
  headOnRange: 4.5,            // a rival head this close and coming straight at us: dodge it if we would lose the crash, charge it if we would win
  chainRange: 12,              // a rival's chain of captives this close is worth cutting (touching it takes the captives)
  cautiousRange: 16,           // a rival this close to home when a loop is planned: plan a shorter, safer loop
  cautiousLoop: 0.55,          // ...this share of the usual length
  reactTicks: 2,               // while hunting or fleeing a bot re-thinks this often (idle bots: 3-6 ticks)
};

export const MAX_BOTS = 14;                  // line ownership is a 16-bit mask per cell, so at most 15 players
export const MIN_LAND_PER_BOT = 300;         // small arenas get fewer bots so they never feel crowded
export const RESPAWN_TICKS = 60;
export const REPLAY = {
  startDelayMs: 1500,          // after the hit plays at normal speed, before the replay starts
  ms: 5000,                    // the replay of the fatal hit (slow through the throw and every star's flight and hit, then the angel finish at normal speed) lasts this long (real time)
  lookBackMs: 500,             // it begins this much game time before the touch
  slowFrom: -150,              // game ms relative to the touch (the moment the opponent reaches your line, when the star is thrown): before this, real speed...
  slowTo: 700,                 // ...a crawl from there through the wind-up, the flight along your line and the landing, until this...
  speedBefore: 1, speedSlow: 0.3, speedAfter: 1,   // ...then the aftermath
  throwFlyMs: 300,             // the replayed plane's flight (game ms; plus the wind-up)
  starGapMs: 70,               // stars of a multi-star throw are this far apart (ms); a throw is one star for now
  swingLeadMs: 100,            // a close swing starts this long before the hit
  afterMs: 350,                // pause after the replay before the respawn
};
export const AFTER_DEATH_MS = 900;           // pause after you die, for the death effects, before you respawn
export const AFTER_WIN_MS = 2800;            // celebration time after owning the whole arena, before a new round
export const HEAD_HIT = 0.95;                // heads closer than this (cells) have collided: their rims are just touching
export const LINE_HIT = 0.9;                 // a head this close to another player's drawn line has touched it (head radius + half the line)
export const SELF_GRACE = 4;                 // newest own-line cells are ignored so tight turns don't self-hit
export const START_RADIUS = 2.5;             // radius of the round patch a player spawns with

// rules (see game/ for how each is applied)
export const DEFAULT_RULES: Rules = { selfCollisionKills: false };

// the follow camera (see render/camera.ts)
export const CAMERA = {
  baseView: 20,                // cells that fit across the shorter screen side at the start
  growth: 0.25, maxGrowth: 3,  // zoom out by sqrt(your cells) * growth, up to maxGrowth more cells: only a little, because zooming out makes everything small
  followMs: 90,                // how quickly the camera catches up with your head (smaller = tighter)
  zoomMs: 700,                 // how quickly the zoom changes
  lookAhead: 2.2,              // cells the view leads ahead of your heading
  lookAheadMs: 380,            // how smoothly it leads
  shakePerMs: 0.004, shakePx: 10,   // shake decay and size
} as const;

// visual effects (see render/effects.ts, render/particles.ts)
export const EFFECTS = {
  maxParticles: 450,           // hard cap on live particles (also scaled down on slow devices)
  deathLineMs: 700,            // a dead player's open line fades away over this long instead of vanishing
  convertMs: 750,              // (same fade) land that changes hands melts from its old colour into the new one over this long
  revealMs: 950,               // newly claimed land is coloured in over this long instead of appearing at once
  revealSpread: 0.75,          // ...as ink spreading out from the head for this share of that time, with an overall fade on top
  rebuildsPerFrame: 3,         // territories redrawn per frame at most (after the first draw), so a big multi-player change never costs one long frame
  revealMinCells: 3,           // smaller grabs than this are not worth a fade
  revealMaxLive: 10,           // at most this many fades at once (a busy map must not slow down)
  ringMs: 420,                 // how long an impact ring takes to expand and fade
  dustEveryMs: 95,             // one dust puff per this long behind a head that is out on a line
  kickFarCells: 30,            // events farther than this from you don't shake the view
  kickOthers: 0.55,            // how hard a distant fight shakes the view compared with your own
  captureKickPerCell: 1 / 400, captureKickMax: 0.3,   // a capture shakes the view by size, up to this
} as const;


export const MILESTONES = [5, 10, 20, 35, 50, 75, 90];   // % of the world the human's share passes (each plays a chime)

const NAMES = ['You', 'Blue', 'Green', 'Orange', 'Purple', 'Teal', 'Pink', 'Brown'];
/** Display name of a player id (1 = you); beyond the named ones, 'Bot 9', 'Bot 10', ... */
export const nameOf = (id: number) => NAMES[id - 1] ?? `Bot ${id}`;
export const DIR_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];   // up, right, down, left
