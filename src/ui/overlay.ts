// The start / pause panel: a title, optional country picker, one main button, an optional second button, key hints.
// Enter / Space trigger whatever the main button does.
import { $ } from './dom.ts';

export interface OverlayOptions {
  title: string; text: string; button: string; onClick: () => void;
  showKeys?: boolean;
  picker?: boolean;                                   // show the country picker
  secondary?: { label: string; onClick: () => void }; // an optional second button under the main one
}

export function createOverlay() {
  const root = $('ov'), title = $('title'), sub = $('sub'), btn = $<HTMLButtonElement>('btn'), btnLabel = $('btnLabel'), btn2 = $<HTMLButtonElement>('btn2'), keys = $('keys'), picker = $('picker'), rules = $('rules');
  let action: (() => void) | null = null, second: (() => void) | null = null;
  let visible = true;

  /** The button is neutral glass until it is used: pressing it (click, tap, Enter or Space) turns it green for a moment. */
  const flash = () => { btn.classList.add('go'); setTimeout(() => btn.classList.remove('go'), 500); };
  btn.addEventListener('click', () => { btn.blur(); if (!btn.disabled) { flash(); action?.(); } });   // blur so Space/Enter never double-fire on a focused button
  btn2.addEventListener('click', () => { btn2.blur(); second?.(); });

  return {
    visible: () => visible,
    show(o: OverlayOptions) {
      title.textContent = o.title; sub.textContent = o.text; btnLabel.textContent = o.button; btn.setAttribute('aria-label', o.button);
      keys.hidden = o.showKeys === false;                 // the stylesheet decides how it shows (and hides it on touch screens)
      picker.hidden = !o.picker; rules.hidden = !o.picker;      // the three rules belong to the start panel; the pause panel has its own line
      $('logo').style.display = o.picker ? '' : 'none';           // the logo belongs to the start panel, not the pause panel
      $('charPick').hidden = !o.picker;                    // characters are chosen on the start panel, not the pause panel
      btn2.hidden = !o.secondary; btn2.textContent = o.secondary?.label ?? ''; second = o.secondary?.onClick ?? null;
      action = o.onClick;
      root.style.display = 'flex'; visible = true;
    },
    hide() { root.style.display = 'none'; visible = false; },
    setButton(text: string, enabled = true) { btnLabel.textContent = text; btn.setAttribute('aria-label', text); btn.disabled = !enabled; },
    /** Enter / Space: do what the main button does. */
    activate() { if (visible && !btn.disabled) { flash(); action?.(); } },
  };
}
export type Overlay = ReturnType<typeof createOverlay>;
