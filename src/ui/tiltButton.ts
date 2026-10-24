// The little round button that switches tilt steering on and off (shown only on phones that have the sensor).
import type { Tilt } from '../input/tilt.ts';

const ICON = (on: boolean) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(${on ? -18 : 0} 12 12)"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></g>${on ? '' : '<path d="M4 4l16 16"/>'}</svg>`;

export function bindTiltButton(btn: HTMLElement, tilt: Tilt) {
  const show = () => {
    btn.hidden = !tilt.supported;
    btn.innerHTML = ICON(tilt.enabled());
    btn.title = tilt.enabled() ? 'tilt steering on' : 'tilt steering off';
    btn.setAttribute('aria-pressed', String(tilt.enabled()));
  };
  show();
  tilt.onChange(show);
  btn.addEventListener('click', () => { tilt.toggle(); });
}
