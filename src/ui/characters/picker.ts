// The character picker that lives on the start panel: [<] a small live 3D character [>] and its name, next to "play".
// Arrows (or the keyboard) flip through the cast and the choice applies at once; there is no separate screen.
// Hovering the character tickles it: a quick little giggle (on a touch screen a tap pokes it, see stage.ts).
import { SPECIES, speciesById } from '../../render3d/index.ts';
import { $ } from '../dom.ts';
import { chosenCharacter } from './store.ts';
import { createStage, type Stage } from './stage.ts';
import { PICKER } from './tuning.ts';

/** Which way a key press should flip the character: -1 (left arrow), 1 (right arrow) or 0 (not ours: another key, a shortcut, or typing in a field). */
export function characterKeyStep(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null }): -1 | 0 | 1 {
  if (e.ctrlKey || e.metaKey || e.altKey) return 0;
  const tag = (e.target?.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return 0;     // the arrows move the caret while typing a search
  return e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
}

/** `gate` locks characters you have not earned yet: you can look at them, but choosing one needs its points. */
export function createCharacterPicker(onChosen: (id: string) => void, gate?: { costOf(index: number): number; points(): number }) {
  const host = $('charStage'), nameEl = $('charName'), prev = $<HTMLButtonElement>('charPrev'), next = $<HTMLButtonElement>('charNext');
  let index = Math.max(0, SPECIES.findIndex(s => s.id === speciesById(chosenCharacter.get()).id));
  let stage: Stage | null = createStage(host, { compact: true });

  const render = (animate: boolean, apply: boolean) => {
    const sp = SPECIES[index];
    const cost = gate?.costOf(index) ?? 0, locked = !!gate && gate.points() < cost;
    nameEl.textContent = locked ? `${sp.name} · ${cost} points` : sp.name;
    host.classList.toggle('locked', locked);
    nameEl.classList.remove('pop'); void nameEl.offsetWidth; nameEl.classList.add('pop');      // replay the little pop on every change
    stage?.show(sp.id, animate);
    if (apply && !locked) { chosenCharacter.set(sp.id); onChosen(sp.id); }
  };
  const go = (step: number) => { index = (index + step + SPECIES.length) % SPECIES.length; render(true, true); };

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  // hover tickles: once when the pointer arrives, and again now and then while it keeps moving over the character
  let lastTickle = -Infinity;
  const tickle = () => { const now = performance.now(); if (now - lastTickle >= PICKER.tickleEveryMs) { lastTickle = now; stage?.tickle(); } };
  host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') tickle(); });
  host.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') tickle(); });
  // the left and right arrow keys flip through the characters whenever the start panel is showing (not while typing a search)
  window.addEventListener('keydown', e => {
    const step = characterKeyStep({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as HTMLElement | null });
    if (!step) return;
    if (!$('charPick').offsetParent) return;                // the start panel is not on screen (the game is running): the arrows steer instead
    go(step); e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  if (!stage) host.hidden = true;                           // no WebGL: the name and arrows still work
  render(false, false);
  return {
    /** Points changed (a goal was met, a country conquered): show lock states again. */
    refresh() { render(false, false); },
    /** The game is running: give back the preview's GPU context. */
    suspend() { stage?.dispose(); stage = null; },
    /** Back on the start panel: bring the preview back, already showing the chosen character. */
    resume() { if (stage) return; stage = createStage(host, { compact: true }); host.hidden = !stage; stage?.show(SPECIES[index].id, false); },
  };
}
