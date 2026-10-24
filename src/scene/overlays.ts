// Small pieces of the interface that follow things in the scene, as plain DOM (crisp text at any zoom, nothing to rasterise per frame):
// name tags that float above heads, and the pointers at the screen edge that show where an off-screen beacon is.
import { NAME_TAG, nameOf } from '../config.ts';
import type { Game } from '../game/index.ts';
import { colorOf, css, darken } from '../render/palette.ts';
import { CHARACTER as C } from '../render3d/tuning.ts';
import { BEACON_LOOK, pointerFor } from './markers3d.ts';
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

export function createBeaconPointers(game: Game, host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'pointer-layer'; box.setAttribute('aria-hidden', 'true');
  mount(host, box);
  const els = new Map<number, HTMLElement>();
  const L = BEACON_LOOK.pointer;
  return {
    box,
    update(nowMs: number, shell: Shell) {
      const { w, h } = shell.size(), live = new Set<number>();
      for (const b of game.beacons) {
        live.add(b.id);
        let el = els.get(b.id);
        if (!el) { el = document.createElement('div'); el.className = 'beacon-pointer'; el.innerHTML = '<i></i>'; box.appendChild(el); els.set(b.id, el); }
        const s = shell.project(b.x, 1, b.y), ptr = pointerFor(s.x, s.y, w, h, L.inset);
        if (!ptr) { el.style.display = 'none'; continue; }
        const pulse = 1 + 0.12 * Math.sin(nowMs / 1000 * Math.PI * 2 * L.pulseHz);
        el.style.display = '';
        el.style.transform = `translate(${ptr.x.toFixed(1)}px,${ptr.y.toFixed(1)}px) translate(-50%,-50%) scale(${pulse.toFixed(3)})`;
        (el.firstElementChild as HTMLElement).style.transform = `rotate(${ptr.angle}rad)`;
      }
      for (const [id, el] of els) if (!live.has(id)) { el.remove(); els.delete(id); }
    },
    dispose() { box.remove(); },
  };
}
export type BeaconPointers = ReturnType<typeof createBeaconPointers>;
