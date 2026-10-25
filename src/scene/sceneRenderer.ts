// Composes the layers of one arena into the shell's single scene and draws a frame. This is the part the rest of the game talks to: it
// follows the player with the camera controller, rebuilds what changed, interpolates everything between 30 Hz logic ticks, and turns game
// events into effects. Each layer lives in its own module.
import { CAMERA, REPLAY } from '../config.ts';
import type { Game, Player } from '../game/index.ts';
import { DEATH, deathPose } from '../render3d/death.ts';
import { createCameraController } from '../render/cameraController.ts';
import { createEffects } from '../render/effects.ts';
import { colorOf } from '../render/palette.ts';
import { pxPerCell } from '../render/quality.ts';
import type { Characters3D } from '../render3d/index.ts';
import { createFloor3D } from './floor3d.ts';
import { createShield3D } from './shield3d.ts';
import { createFloatText, createNameTags } from './overlays.ts';
import { createParticles3D } from './particles3d.ts';
import { createHistory, replayAlive, replaySpeed, SNAP_STRIDE } from './replay.ts';
import type { Shell } from './shell.ts';
import { createSlash3D, isThrow, pointAlong, SLASH, throwDuration, throwProgress } from './slash3d.ts';
import { createTerritory3D } from './territory3d.ts';
import { createTrail3D } from './trail3d.ts';

export interface Renderer {
  frame(f: number, dtMs: number, nowMs: number): void;
  /** Remove everything this renderer put in the scene (so a new arena can be set up). */
  destroy(): void;
  /** 0 = full effects, 1 = fewer particles, 2 = minimal (used when the device is struggling). */
  setQuality?(level: number): void;
  captureFx(p: Player, claimed: number[], takenFrom?: Map<number, number[]>): void;
  /** A player died with no captor: their land dissolves from where they fell instead of vanishing. */
  clearFx(victim: Player, cells: number[]): void;
  /** A player switched their safe-zone shield on: a ring and a burst of sparkles. */
  dashFx(p: Player): void;
  shieldFx(p: Player): void;
  /** `killer` is who took them out (null for an accident): a plane slash plays when there is one. */
  killFx(victim: Player, killer?: Player | null, reason?: string): void;
  /** The human was just taken out: after a beat, replay the hit in slow motion (only if somebody did it). */
  replayFx(): void;
  /** How long until the respawn should wait for the replay (0 = no replay). */
  replayMs(): number;
  /** True while something is playing that needs frames drawn even though the game is stopped. */
  animating(): boolean;
  winFx(): void;
  /** The human's flip trick: sparkles at take-off and again where it lands. */
  flipFx(p: Player): void;
  /** The ground rectangle (cells) the screen shows, for the minimap. */
  camera(): { x: number; y: number; w: number; h: number };
  /** The ground point (cell x, cell y) under a screen position (CSS px), for steering. */
  groundAt(sx: number, sy: number): { x: number; y: number } | null;
}

let lastClashAt = -1e9;
const HIT_BUZZ = [70, 35, 160], STAR_BUZZ = [35, 20, 45];      // the killing hit thumps; each earlier star of the volley is a short tick

export function createSceneRenderer(shell: Shell, overlayHost: HTMLElement, game: Game, characters: Characters3D): Renderer {
  const floor = createFloor3D(game);
  const territory = createTerritory3D(game);
  const trails = createTrail3D(game);
  const particles = createParticles3D();
  const shields = createShield3D(game);
  const slash = createSlash3D(
    (x, y, scale) => { particles.burst(x, y, 0xffffff, Math.round(9 * scale), 5.5, 0.22); particles.burst(x, y, 0xd9e6f5, Math.round(6 * scale), 3, 0.3); particles.ring(x, y, 0xffffff, 1.5 * scale, 380); },
    (x, y, scale) => { particles.burst(x, y, 0xffffff, Math.round(5 * scale), 3, 0.18); },      // a puff off the thrower's hand
    { set: (id, dx, dy, wind, rel) => characters.setArm(id, dx, dy, wind, rel), clear: id => characters.clearArm(id), hand: id => characters.handAt(id) },
  );
  const tags = createNameTags(game, overlayHost);
  const floats = createFloatText(overlayHost);
  const camera = createCameraController({ x: game.NX / 2, y: game.NY / 2 });
  const effects = createEffects(game, particles, camera);
  territory.prewarm();

  shell.root.add(floor.group, territory.group, trails.group, shields.group, slash.gfx.mesh, characters.group, particles.group);
  const timers = new Set<number>();

  /** The dust, dizzy stars and final puff of a death, timed to the pose animation (`slow` = 1 in real time; a slowed replay stretches the delays). */
  const deathFx = (x: number, y: number, heading: number, id: number, slow = 1, delay = 0) => {
    const col = colorOf(id), at = (u: number) => { const d = deathPose(u, heading); return [x + d.dx, y + d.dy] as const; };
    const later = (u: number, fn: () => void) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, (u * DEATH.ms) * slow + delay); timers.add(t); };
    for (const u of DEATH.sparklesAt) later(u, () => { const [px, py] = at(u); particles.sparkle(px, py, 0xffe27a, 6, 1.8, 0.7); particles.sparkle(px, py, 0xffffff, 4, 1.2, 0.6); });      // golden glints rising off the angel
    later(DEATH.poofAt, () => { const [px, py] = at(DEATH.poofAt); particles.burst(px, py, col, 14, 4.2, 0.46); particles.burst(px, py, 0xffffff, 9, 2.2, 0.6); particles.ring(px, py, col, 2.2, 520); });
  };

  const history = createHistory();
  const snapshot = (f: number) => {
    const v = new Float32Array(game.players.length * SNAP_STRIDE);
    game.players.forEach((p, i) => { v[i * 4] = p.px + (p.x - p.px) * f; v[i * 4 + 1] = p.py + (p.y - p.py) * f; v[i * 4 + 2] = p.angle; v[i * 4 + 3] = p.alive ? 1 : 0; });
    return v;
  };
  // the fatal hit: who did it and whether it was thrown, then (after a beat) the replay itself
  let fatal: { killer: number; far: boolean; t: number; path: number[]; stars: number; chain: number[]; killerChain: number[] } | null = null;
  // the human's open line over the last moments: a kill reassigns p.path to [], so the replay redraws it from these (the array object itself survives the kill)
  const pathLog: Array<{ t: number; len: number; path: number[] }> = [];
  const pathLenAt = (t: number, path: number[]) => {
    let len = 0;
    for (const e of pathLog) { if (e.t > t) break; len = e.path === path ? e.len : 0; }
    return len;
  };
  let pending: { startAt: number } | null = null;
  let replay: { g: number; r: number; clock: number; hitT: number; killer: number; far: boolean; next: number; stars: number; members: Array<[number, number]>; landG: number; fx: boolean; route: { pts: number[]; cum: number[] } | null; saved: Array<{ x: number; y: number; px: number; py: number; angle: number; pa: number; alive: boolean; path: number[] }>; buf: Float32Array } | null = null;
  const tag = document.createElement('div');
  tag.className = 'replay-tag';
  tag.textContent = 'replay';
  overlayHost.appendChild(tag);
  const restore = () => {
    if (!replay) return;
    game.players.forEach((p, i) => { const o = replay!.saved[i]; if (o) Object.assign(p, o); });
    replay = null; tag.classList.remove('on'); overlayHost.classList.remove('replaying'); characters.holdChains(false); characters.setReplayChain(1, null); if (fatal?.killer) characters.setReplayChain(fatal.killer, null);
  };
  let nextPing = 0;                                                       // replay time (ms) of the next pulse around whoever got you
  const begin = (nowMs: number) => {
    if (!fatal || history.length < 2) return;
    slash.clear();
    replay = {
      g: -REPLAY.lookBackMs, r: 0, clock: nowMs, hitT: fatal.t, killer: fatal.killer, far: fatal.far, next: fatal.far ? fatal.stars - 1 : 0, stars: fatal.far ? fatal.stars : 1, members: [], landG: fatal.far ? SLASH.windupMs + REPLAY.throwFlyMs + (fatal.stars - 1) * REPLAY.starGapMs : fatal.killer ? SLASH.planeMs * 0.45 : 0, fx: false, route: null,
      saved: game.players.map(p => ({ x: p.x, y: p.y, px: p.px, py: p.py, angle: p.angle, pa: p.pa, alive: p.alive, path: p.path })),
      buf: new Float32Array(game.players.length * SNAP_STRIDE),
    };
    characters.holdChains(true); characters.setReplayChain(1, fatal.chain);      // both chains stand behind their owners through the replay, as they were, until the hit takes the victim's
    if (fatal.killer) characters.setReplayChain(fatal.killer, fatal.killerChain);
    nextPing = 0;
    tag.classList.add('on'); overlayHost.classList.add('replaying');      // the replay is just the scene and the replay mark: every other icon and label is hidden
  };
  const haptic = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not allowed (no tap yet) or unsupported */ } };
  /** The way a star travels: along the victim's own line from where the thrower touched it to the victim's head (null with no line to follow). */
  const trailRoute = (path: number[], qx: number, qy: number, hx: number, hy: number): number[] | null => {
    if (path.length < 4) return null;
    let bi = 0, bd = Infinity, bx = path[0], by = path[1];
    for (let i = 0; i + 3 < path.length; i += 2) {
      const ax = path[i], ay = path[i + 1], dx = path[i + 2] - ax, dy = path[i + 3] - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / l2)) : 0, cx = ax + t * dx, cy = ay + t * dy, d = Math.hypot(qx - cx, qy - cy);
      if (d < bd) { bd = d; bi = i; bx = cx; by = cy; }
    }
    const route = [bx, by];
    for (let i = bi + 2; i < path.length; i += 2) route.push(path[i], path[i + 1]);
    route.push(hx, hy);
    return route;
  };
  const routeLength = (r: number[]) => { let l = 0; for (let i = 2; i < r.length; i += 2) l += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]); return l; };
  const lastCaptives: number[][] = [];                                    // who each player held as of the last frame: a kill hands them to the captor in the same tick
  const lastPath: number[][] = [];                                        // each player's open line as of the last frame: a kill reassigns p.path to [], this array object survives it
  /** Throw star `j` of the volley (0 lands on the hit and carries the impact; the rest land `j` gaps earlier), along the human's own line when there is one. */
  const launchStar = (R: NonNullable<typeof replay>, j: number) => {
    const vp = R.saved[0], kp = game.players[R.killer - 1];
    R.members = characters.chainMembers(1);
    history.sample(R.hitT, R.buf);
    const ko = (R.killer - 1) * SNAP_STRIDE, kx = R.buf[ko], ky = R.buf[ko + 1], ka = R.buf[ko + 2];
    let route: number[] | undefined;
    if (kp && fatal) route = trailRoute(fatal.path, R.buf[ko], R.buf[ko + 1], vp.x, vp.y) ?? undefined;
    if (j === 0) {                                                        // the camera rides this star's path
      const pts = route ?? [kx, ky, vp.x, vp.y], cum = [0];
      for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      R.route = { pts, cum };
    }
    if (!kp) return;
    if (!R.far) { if (j === 0) slash.add(vp.x, vp.y, ka, colorOf(1), true); return; }
    const target = j === 0 ? undefined : R.members[j - 1] ?? [vp.x, vp.y];     // star 0 hits you; every other star hits one member of your chain, once
    haptic(12); camera.kick(0.12);                                        // each star leaves the hand with a tick and a small shake
    const onLand = () => { haptic(j === 0 ? HIT_BUZZ : STAR_BUZZ); if (j) { camera.kick(0.5); particles.burst(target![0], target![1], colorOf(1), 12, 5, 0.34); particles.ring(target![0], target![1], 0xffffff, 1.8, 380); return; } camera.kick(1); particles.burst(vp.x, vp.y, 0xffffff, 18, 7, 0.3); particles.burst(vp.x, vp.y, colorOf(R.killer), 14, 5, 0.36); particles.ring(vp.x, vp.y, 0xffffff, 3.2, 520); };
    slash.addThrow(kx, ky, target ? target[0] : vp.x, target ? target[1] : vp.y, colorOf(1), true, { flyMs: REPLAY.throwFlyMs, dramatic: true, thrower: R.killer, route: target ? undefined : route, onLand });
  };
  /** Put every player where they were `replay.g` ms from the hit. */
  const pose = (R: NonNullable<typeof replay>) => {
    history.sample(R.hitT + Math.min(0, R.g), R.buf);
    const hit = R.g >= R.landG;                                         // you stay standing until the star lands
    game.players.forEach((p, i) => {
      const o = i * SNAP_STRIDE;
      p.x = p.px = R.buf[o]; p.y = p.py = R.buf[o + 1]; p.angle = p.pa = R.buf[o + 2];
      p.alive = replayAlive(R.g, R.landG, i === 0, R.buf[o + 3] > 0.5, R.saved[i].alive);      // you stay alive until the star lands, then it is the real outcome: the angel forms after the hit
      if (i === 0) p.path = hit || !fatal ? R.saved[0].path : fatal.path.slice(0, pathLenAt(R.hitT + R.g, fatal.path));      // your line stays on the floor until the hit, then fades as it always does
    });
  };

  return {
    setQuality(level) { particles.setDensity(level === 0 ? 1 : level === 1 ? 0.45 : 0.15); },
    destroy() {
      restore(); tag.remove();
      for (const t of timers) clearTimeout(t);
      shell.root.remove(floor.group, territory.group, trails.group, shields.group, slash.gfx.mesh, characters.group, particles.group);
      floor.dispose(); territory.dispose(); trails.dispose(); particles.dispose(); shields.dispose(); slash.gfx.dispose(); tags.dispose(); floats.dispose();
    },
    frame(f, dtMs, nowMs) {
      if (pending && !replay && nowMs >= pending.startAt) { pending = null; begin(nowMs); }
      let sdt = dtMs, snow = nowMs, rf = f;
      if (replay) {
        const R = replay, speed = replaySpeed(R.g);
        sdt = dtMs * speed; R.g += sdt; R.r += dtMs; R.clock += sdt; snow = R.clock; rf = 1;
        while (R.next >= 0 && R.g >= (R.stars - 1 - R.next) * REPLAY.starGapMs) launchStar(R, R.next--);      // the throw starts the moment the opponent touches your line (g = 0), as it did live
        if (R.fx && R.g >= R.landG + DEATH.ms + 60) characters.holdChains(false);      // the angel has gone: now the capture chain forms, the victim joining its captor's line
        if (R.g >= R.landG && !R.fx) { R.fx = true; const v = R.saved[0]; deathFx(v.x, v.y, v.angle, 1, 1 / replaySpeed(R.landG + DEATH.ms / 2)); }
        if (R.r >= REPLAY.ms) restore(); else pose(R);
      } else if (game.running) {
        history.push(nowMs, snapshot(f));
        for (const q of game.players) { lastPath[q.id] = q.path; lastCaptives[q.id] = q.captives.slice(); }
        const mine = game.players[0];
        if (mine) { pathLog.push({ t: nowMs, len: mine.path.length, path: mine.path }); while (pathLog.length > 2 && pathLog[1].t < nowMs - REPLAY.lookBackMs - 400) pathLog.shift(); }
      }
      const { w: W, h: H } = shell.size();
      const me = game.players[0];
      const thrower = replay && replay.killer ? game.players[replay.killer - 1] : undefined;
      let frame: { x: number; y: number; minView?: number; followMs?: number } | null = null;
      if (replay && me) {                                                     // the camera rides the throw: thrower, then along the star's path, then you
        const R = replay, mx = me.x, my = me.y;
        let fx = mx, fy = my;
        if (thrower) {
          const W0 = SLASH.windupMs, F = REPLAY.throwFlyMs;
          if (R.g < 0 || !R.far) { fx = (mx + thrower.x) / 2; fy = (my + thrower.y) / 2; }                       // the approach: both of you in view
          else if (R.g < W0) { fx = thrower.x; fy = thrower.y; }                                                  // the wind-up: on the thrower
          else if (R.route && R.g < W0 + F) [fx, fy] = pointAlong(R.route.pts, R.route.cum, throwProgress((R.g - W0) / F));   // the flight: along your line
        }
        const d = thrower ? Math.hypot(thrower.x - mx, thrower.y - my) : 0;
        frame = { x: fx, y: fy, minView: thrower ? Math.max(CAMERA.baseView * 1.15, Math.min(CAMERA.baseView * 2.2, d * 0.8 + 12)) : undefined, followMs: 140 };
        if (thrower && !R.far && R.r >= nextPing && R.g < R.landG + 700) {       // a close hit: pulse rings round whoever got you, so they cannot be missed even when they stand right on top of you
          nextPing = R.r + 520;
          particles.ring(thrower.x, thrower.y, colorOf(R.killer), 3.4, 760);
          particles.ring(thrower.x, thrower.y, 0xffffff, 1.9, 520);
        }
      } else if (me && me.alive) frame = { x: me.px + (me.x - me.px) * rf, y: me.py + (me.y - me.py) * rf };
      camera.update(me && frame ? {
        x: frame.x, y: frame.y, angle: me.angle, minView: frame.minView, followMs: frame.followMs,
        moving: replay ? 0 : Math.min(1, Math.hypot(me.x - me.px, me.y - me.py) / 0.2), cells: game.counts[1],
      } : null, dtMs, W, H);
      shell.applyPose(camera.pose(), camera.shakeOffset(), camera.scale);
      particles.setView(shell.renderer.domElement.height, shell.fovDeg);
      territory.sync(); territory.update(dtMs);
      trails.setReplay(replay?.route?.pts ?? null, !!replay);
      trails.update(rf); if (!replay) trails.fade(dtMs);      // the cut line stays on the floor for the whole replay, then fades
      characters.frame({ f: rf, dtMs: sdt, nowMs: snow, scale: camera.scale, baseScale: pxPerCell(W, H, CAMERA.baseView) });
      effects.dust(sdt);
      particles.update(sdt);
      slash.update(sdt, camera.scale);
      shields.update(nowMs, f);
      tags.update(f, shell);
      floats.update(dtMs, f, shell);
      shell.render();
    },
    captureFx: (p, claimed, takenFrom) => { effects.capture(p, claimed); territory.reveal(claimed, takenFrom, p.x, p.y, lastPath[p.id]); },
    killFx(victim, killer, reason) {
      const by = killer && killer !== victim ? killer : null;
      if (by && reason?.startsWith('head-on')) {                      // face to face: one shared impact (a tie kills both, so only the first call shows it)
        const now = performance.now();
        if (now - lastClashAt > 120) { lastClashAt = now; effects.clash(victim, by); if (victim.id === 1 || by.id === 1) haptic(HIT_BUZZ); }
      }
      const members = by ? characters.chainMembers(victim.id) : [];
      const chainIds = lastCaptives[victim.id] ?? [];
      const stars = by ? 1 + Math.max(members.length, victim.id === 1 ? chainIds.length : 0) : 1;      // one star for every member of the victim's chain, each hitting its own member once, then the one that hits the victim
      if (victim.id === 1) { history.push(performance.now(), snapshot(1), true); fatal = { path: pathLog.length ? pathLog[pathLog.length - 1].path : [], killer: by ? by.id : 0, far: by ? isThrow(Math.hypot(by.x - victim.x, by.y - victim.y)) || stars > 1 : false, t: performance.now(), stars, chain: lastCaptives[victim.id] ?? [], killerChain: by ? lastCaptives[by.id] ?? [] : [] }; }   // every end gets a replay, with the plane only when somebody threw it
      if (!by) { effects.kill(victim); deathFx(victim.x, victim.y, victim.angle, victim.id); return; }
      const strong = by.id === 1, far = Math.hypot(by.x - victim.x, by.y - victim.y), thrown = isThrow(far) || stars > 1;
      // the victim stands still until the knife lands, so you can see what hit them; only then do they fly
      const route = thrown ? trailRoute(lastPath[victim.id] ?? [], by.x, by.y, victim.x, victim.y) : null;
      const flyMs = thrown ? throwDuration(route ? routeLength(route) : far) : 0;
      const wait = thrown ? SLASH.windupMs + flyMs + (stars - 1) * REPLAY.starGapMs : SLASH.planeMs * 0.45;
      characters.delayDeath(victim.id, wait);
      const t = window.setTimeout(() => { timers.delete(t); effects.kill(victim); }, wait); timers.add(t);
      deathFx(victim.x, victim.y, victim.angle, victim.id, 1, wait);
      if (thrown) for (let k = 0; k < stars; k++) {
        const last = k === stars - 1, member = last ? undefined : members[k] ?? [victim.x, victim.y];      // the last star hits the victim itself, every earlier one a member of its chain
        const fire = () => slash.addThrow(by.x, by.y, member ? member[0] : victim.x, member ? member[1] : victim.y, colorOf(victim.id), strong, { flyMs, thrower: by.id, route: last ? route ?? undefined : undefined, onLand: () => { if (member) particles.burst(member[0], member[1], colorOf(victim.id), 9, 4, 0.32); if (victim.id === 1) { haptic(last ? HIT_BUZZ : STAR_BUZZ); camera.kick(last ? 0.8 : 0.3); } } });
        if (k === 0) fire(); else { const ft = window.setTimeout(() => { timers.delete(ft); fire(); }, k * REPLAY.starGapMs); timers.add(ft); }
      }      // from a distance the knife is THROWN
      else {
        slash.add(victim.x, victim.y, by.angle, colorOf(victim.id), strong);                    // up close it is swung
        if (victim.id === 1) { const ht = window.setTimeout(() => { timers.delete(ht); haptic(HIT_BUZZ); camera.kick(0.8); }, wait); timers.add(ht); }
      }
    },
    replayFx() { if (fatal && !replay) pending = { startAt: performance.now() + REPLAY.startDelayMs }; },
    replayMs: () => (fatal ? REPLAY.startDelayMs + REPLAY.ms + REPLAY.afterMs : 0),
    animating: () => pending !== null || replay !== null,
    dashFx(p) {
      const bx = p.x - Math.cos(p.angle) * 0.6, by = p.y - Math.sin(p.angle) * 0.6;
      particles.burst(bx, by, 0xffffff, 10, 6, 0.28); particles.burst(bx, by, colorOf(p.id), 8, 4, 0.34);
      particles.ring(bx, by, 0xffd45c, 2.2, 480);
      if (p.id === 1) { haptic(25); camera.kick(0.2); }
    },
    shieldFx(p) {
      floats.pop('shield on', p);
      particles.ring(p.x, p.y, 0x3aa0ff, 2.4, 700); particles.ring(p.x, p.y, 0xffffff, 1.5, 450);
      particles.sparkle(p.x, p.y, 0x9bd9ff, 8, 4, 0.45);
      if (p.id === 1) camera.kick(0.15);
    },
    clearFx: (victim, cells) => territory.reveal(cells, new Map([[victim.id, cells]]), victim.x, victim.y),
    winFx: effects.win,
    flipFx(p) {
      const col = colorOf(p.id);
      floats.pop('flip +1', p);
      particles.sparkle(p.x, p.y, 0xfff35c, 6, 3.5, 0.5); particles.sparkle(p.x, p.y, 0x5cf5ff, 4, 4.5, 0.4);
      particles.burst(p.x, p.y, col, 8, 5, 0.34); particles.ring(p.x, p.y, 0xffffff, 1.6, 520);
      const t = window.setTimeout(() => {                                                                  // where it lands, a moment later
        timers.delete(t);
        if (p.alive) { particles.sparkle(p.x, p.y, 0xfff35c, 8, 4.5, 0.5); particles.sparkle(p.x, p.y, 0xffffff, 6, 3.5, 0.45); particles.burst(p.x, p.y, col, 8, 5, 0.34); particles.ring(p.x, p.y, col, 2.2, 600); }
      }, 620);
      timers.add(t);
    },
    camera: () => shell.bounds(),
    groundAt: (sx, sy) => shell.groundAt(sx, sy),
  };
}
