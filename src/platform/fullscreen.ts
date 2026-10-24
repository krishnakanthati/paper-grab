// Ask the browser for fullscreen. Browsers only allow this from a user gesture, so it cannot happen on page load itself:
// the first tap or key press does it, and starting a round does it again if the player left fullscreen in between.
// Where fullscreen is unavailable (iPhone Safari, an embedding frame that forbids it) this quietly does nothing; the
// installed web app is fullscreen through the manifest instead.

export interface FullscreenHost {
  fullscreenEnabled?: boolean;
  fullscreenElement: Element | null;
  documentElement: { requestFullscreen?: (opts?: { navigationUI?: 'hide' }) => Promise<void> };
}

export function enterFullscreen(doc: FullscreenHost = document): void {
  if (!doc.fullscreenEnabled || doc.fullscreenElement || !doc.documentElement.requestFullscreen) return;
  try { doc.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* denied: not worth interrupting the game */ }
}

/** Go fullscreen on the first gesture of the page. */
export function fullscreenOnFirstGesture(target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document, doc: FullscreenHost = document): void {
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const go = () => { for (const e of events) target.removeEventListener(e, go); enterFullscreen(doc); };
  for (const e of events) target.addEventListener(e, go);
}
