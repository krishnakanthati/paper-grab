// Mute toggle.
import type { Sound } from '../audio/index.ts';

const svg = (extra: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>${extra}</svg>`;
const ON = svg('<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>');
const OFF = svg('<path d="M17 9l5 6M22 9l-5 6"/>');

export function bindSoundButton(btn: HTMLElement, sound: Sound) {
  const show = (audible: boolean) => { btn.innerHTML = audible ? ON : OFF; btn.title = audible ? 'sound on' : 'sound off'; };
  show(sound.audible());
  sound.onAudibleChange(show);                       // the icon follows every reason sound can go quiet (button, YouTube, pause)
  btn.addEventListener('click', () => { sound.unlock(); sound.toggleMute(); });
}
