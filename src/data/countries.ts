// The country catalogue: every country as a playable arena shape, plus a simplified outline for the picker.
// It lives in public/countries.json (built by tools/make_countries.mjs) and is fetched when the picker opens, so the
// game itself starts without it.
import type { ArenaShape } from './shape.ts';

export interface Country {
  id: string;                    // ISO-style code
  name: string;
  continent: string;
  outline: Array<Array<[number, number]>>;   // simplified rings in true lon/lat, for drawing the world map
  centre: [number, number];      // lon/lat of a good place to label it
  shape: ArenaShape;
}

interface RawCountry { i: string; n: string; c: string; w: number; h: number; m: string; b: string; p: Array<Array<[number, number]>>; k: [number, number] }

/** Turn the JSON the generator wrote into typed countries. Throws on a file that doesn't look right. */
export function parseCountries(json: unknown): Country[] {
  const root = json as { version?: number; countries?: RawCountry[] };
  if (!root || root.version !== 1 || !Array.isArray(root.countries)) throw new Error('countries.json has an unexpected format');
  return root.countries.map(c => ({
    id: c.i, name: c.n, continent: c.c, outline: c.p, centre: c.k,
    shape: { id: c.i, name: c.n, nx: c.w, ny: c.h, mask: c.m, backdrop: c.b },
  }));
}

/** True only in the YouTube Playables build (set by the bundler): there the fallback that injects a script is removed from the bundle entirely. */
declare const __PLAYABLES__: boolean | undefined;

let cached: Promise<Country[]> | null = null;

/** Fetch and parse the catalogue once. A failed attempt is not cached, so the picker can offer a retry. */
export function loadCountries(url = 'countries.json'): Promise<Country[]> {
  if (!cached) {
    cached = fetch(url)
      .then(r => { if (!r.ok) throw new Error(`could not load countries (${r.status})`); return r.json(); })
      .catch(err => (typeof __PLAYABLES__ !== 'undefined' && __PLAYABLES__ ? Promise.reject(err) : loadViaScript()))     // opened from file://, where fetch() is blocked (not in the YouTube build: it never injects scripts)
      .then(parseCountries)
      .catch(err => { cached = null; throw err; });
  }
  return cached;
}

/** file:// pages cannot fetch(), but can load a script: countries.js assigns the same JSON to a global. */
function loadViaScript(): Promise<unknown> {
  const w = window as unknown as { __PG_COUNTRIES__?: unknown };
  if (w.__PG_COUNTRIES__) return Promise.resolve(w.__PG_COUNTRIES__);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'countries.js';
    s.onload = () => (w.__PG_COUNTRIES__ ? resolve(w.__PG_COUNTRIES__) : reject(new Error('countries.js was empty')));
    s.onerror = () => reject(new Error('could not load countries'));
    document.head.appendChild(s);
  });
}
