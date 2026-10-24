// The one object the game talks to. There is no music and no ambient layer: sound happens only when something
// happens. Every cue is throttled, so repeating events (crossing several territories) can't machine-gun.
import { createSfx } from './sfx.ts';
import { createSynth } from './synth.ts';

export interface Sound {
  unlock(): void;
  setYouTubeEnabled(on: boolean): void;   // YouTube's own audio setting: must always be respected
  toggleMute(): boolean;                  // returns true when sound is now audible
  audible(): boolean;
  setPaused(p: boolean): void;
  onAudibleChange(cb: (audible: boolean) => void): void;          
  start(): void;
  capture(claimed: number): void;
  cut(): void;
  death(): void;
  win(): void;
  clash(pan?: number, vol?: number): void;
  flip(variant?: number): void;
  leaveHome(): void;
  enemyLand(): void;
  /** Call every few ticks with whether you are standing on someone else's land: the warning chime repeats until you leave it. */
  warning(active: boolean): void;
  intruder(pan: number, vol: number): void;
  landLost(): void;
  crown(): void;
  milestone(index: number): void;
  otherCapture(claimed: number, pan: number, vol: number): void;   // pan -1..1, vol 0..1 from distance
  otherKill(pan: number, vol: number): void;
  shield(): void;                         // your safe-zone shield comes on
}

/** Minimum gap (seconds) between two plays of the same cue. */
/** How often the warning chime repeats while you stay on someone else's land (seconds). */
const WARNING_EVERY = 1.3;
const COOLDOWN: Record<string, number> = { leaveHome: 0.12, enemyLand: 0.45, intruder: 0.35, landLost: 0.3, crown: 1, otherCapture: 0.08, otherKill: 0.08 };

export function createSound(): Sound {
  const synth = createSynth();
  const sfx = createSfx(synth);
  let ytOn = true, userMuted = false, paused = false;
  const listeners: Array<(a: boolean) => void> = [];
  const lastPlay = new Map<string, number>();
  let lastWarn = -Infinity;

  const audible = () => ytOn && !userMuted && !paused;
  const apply = () => { synth.setLevels(audible()); for (const cb of listeners) cb(audible()); };

  /** Wrap a cue so it can't repeat faster than its cooldown. */
  const throttled = <A extends unknown[]>(name: string, fn: (...a: A) => void) => (...a: A) => {
    const ctx = synth.ctx();
    if (ctx) {
      const last = lastPlay.get(name) ?? -Infinity;
      if (ctx.currentTime - last < (COOLDOWN[name] ?? 0)) return;
      lastPlay.set(name, ctx.currentTime);
    }
    fn(...a);
  };

  return {
    unlock() {
      if (!synth.ensure()) return;
      apply();
    },
    setYouTubeEnabled(on) { ytOn = on; apply(); },
    toggleMute() { userMuted = !userMuted; apply(); return audible(); },
    audible,
    setPaused(p) { paused = p; apply(); synth.setPaused(p); },
    onAudibleChange(cb) { listeners.push(cb); },
    start: sfx.start, flip: sfx.flip, capture: sfx.capture, cut: sfx.cut, death: sfx.death, win: sfx.win, clash: sfx.clash,
    leaveHome: throttled('leaveHome', sfx.leaveHome),
    enemyLand: (() => { const play = throttled('enemyLand', sfx.enemyLand); return () => { const c = synth.ctx(); if (c) lastWarn = c.currentTime; play(); }; })(),
    warning(active) {
      const c = synth.ctx();
      if (!c || !active || !audible() || c.currentTime - lastWarn < WARNING_EVERY) return;      // the chime that marked stepping on it counts as the first
      lastWarn = c.currentTime; sfx.enemyLand();
    },
    intruder: throttled('intruder', sfx.intruder), landLost: throttled('landLost', sfx.landLost),
    crown: throttled('crown', sfx.crown), milestone: sfx.milestone,
    otherCapture: throttled('otherCapture', sfx.otherCapture), otherKill: throttled('otherKill', sfx.otherKill),
    shield: sfx.shield,
  };
}
