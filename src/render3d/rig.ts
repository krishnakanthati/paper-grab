// Poses every character from the game state each frame. Pure scene-graph work (no renderer, no GPU), so the whole
// thing can be exercised in Node: positions, headings, tilt, depth order, crown, spawn pop, visibility.
import { Group, Vector3 } from 'three';
import { TICK_MS } from '../config.ts';
import type { Game } from '../game/index.ts';
import { colorOf } from '../render/palette.ts';
import { wiggle } from './decor.ts';
import { createCharacter, type Character3D } from './model.ts';
import type { Species } from './species.ts';
import { easeOutBack, emotionFor, flipAt, flipDurationMs, newPoseState, poseFor, resetPose, type FlipKind, type PoseState } from './pose.ts';
import { CAPTIVE, captiveDistance } from '../config.ts';
import { Trail } from './chain.ts';
import { DEATH, deathPose } from './death.ts';
import { CHAIN, CHARACTER as C } from './tuning.ts';

export interface View {
  f: number; dtMs: number; nowMs: number;
  scale: number;                // CSS px per cell at the camera's target (decides how big the characters are drawn, in cells)
  baseScale?: number;           // CSS px per cell at the start of a round (the camera before it has zoomed out): characters are never drawn smaller than a share of this
  boost?: number;               // extra size for the characters themselves (not their positions): bigger on touch screens
}

/** `speciesOf` says which animal each player is; without it the characters are plain coloured blocks. */
interface Follower { victim: number; c: Character3D; st: PoseState; since: number; fromX: number; fromY: number; lastX: number; lastY: number; heading: number; leaveAt: number }
interface Chain { trail: Trail; followers: Follower[] }
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Pixels per cell the characters are DRAWN at: the camera's own scale, but never below a share of its size at the start of the round, times the size boost. */
/** A rival this close, while a character is out on its open line, scares it. */
const EMOTION_DANGER_CELLS = 4;

export const charPx = (v: { scale: number; baseScale?: number; boost?: number }) => Math.max(v.scale, (v.baseScale ?? 0) * C.minShareOfStart) * (v.boost ?? 1);

/** Pixels per cell a captive is drawn at: three quarters of the leader's size, but capped so the chain's gaps never close however large characters are drawn. */
export const followerPx = (v: { scale: number; baseScale?: number; boost?: number }) => v.scale * Math.min(CHAIN.scale * charPx(v) / v.scale, CAPTIVE.spacing / (CHAIN.footprint * (1 + CHAIN.gapShare)) / C.bodySize[0]);

const handTmp = new Vector3();

export function createRig(game: Game, speciesOf?: (id: number) => Species | undefined) {
  const scene = new Group();
  /** Stand a character on the ground at cell (x, y): its own up axis (z) becomes the world's up, and `px` pixels per cell become cells. */
  const stand = (g: Group, x: number, y: number, px: number, scale: number) => { g.position.set(x, C.groundY, y); g.rotation.x = -Math.PI / 2; g.scale.setScalar(px / scale); };
  const chars = new Map<number, { c: Character3D; st: PoseState; wasAlive: boolean }>();
  const flipping = new Map<number, { start: number; kind: FlipKind }>();       // a character in the middle of its flip trick: when it started (ms) and which kind
  const deathDelay = new Map<number, number>();                  // a victim of a thrown knife stands still until the knife lands: ms to wait before its death starts
  const dying = new Map<number, { t0: number; heading: number; at?: readonly [number, number]; size?: number }>();     // characters in the middle of their death animation
  let chainsHeld = false;                                     // a replay rewinds the players but not who captured whom: the captives are hidden for its length rather than shown in the wrong places
  const arms = new Map<number, { dx: number; dz: number; wind: number; rel: number }>();       // who is throwing a star right now: the direction (world) and how far along the throw is
  const reseed = new Set<number>();                          // after a replay: these captors' chains are laid out straight behind them (their real path is not what is on screen)
  const chains = new Map<number, Chain>();                    // each captor's path and the captives following it

  function charFor(id: number) {
    let e = chars.get(id);
    if (!e) {
      const c = createCharacter(colorOf(id), speciesOf?.(id));
      scene.add(c.ground);
      e = { c, st: newPoseState(id), wasAlive: false };
      chars.set(id, e);
    }
    return e;
  }

  const chainOf = (id: number): Chain => { let c = chains.get(id); if (!c) { c = { trail: new Trail(CHAIN.historyStep), followers: [] }; chains.set(id, c); } return c; };
  const freeFollower = (f: Follower) => { scene.remove(f.c.ground); f.c.dispose(); };
  /** A captive whose chain was taken becomes an angel right where it stood (like any other player that is caught); it joins its new captor's chain only once that is over. */
  const angelize = (f: Follower, v: View) => {
    dying.set(f.victim, { t0: v.nowMs, heading: f.heading, at: [f.lastX, f.lastY], size: followerPx(v) / charPx(v) });
    freeFollower(f);
  };
  const takenBySomeoneElse = (victim: number, captor: number) => { const by = game.players[victim - 1]?.capturedBy ?? 0; return by !== 0 && by !== captor; };

  /** Captives follow their captor along the exact path it walked, a little smaller, rippling like a conga line. */
  function updateChain(p: (typeof game.players)[number], lead: { x: number; y: number; speed: number; phase: number; scale: number }, v: View) {
    const chain = chainOf(p.id);
    chain.trail.push(lead.x, lead.y);
    // members join and leave as the captive list changes
    for (const vid of p.captives) {
      if (chain.followers.some(f => f.victim === vid && f.leaveAt < 0)) continue;
      const vp = game.players[vid - 1], ve = chars.get(vid);
      if (dying.has(vid) || (ve && ve.wasAlive && vp && !vp.alive)) continue;
      let heldElsewhere = false;                                            // still standing in its old captor's chain: that chain turns it into an angel first, then it can join this one
      for (const [other, och] of chains) if (other !== p.id && och.followers.some(f => f.victim === vid)) heldElsewhere = true;
      if (heldElsewhere) continue;          // it is still playing its angel death: it joins the chain only once that is over, never drawn in two places at once
      const dead = game.players[vid - 1];
      const c = createCharacter(colorOf(vid), speciesOf?.(vid));
      scene.add(c.ground);
      chain.followers.push({ victim: vid, c, st: newPoseState(vid), since: v.nowMs, fromX: dead?.x ?? lead.x, fromY: dead?.y ?? lead.y, lastX: dead?.x ?? lead.x, lastY: dead?.y ?? lead.y, heading: 0, leaveAt: -1 });
    }
    for (let k = chain.followers.length - 1; k >= 0; k--) {
      const f = chain.followers[k];
      if (f.leaveAt >= 0 || p.captives.includes(f.victim)) continue;
      if (takenBySomeoneElse(f.victim, p.id)) { chain.followers.splice(k, 1); angelize(f, v); } else f.leaveAt = v.nowMs;     // taken by another captor: angel; just freed: shrinks away
    }
    chain.trail.trim(captiveDistance(p.captives.length) + CHAIN.historyMargin);

    let slot = 0;
    for (let k = chain.followers.length - 1; k >= 0; k--) {
      const f = chain.followers[k];
      const leaving = f.leaveAt >= 0, leaveT = leaving ? (v.nowMs - f.leaveAt) / CHAIN.leaveMs : 0;
      if (leaving && leaveT >= 1) { freeFollower(f); chain.followers.splice(k, 1); }
    }
    for (const f of chain.followers) {
      const leaving = f.leaveAt >= 0;
      if (!leaving) slot++;
      const target = chain.trail.at(captiveDistance(slot - 1));                 // the same positions the rules use for cutting a chain
      const j = easeOutCubic((v.nowMs - f.since) / CHAIN.joinMs);       // glide from where it was caught into its place
      const x = f.fromX + (target.x - f.fromX) * j, y = f.fromY + (target.y - f.fromY) * j;
      f.lastX = x; f.lastY = y;
      const grow = leaving ? Math.max(0, 1 - (v.nowMs - f.leaveAt) / CHAIN.leaveMs) : Math.max(0.0001, easeOutBack((v.nowMs - f.since) / CHAIN.popMs));
      const { c } = f;
      c.ground.visible = true;
      stand(c.ground, x, y, followerPx(v) * grow, v.scale);
      c.tilt.rotation.x = 0;
      f.heading = j < 1 ? Math.atan2(target.y - f.fromY, target.x - f.fromX) : target.angle;
      c.facing.rotation.z = -f.heading;
      const phase = lead.phase - slot * CHAIN.phaseLag, bounce = Math.abs(Math.sin(phase));
      c.facing.position.z = bounce * C.bobHeight * CHAIN.bob * lead.speed;
      const squash = 1 + (0.5 - bounce) * C.squashAmount * lead.speed;
      c.facing.scale.set(1 / Math.sqrt(squash), 1 / Math.sqrt(squash), squash);
      c.feet[0].position.x = 0.04 + Math.sin(phase) * C.stepSwing * lead.speed; c.feet[1].position.x = 0.04 - Math.sin(phase) * C.stepSwing * lead.speed;
      if (c.decor) wiggle(c.decor, phase / 3 + v.nowMs / 900, lead.speed);
    }
  }

  return {
    scene,
    chars,
    chains,
    delayDeath(id: number, ms: number) { deathDelay.set(id, ms); },
    /** This player is mid-throw towards world direction (dx, dz): `wind` 0..1 winding up, then `rel` 0..1 releasing. */
    setArm(id: number, dx: number, dz: number, wind: number, rel: number) { arms.set(id, { dx, dz, wind, rel }); },
    clearArm(id: number) { arms.delete(id); },
    /** Hide every captive and stop moving them (a replay is showing the past), or bring them back. */
    holdChains(on: boolean) {
      chainsHeld = on;
      if (!on) for (const p of game.players) reseed.add(p.id);
      if (on) for (const ch of chains.values()) for (const f of ch.followers) f.c.ground.visible = false;
    },
    /** Where this player's hand is on the ground right now (cells), or null. */
    handAt(id: number): readonly [number, number] | null {
      const e = chars.get(id); if (!e || !e.c.hand.parent?.visible) return null;
      e.c.hand.getWorldPosition(handTmp); return [handTmp.x, handTmp.z];
    },
    update(v: View) {
      const leader = game.leaderId();
      for (const p of game.players) {
        const e = charFor(p.id);
        const { c, st } = e;
        if (!p.alive) {
          if (e.wasAlive) { resetPose(st); dying.set(p.id, { t0: v.nowMs + (deathDelay.get(p.id) ?? 0), heading: p.angle }); deathDelay.delete(p.id); }       // it just died: play the death
          e.wasAlive = false;
          const d = dying.get(p.id);
          if (!d) { c.ground.visible = false; c.setAngel(0, 0); continue; }
          const dp = deathPose((v.nowMs - d.t0) / DEATH.ms, d.heading);
          if (dp.done) { dying.delete(p.id); c.ground.visible = false; c.setAngel(0, 0); continue; }
          c.setArm(null); c.setAngel(dp.angel, v.nowMs / 1000);
          c.ground.visible = true;
          stand(c.ground, (d.at?.[0] ?? p.x) + dp.dx, (d.at?.[1] ?? p.y) + dp.dy, charPx(v) * (d.size ?? 1) * dp.scale, v.scale);
          c.tilt.rotation.x = 0;
          c.facing.rotation.set(dp.roll, 0, -d.heading + dp.yaw, 'ZXY');
          c.facing.position.z = dp.lift;
          c.facing.scale.set(1 / Math.sqrt(dp.squash), 1 / Math.sqrt(dp.squash), dp.squash);
          for (const eye of c.eyes) eye.scale.z = dp.eyesShut ? 0.12 : 1.05;
          for (const pupil of c.pupils) pupil.visible = !dp.eyesShut;
          if (c.decor) for (const h of c.decor.highlights) h.visible = !dp.eyesShut;
          c.setCrown(false);
          continue;
        }
        dying.delete(p.id);                                       // it came back before the animation ended
        if (!e.wasAlive) resetPose(st);                           // a new life: pop in again
        e.wasAlive = true;
        c.ground.visible = true;

        const pose = poseFor(p, v.f, TICK_MS / 1000, v.dtMs, v.nowMs, st);
        stand(c.ground, pose.x, pose.y, charPx(v) * pose.scale, v.scale);

        c.tilt.rotation.x = 0;                                     // the camera does the looking down: characters stand upright
        c.facing.rotation.z = -pose.heading;                       // heading is y-down on the ground (+z), the model's own turn is about its up axis
        c.facing.rotation.x = pose.lean;                           // roll into the turn, about the forward axis
        const outside = p.trail.length > 0;
        const danger = outside && game.players.some(o => o !== p && o.alive && Math.hypot(o.x - p.x, o.y - p.y) < EMOTION_DANGER_CELLS);
        const emo = emotionFor(st, { count: game.counts[p.id] ?? 0, captives: p.captives.length, outside, danger }, v.nowMs, v.dtMs);
        let fl = flipAt(1);
        const trick = flipping.get(p.id);
        if (trick) { fl = flipAt((v.nowMs - trick.start) / flipDurationMs(trick.kind), trick.kind); if (fl.done) flipping.delete(p.id); }
        // the somersault turns about the middle of the body, not its feet: shift the group so that middle stays put
        const mid = C.bodyLift + C.bodySize[2] / 2, yaw = -pose.heading, fwd = -mid * Math.sin(fl.pitch), side = mid * Math.sin(fl.roll);
        c.facing.rotation.y = fl.pitch;
        c.facing.rotation.x = pose.lean + fl.roll;
        c.facing.rotation.z = yaw + fl.yaw;
        c.facing.position.set(fwd * Math.cos(yaw) - side * Math.sin(yaw), fwd * Math.sin(yaw) + side * Math.cos(yaw) + emo.shake, pose.bob + emo.hop + fl.lift + mid * (2 - Math.cos(fl.pitch) - Math.cos(fl.roll)));
        const sq = pose.squash * fl.squash, grow = 1 + emo.pop;                  // squash and stretch keep the volume; the capture pop scales the whole body
        c.facing.scale.set(grow / Math.sqrt(sq), grow / Math.sqrt(sq), grow * sq);

        c.setAngel(0, 0);
        const throwing = arms.get(p.id);                                                  // the arm swings to the throw; the character's frame is turned by its heading, so rotate the world direction into it
        c.setArm(throwing ? { dx: throwing.dx * Math.cos(pose.heading) + throwing.dz * Math.sin(pose.heading), dy: throwing.dx * Math.sin(pose.heading) - throwing.dz * Math.cos(pose.heading), wind: throwing.wind, rel: throwing.rel } : null);
        c.feet[0].position.x = 0.04 + pose.stepL; c.feet[1].position.x = 0.04 + pose.stepR;
        for (const eye of c.eyes) { eye.scale.z = 1.05 * pose.blink * emo.eyeOpen; eye.scale.x = 0.8 * emo.eyeWide; eye.scale.y = emo.eyeWide; }
        for (const pupil of c.pupils) { pupil.visible = pose.blink > 0.45; pupil.scale.setScalar(emo.pupil); }
        if (c.decor) wiggle(c.decor, st.phase / 3 + v.nowMs / 900, Math.min(1.4, Math.hypot(p.x - p.px, p.y - p.py) * 0.1 * 30 / 8));
        if (!chainsHeld && reseed.delete(p.id) && p.captives.length) {        // the whole chain stands in a line behind its captor, whatever path the replay rewound it along
          const ch = chainOf(p.id), t = new Trail(CHAIN.historyStep), len = captiveDistance(p.captives.length) + CHAIN.historyMargin;
          for (let d = len; d > 0; d -= CHAIN.historyStep) t.push(pose.x - Math.cos(pose.heading) * d, pose.y - Math.sin(pose.heading) * d);
          ch.trail = t;
        }
        if (!chainsHeld) updateChain(p, { x: pose.x, y: pose.y, speed: Math.min(1, Math.hypot(p.x - p.px, p.y - p.py) / (TICK_MS / 1000) / C.runSpeedRef), phase: st.phase, scale: pose.scale }, v);
        c.setCrown(p.id === leader);
        if (p.id === leader) c.crown.position.z = C.crownLift + Math.sin(v.nowMs / 300) * 0.04;
      }
      // a dead captor's chain is dropped only after everyone has been posed, so a captor that just took over its captives can adopt them first
      for (const [id, ch] of chains) if (!game.players[id - 1]?.alive) { for (const f of ch.followers) { if (f.leaveAt < 0 && takenBySomeoneElse(f.victim, id)) angelize(f, v); else freeFollower(f); } chains.delete(id); }
    },
    /** Build every player's character now (not on first sight), so the renderer can compile its shaders before play starts. */
    /** Make this player do its flip trick now (a hop with a somersault). */
    flip(id: number, nowMs: number, kind: FlipKind = 'front') { flipping.set(id, { start: nowMs, kind }); },
    prime() { for (const p of game.players) charFor(p.id); },
    dying: () => dying.size,
    dispose() { for (const { c } of chars.values()) c.dispose(); chars.clear(); for (const ch of chains.values()) for (const f of ch.followers) freeFollower(f); chains.clear(); },
  };
}
export type Rig = ReturnType<typeof createRig>;
