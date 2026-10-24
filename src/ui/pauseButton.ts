// Round pause / resume button; its icon follows the real paused state.
const PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z"/></svg>';

export function bindPauseButton(btn: HTMLElement, toggle: () => void) {
  btn.innerHTML = PAUSE;
  btn.addEventListener('click', () => { btn.blur(); toggle(); });
  return { setPaused(p: boolean) { btn.innerHTML = p ? PLAY : PAUSE; btn.title = p ? 'resume (p)' : 'pause (p)'; } };
}
