// A short message that fades in and out near the top ("goal complete", "unlocked: tiger").
import { $ } from './dom.ts';

let timer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string, ms = 3200) {
  const el = $('toast');
  el.textContent = text; el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(timer);
  timer = setTimeout(() => { el.classList.remove('show'); timer = setTimeout(() => { el.hidden = true; }, 400); }, ms);
}
