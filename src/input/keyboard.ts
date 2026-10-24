// Keys. The arrow keys steer in 8 directions: hold two keys for a diagonal (the held directions are added together).
// Enter / Space start or restart, P / Escape pause, M mutes.
//
// Keys are matched by their PHYSICAL position (event.code), so the arrows work on any layout, and Shift or
// Caps Lock can never leave a key "stuck" (the key-up always matches the key-down). `event.key` is only a fallback
// for old browsers and virtual keyboards that report no code.
import type { Game } from '../game/index.ts';

export type GameRef = Game | (() => Game);
export const resolve = (g: GameRef): Game => (typeof g === 'function' ? g() : g);

type Dir = readonly [number, number];
const BY_CODE: Record<string, Dir> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
const BY_KEY: Record<string, Dir> = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
};
const ACTION_BY_CODE: Record<string, 'activate' | 'pause' | 'mute'> = {
  Enter: 'activate', NumpadEnter: 'activate', Space: 'activate', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};
const ACTION_BY_KEY: Record<string, 'activate' | 'pause' | 'mute'> = {
  enter: 'activate', ' ': 'activate', p: 'pause', escape: 'pause', m: 'mute',
};

export interface KeyActions {
  onGesture(): void;      // any key: lets audio start
  activate(): void;       // Enter / Space
  togglePause(): void;    // P / Escape
  toggleMute(): void;     // M
  flip?(): void;          // Space: the flip trick (as well as starting a round)
}

type Ev = Pick<KeyboardEvent, 'code' | 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'preventDefault'>;
const dirOf = (e: Ev): Dir | undefined => BY_CODE[e.code] ?? (e.code ? undefined : BY_KEY[(e.key ?? '').toLowerCase()]);
const actionOf = (e: Ev) => ACTION_BY_CODE[e.code] ?? (e.code ? undefined : ACTION_BY_KEY[(e.key ?? '').toLowerCase()]);
const idOf = (e: Ev) => e.code || (e.key ?? '').toLowerCase();

export function bindKeyboard(gameRef: GameRef, a: KeyActions) {
  const held = new Map<string, Dir>();
  let last = 0;                                            // the last heading chosen, kept when the held keys cancel out
  const steer = () => {
    let vx = 0, vy = 0;
    for (const [dx, dy] of held.values()) { vx += dx; vy += dy; }
    if (vx || vy) { last = Math.atan2(vy, vx); resolve(gameRef).setTarget(last); }   // opposite keys cancel; with nothing left, keep going the same way
  };
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;       // leave browser shortcuts alone
    a.onGesture();
    const dir = dirOf(e), act = actionOf(e);
    if (dir) {
      e.preventDefault();
      if (!held.has(idOf(e))) { held.set(idOf(e), dir); steer(); }
    } else if (act) {
      e.preventDefault();
      if (e.repeat) return;
      if (act === 'activate') { a.activate(); if (e.code === 'Space' || e.key === ' ') a.flip?.(); } else if (act === 'pause') a.togglePause(); else a.toggleMute();
    }
  });
  window.addEventListener('keyup', e => { if (held.delete(idOf(e))) steer(); });
  const releaseAll = () => held.clear();                   // never leave a key stuck when focus moves away
  window.addEventListener('blur', releaseAll);
  document.addEventListener?.('visibilitychange', () => { if (document.hidden) releaseAll(); });
  return { anyHeld: () => held.size > 0, lastHeading: () => last };
}
