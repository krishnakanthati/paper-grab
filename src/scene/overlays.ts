// Small pieces of the interface that follow things in the scene, as plain DOM (crisp text at any zoom, nothing to rasterise per frame):
// name tags that float above heads and text that pops up above them.
import { NAME_TAG, nameOf } from '../config.ts';
import type { Game } from '../game/index.ts';
import { colorOf, css, darken } from '../render/palette.ts';
import { CHARACTER as C } from '../render3d/tuning.ts';
import type { Shell } from './shell.ts';

/** Put an overlay layer right after the canvas, so the interface (progress bar, minimap, panels) draws above it. */
function mount(host: HTMLElement, box: HTMLElement) {
  const first = host.firstElementChild;
  if (first && typeof host.insertBefore === 'function') host.insertBefore(box, first.nextSibling); else host.appendChild(box);
}

export function createNameTags(game: Game, host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'tag-layer'; box.setAttribute('aria-hidden', 'true');
  mount(host, box);
  const tags: HTMLElement[] = [];
  const tagFor = (id: number) => {
    if (!tags[id]) {
      const el = document.createElement('span');
      el.className = 'name-tag'; el.textContent = nameOf(id).toLowerCase();
      el.style.cssText = `font:${NAME_TAG.fontWeight} ${NAME_TAG.fontSize}px/1 system-ui,sans-serif;opacity:${NAME_TAG.fillAlpha};-webkit-text-stroke:${NAME_TAG.strokeWidth}px ${css(darken(colorOf(id), NAME_TAG.strokeDarken))};`;
      box.appendChild(el); tags[id] = el;
    }
    return tags[id];
  };
  return {
    box,
    /** Place every tag above its head. `f` is how far between ticks we are. */
    update(f: number, shell: Shell) {
      const leader = game.leaderId();
      for (const p of game.players) {
        const el = tagFor(p.id);
        if (!p.alive) { el.style.display = 'none'; continue; }
        const hx = p.px + (p.x - p.px) * f, hz = p.py + (p.y - p.py) * f;
        const s = shell.project(hx, C.groundY + (p.id === leader ? NAME_TAG.leaderOffset : NAME_TAG.offset), hz);
        el.style.display = s.visible ? '' : 'none';
        el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;
      }
    },
    /** For tests: where the tag of a player is (screen px) after the last update. */
    dispose() { box.remove(); },
  };
}
export type NameTags = ReturnType<typeof createNameTags>;

/**
 * Floating text that pops above a character, rises and fades ("flip +1"): plain DOM, no box, with a stack of shadows that makes the letters
 * look like chunky 3D lettering. It follows the character while it is up.
 */
export const FLOAT_TEXT = { ms: 1200, riseCells: 2.4, startAbove: 1.5 };
export function createFloatText(host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'tag-layer'; box.setAttribute('aria-hidden', 'true');
  mount(host, box);
  const live: Array<{ el: HTMLElement; p: { x: number; y: number; px: number; py: number }; age: number }> = [];
  return {
    box,
    pop(text: string, p: { x: number; y: number; px: number; py: number }) {
      const el = document.createElement('span');
      el.className = 'float-3d'; el.textContent = text;
      box.appendChild(el); live.push({ el, p, age: 0 });
    },
    update(dtMs: number, f: number, shell: Shell) {
      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i], t = (it.age += dtMs) / FLOAT_TEXT.ms;
        if (t >= 1) { it.el.remove(); live.splice(i, 1); continue; }
        const rise = 1 - Math.pow(1 - t, 3), pop = t < 0.15 ? 0.4 + (t / 0.15) * 0.8 : t < 0.3 ? 1.2 - ((t - 0.15) / 0.15) * 0.2 : 1;      // springs up a little too big, then settles
        const hx = it.p.px + (it.p.x - it.p.px) * f, hz = it.p.py + (it.p.y - it.p.py) * f;
        const s = shell.project(hx, C.groundY + FLOAT_TEXT.startAbove + FLOAT_TEXT.riseCells * rise, hz);
        it.el.style.display = s.visible ? '' : 'none';
        it.el.style.opacity = String(t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35);
        it.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%) scale(${pop.toFixed(3)}) perspective(300px) rotateX(18deg)`;
      }
    },
    dispose() { box.remove(); },
  };
}
