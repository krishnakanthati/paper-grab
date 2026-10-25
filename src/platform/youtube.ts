// The YouTube Playables SDK (window.ytgame). Outside YouTube it doesn't exist, so every call here is guarded
// and never throws; the game runs the same either way.
declare global { interface Window { ytgame?: any } }

const call = <T>(fn: (g: any) => T): T | undefined => {
  try { return fn(window.ytgame); } catch { return undefined; }
};
const quiet = (r: unknown) => { (r as Promise<unknown> | undefined)?.catch?.(() => {}); };

/** SDK order: firstFrameReady, then gameReady once the game is interactable (never during a loading screen). */
export function signalReady() {
  call(g => g.game.firstFrameReady());
  call(g => g.game.gameReady());
}
export function sendScore(value: number) { quiet(call(g => g.engagement.sendScore({ value }))); }

/**
 * True only when the SDK itself says the game is running inside YouTube. The SDK script also loads when you open the game
 * directly, or when another site frames it (itch.io, Poki...), and there it reports audio as disabled, which would silently mute
 * everything. Being in a frame is therefore NOT enough.
 */
export function inYouTube(): boolean {
  return window.ytgame?.IN_PLAYABLES_ENV === true;
}

/** YouTube's own audio setting: start from it, and follow every change (required by the SDK inside YouTube). */
export function bindAudio(set: (enabled: boolean) => void) {
  if (!inYouTube()) return;
  const initial = call(g => g.system.isAudioEnabled());
  if (typeof initial === 'boolean') set(initial);
  call(g => g.system.onAudioEnabledChange((on: boolean) => set(on)));
}
export function bindPause(onPause: () => void, onResume: () => void) {
  call(g => g.system.onPause(onPause));
  call(g => g.system.onResume(onResume));
}
