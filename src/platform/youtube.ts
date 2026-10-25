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

/** Is the page that frames this game YouTube? (Its address is the frame's "ancestor origin", or the referrer where a browser has no such list.) */
const YOUTUBE_HOST = /(^|\.)(youtube|youtube-nocookie|youtubekids)\.com$/;
function framedByYouTube(): boolean {
  const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
  try {
    const ancestors = (window.location as Location & { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins;
    if (ancestors && ancestors.length) return Array.from(ancestors).some(o => YOUTUBE_HOST.test(hostOf(o)));
    return YOUTUBE_HOST.test(hostOf(document.referrer));
  } catch { return false; }
}

/**
 * True only when the game is really running inside YouTube. The SDK script loads on every page, and inside ANY frame (itch.io, Poki, a
 * test page) it claims to be in Playables and reports audio as disabled, which would silently mute everything. So the SDK's word is
 * only trusted when the page framing us really is YouTube.
 */
export function inYouTube(): boolean {
  return window.ytgame?.IN_PLAYABLES_ENV === true && framedByYouTube();
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
