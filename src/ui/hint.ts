// A one-time hint for brand-new players, shown for a few seconds when their first round starts: what to do, in one line.
// It is remembered in the platform store, so it never nags.
import { storage } from '../platform/storage.ts';
import { $ } from './dom.ts';

export const HINT = {
  key: 'hinted', showMs: 4200,
  text: 'leave your colour, then loop back home to claim land',
  touchText: 'leave your colour, loop back home to claim land. steer with the arrows or tilt your phone',
};

export const shouldShowHint = (get: (k: string) => string | null = k => storage.get(k)) => get(HINT.key) !== '1';

let timer: ReturnType<typeof setTimeout> | undefined;
/** Show the hint once per player (a no-op after that). Returns whether it was shown. */
export function showFirstRoundHint(coarse: boolean): boolean {
  if (!shouldShowHint()) return false;
  storage.set(HINT.key, '1');
  const el = $('hint');
  el.textContent = coarse ? HINT.touchText : HINT.text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(timer);
  timer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 400); }, HINT.showMs);
  return true;
}
