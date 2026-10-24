// Shared shapes for the rules engine. Nothing here has behaviour.

export interface Rules {
  selfCollisionKills: boolean;   // crossing your own open line kills you (off by default)
}

export interface Player {
  id: number;
  isBot: boolean;
  alive: boolean;
  x: number; y: number;          // head position in cell units (cell (i,j) spans [i,i+1) x [j,j+1))
  px: number; py: number;        // previous tick's position, so the renderer can glide between ticks
  angle: number;                 // current heading
  inOwner: number;               // id of the land the head is standing on right now (0 = neutral)
  pa: number;                    // previous tick's heading, so the renderer can rotate smoothly
  kills: number;                 // players this one has eliminated
  walk: Trail;                   // the path this player's head has walked: its captives follow it, so it decides where they are
  captives: number[];            // ids of the players this one has captured, oldest first: they trail behind it in a chain until it dies
  target: number;                // heading we are turning towards
  trail: number[];               // ordered cell indices of the open line
  path: number[];                // the line's real path, flat [x0,y0,x1,y1,...], for smooth drawing
  trailStartTick: number;        // when the current line began (older lines lose head-on crashes)
  blocked: boolean;              // gliding along the rim this tick
  slide: number;                 // which way (+1 / -1 along the coast) the head slides
  stuck: boolean;                // on the coast and staying there until the player deliberately steers inland
  slideLock: number;             // ticks left during which the slide direction is locked (refreshed while touching the coast)
  stuckIntent: number;           // the heading the player held when they hit the coast: only steering clearly away from it lets go
  slideIntent: number;           // the steering target when the lock started: the lock breaks only if the player steers elsewhere
  respawnIn: number;
  capturedBy: number;            // id of the player holding this one in its chain (0 = free). A captured player does not respawn until it is released
  // bot planning state
  shield: number; shieldCool: number;   // ticks left of the safe-zone shield, and until it can be switched on again (0 = off / ready)
  returning: boolean; edgeRun: boolean; phase: number; leg: number; leg2: number; turnSign: number; thinkIn: number;
}



export interface GameEvents {
  /** `p` claimed these cells. `takenFrom` says which of them used to belong to whom (the rest were nobody's), so the renderer can blend old colour into new. */
  onCapture?(p: Player, claimed: number[], takenFrom?: Map<number, number[]>): void;
  onKill?(victim: Player, killer: Player | null, reason: string): void;
  onShield?(p: Player): void;                            // a player switched their safe-zone shield on
  onChainCut?(from: Player, by: Player, ids: number[]): void;         // `by` touched `from`'s chain and took these captives (and all behind them)
  onClear?(victim: Player, cells: number[]): void;                     // a player died with no captor: this land went back to nobody
  onConvert?(victim: Player, captor: Player, cells: number[]): void;   // a captured player's land just became the captor's
  onGameOver?(reason: string): void;
  onWin?(): void;
  onLeaveHome?(p: Player): void;                          // a head steps off its own land and starts drawing a line
  onEnterEnemyLand?(p: Player, landOwner: number): void;  // a head steps onto land that belongs to someone else
  onLandLost?(victim: Player, taker: Player, cells: number): void;   // a capture took land from `victim`
  onLeader?(leaderId: number): void;                      // the crown moved to this player
  onMilestone?(index: number): void;                      // the human crossed the next share-of-the-world milestone
}

import type { Trail } from './trail.ts';
import type { ArenaShape } from '../data/shape.ts';
import type { Loop } from '../geometry/index.ts';

/** The playable world: which cells are land, and a smooth boundary for gliding along coasts. */
export interface Arena {
  /** Is this point comfortably inside the playable shape (a head's whole body fits)? */
  inside(x: number, y: number): boolean;
  /** Unit vector pointing from a point towards the interior of the shape. */
  inward(x: number, y: number): [number, number];
  /** How deep inside the shape a point is (0 outside .. 1 deep inland); a head hugs the INSIDE level of this. */
  depth(x: number, y: number): number;
  /** Project a point onto the contour a head hugs along the coast, so its gap to the edge is uniform. */
  snap(x: number, y: number): [number, number];
  /** The coast as closed outlines (the zero level of the same field heads hug), for drawing. Cached after the first call. */
  coast(): Loop[];
}

/** The public face of a running game; the renderer, HUD and tests read this. */
export interface GameOptions {
  shape?: ArenaShape;        // the arena to play in (default: the whole world)
  botCount?: number;         // how many bots (default: scaled to the arena's size, see config)
}

export interface Game {
  shape: ArenaShape;
  NX: number; NY: number;
  botCount: number;
  land: Uint8Array;              // playable cells: the world-shaped arena
  arena: Arena;
  owner: Uint8Array;             // 0 = nobody, else player id
  trail: Uint16Array;            // bitmask: bit `id` is set when player `id`'s open line passes through the cell (lines may overlap)
  landCount: number;
  players: Player[];
  counts: number[];              // cells owned per player id
  ver: number[];                 // per-player territory version, bumped whenever that player's land changes
  running: boolean;
  tickCount: number;
  bestCells: number;
  rules: Rules;
  startGame(): void;
  respawnHuman(): boolean;          // after you die: back into the same world, score reset, bots untouched
  tick(): void;
  setTarget(angle: number): void;   // steer the human towards a heading (radians)
  setDir(d: number): void;          // 0 up, 1 right, 2 down, 3 left
  leaderId(): number;               // id of the player with the most land (wears the crown), 0 if none
  useShield(): boolean;             // the human switches the safe-zone shield on, if it is ready
}

/** Internal state shared by the rules modules. */
export interface Ctx extends Game {
  random: () => number;
  events: GameEvents;
  labelBuf: Uint32Array;         // reused by capture(); a generation number avoids clearing it
  labelGen: number;
  countsDirty: boolean;
  lastLeader: number;
  milestone: number;             // how many milestones the human has passed this life
}
