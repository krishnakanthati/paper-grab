// The real flags of the playable countries: one small PNG each, base64, in flags.json (made by tools/make_flags.mjs).
declare const __PLAYABLES__: boolean | undefined;

export interface FlagSet { mime: string; flags: Record<string, string> }
let cached: Promise<FlagSet> | null = null;

export function parseFlags(raw: unknown): FlagSet {
  const o = raw as { mime?: unknown; flags?: unknown } | null;
  if (!o || typeof o.mime !== 'string' || !o.flags || typeof o.flags !== 'object') throw new Error('bad flag file');
  const flags: Record<string, string> = {};
  for (const [id, v] of Object.entries(o.flags as Record<string, unknown>)) if (typeof v === 'string' && /^[A-Za-z0-9+/=]+$/.test(v)) flags[id] = v;
  return { mime: o.mime, flags };
}

/** Fetch the flags once. Failing is fine: conquered countries then wear a plain green banner. */
export function loadFlags(url = 'flags.json'): Promise<FlagSet> {
  if (!cached) {
    cached = fetch(url)
      .then(r => { if (!r.ok) throw new Error(`could not load flags (${r.status})`); return r.json(); })
      .catch(err => (typeof __PLAYABLES__ !== 'undefined' && __PLAYABLES__ ? Promise.reject(err) : loadViaScript()))     // opened from file://, where fetch() is blocked (not in the YouTube build)
      .then(parseFlags)
      .catch(err => { cached = null; throw err; });
  }
  return cached;
}

function loadViaScript(): Promise<unknown> {
  const w = window as unknown as { __PG_FLAGS__?: unknown };
  if (w.__PG_FLAGS__) return Promise.resolve(w.__PG_FLAGS__);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'flags.js';
    s.onload = () => (w.__PG_FLAGS__ ? resolve(w.__PG_FLAGS__) : reject(new Error('flags.js was empty')));
    s.onerror = () => reject(new Error('could not load flags'));
    document.head.appendChild(s);
  });
}
