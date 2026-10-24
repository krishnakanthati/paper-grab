// A rare jump scare: a face lunges at the screen with a shake, a flash and a harsh sting. It is a DOM overlay (no assets: the face is
// inline SVG) and never touches the game, which keeps running underneath. The decision of WHEN is pure (`scareDue`) so it is testable.
import { storage } from '../platform/storage.ts';

export const SCARE = {
  graceMs: 15_000,          // nothing in the first stretch of a round: let the player settle in and feel safe
  cooldownMs: 120_000,      // at least this long between two scares
  chancePerCheck: 1 / 120,  // checked ~6 times a second while the moment is right (see `exposed`): about one scare per 20 s of exposure
  minTrail: 30,             // the moment is right when you are off your land with a line at least this many cells long: committed, far from home, eyes on the loop
  firstMinTrail: 6,         // the first scare of a round needs only a short line...
  firstChance: 1 / 12,      // ...and is far more likely, so it lands soon after the grace period (about 2 s of being out)
  showMs: 650,              // how long the face stays
} as const;

export interface ScareState { roundMs: number; sinceLastMs: number; trail: number; first?: boolean; }

/** Should a scare fire on this check? `roll` is a random number in [0, 1). It only ever hits while you are out on a long, unfinished line. */
export function scareDue(s: ScareState, roll: number, c: typeof SCARE | typeof TEST_SCARE = SCARE): boolean {
  return s.roundMs >= c.graceMs && s.sinceLastMs >= c.cooldownMs && (s.first ? s.trail >= SCARE.firstMinTrail && roll < SCARE.firstChance : s.trail >= c.minTrail && roll < c.chancePerCheck);
}

/** Open the page with `?scare=test` to see it quickly: no grace period, a short line is enough, and it fires within seconds. */
export const TEST_SCARE = { graceMs: 2000, cooldownMs: 6000, chancePerCheck: 1 / 6, minTrail: 3, showMs: SCARE.showMs } as const;

/** The game's own little creatures, wrong: a blob in a rival's colour, huge eyes with tiny pupils fixed on you, a far too wide jagged grin. */
const face = (color: string) => `<svg viewBox="0 0 200 200" aria-hidden="true">
<path d="M100 6C158 6 196 46 192 104C189 160 150 196 100 196C50 196 11 160 8 104C4 46 42 6 100 6Z" fill="${color}" stroke="#141824" stroke-width="6"/>
<ellipse cx="62" cy="76" rx="32" ry="40" fill="#fff" stroke="#141824" stroke-width="4"/><ellipse cx="138" cy="76" rx="32" ry="40" fill="#fff" stroke="#141824" stroke-width="4"/>
<circle cx="66" cy="82" r="5" fill="#141824"/><circle cx="134" cy="82" r="5" fill="#141824"/>
<path d="M22 126 Q100 112 178 126 Q172 190 100 192 Q28 190 22 126Z" fill="#141824"/>
<path d="M30 128 L46 150 L58 128 L74 156 L88 129 L100 158 L112 129 L126 156 L142 128 L154 150 L170 128" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="miter"/>
</svg>`;

export interface JumpScare {
  /** Call every few ticks while a round is running; `ms` is the real time since the previous call. */
  check(ms: number, ctx: { playing: boolean; trail: number; color: string }): void;
  /** Start of a new round: the grace period begins again. */
  reset(): void;
  fire(color?: string): void;
}

export function createJumpScare(host: HTMLElement, sting: () => void, random: () => number = Math.random): JumpScare {
  const el = document.createElement('div');
  el.id = 'scare'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
  host.appendChild(el);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cfg = new URLSearchParams(location.search).get('scare') === 'test' ? TEST_SCARE : SCARE;
  let roundMs = 0, sinceLastMs = 0, timer = 0, first = true;

  const fire = (color = '#ef4b4b') => {
    if (storage.get('noscare') === '1') return;
    sinceLastMs = 0; first = false;
    sting();
    el.innerHTML = face(color);
    el.style.setProperty('--scare', color);
    el.hidden = false;
    el.classList.remove('go'); void el.offsetWidth;              // restart the animation if it ever overlaps
    el.classList.toggle('calm', reduced.matches);                // reduced motion: a plain fade, no shake or flash
    el.classList.add('go');
    clearTimeout(timer);
    timer = window.setTimeout(() => { el.hidden = true; el.classList.remove('go'); }, SCARE.showMs);
  };
  return {
    check(ms, { playing, trail, color }) {
      if (!playing) return;
      roundMs += ms; sinceLastMs += ms;
      if (scareDue({ roundMs, sinceLastMs, trail, first }, random(), cfg)) fire(color);
    },
    reset() { roundMs = 0; first = true; sinceLastMs = cfg.cooldownMs; },
    fire,
  };
}
