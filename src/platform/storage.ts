// Saved settings (your character, country, "seen the hint"). Inside YouTube the game's data belongs in the Playables
// save slot (ytgame.game.saveData / loadData), because the page may run in a sandbox where localStorage is blocked; anywhere else
// it goes to localStorage. Both can fail, so every call is guarded and the game works without any of it.
//
// The API is synchronous (a small in-memory copy), so the rest of the code needs no changes: call `initStorage()` once at start,
// wait for it, and then `storage.get / set` behave like localStorage.
declare global { interface Window { ytgame?: any } }

const LOCAL_PREFIX = 'paper-grab:';
const data = new Map<string, string>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export const STORAGE = { loadTimeoutMs: 1500, saveDelayMs: 400, maxBytes: 3 * 1024 * 1024 };

const guarded = <T>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };
const sdk = () => (typeof window !== 'undefined' ? window.ytgame?.game : undefined);

/** Merge a saved blob (JSON text) into memory: only string values are accepted, anything else is ignored. */
export function mergeSaved(text: unknown): number {
  if (typeof text !== 'string' || !text) return 0;
  const obj = guarded(() => JSON.parse(text)) as unknown;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'string' && k.length < 80 && v.length < 1200) { data.set(k, v); n++; }
  return n;
}
export const serialise = () => JSON.stringify(Object.fromEntries(data));

/** Load whatever was saved before: from the Playables save slot inside YouTube, otherwise from localStorage. Never rejects, never hangs. */
export async function initStorage(): Promise<void> {
  const g = sdk();
  if (g?.loadData) {
    const loaded = await Promise.race([
      Promise.resolve(guarded(() => g.loadData())).catch(() => undefined),
      new Promise<undefined>(r => setTimeout(() => r(undefined), STORAGE.loadTimeoutMs)),
    ]);
    mergeSaved(loaded);
  }
  guarded(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOCAL_PREFIX) && !data.has(k.slice(LOCAL_PREFIX.length))) data.set(k.slice(LOCAL_PREFIX.length), localStorage.getItem(k) ?? '');
    }
  });
}

export const storage = {
  get(key: string): string | null { return data.get(key) ?? null; },
  set(key: string, value: string) {
    if (data.get(key) === value) return;
    data.set(key, value);
    guarded(() => localStorage.setItem(LOCAL_PREFIX + key, value));
    clearTimeout(saveTimer);                                                   // saved a moment later, so quick changes make one write
    saveTimer = setTimeout(() => {
      const g = sdk(), text = serialise();
      if (g?.saveData && text.length < STORAGE.maxBytes) guarded(() => Promise.resolve(g.saveData(text)).catch(() => undefined));
    }, STORAGE.saveDelayMs);
  },
};
