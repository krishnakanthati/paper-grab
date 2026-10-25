// Colours. Player colours are indexed by (player id - 1).
export const COLORS = [0xef4b4b, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x14b8a6, 0xec4899, 0x92643f];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

let mine = 0;                                                                  // index into COLORS of the colour you play as
/** Play as another of the hand-picked colours (the rest go to the computer players, in order). */
export function setPlayerColor(index: number) { mine = Math.max(0, Math.min(COLORS.length - 1, Math.floor(index) || 0)); }
export const playerColorIndex = () => mine;

/** Colour of a player id (1 = you). Beyond the hand-picked eight, hues are spread by the golden angle so they stay distinct. */
export function colorOf(id: number): number {
  if (id === 1) return COLORS[mine];
  if (id >= 2 && id <= COLORS.length) return COLORS.filter((_, i) => i !== mine)[id - 2];
  const h = ((id * 137.508) % 360) / 360, s = 0.62, l = 0.55;                 // HSL -> RGB
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
export const cssColorOf = (id: number) => hex(colorOf(id));
export const CSS_COLORS = COLORS.map(hex);

/**
 * Two looks for the same game. `evening` (the default) is calm: warm cream ground, a dusk-to-sunset sky round the map, soft violet shadows and
 * warm light. `day` is the original bright mint and aqua. Chosen once at load: `?theme=day` / `?theme=evening` in the address, remembered in
 * localStorage under `loopy-theme`.
 */
export type ThemeName = 'day' | 'evening';
const LOOKS = {
  day: {
    sea: 0xe8fbf4, oceanTop: '#39b7ea', oceanBottom: '#8ae3f5', border: 0x5cbcf5, halo: 0x9bd9ff, arenaShadow: 0x0a4a7a, inkShadow: 0x0b2a3a,
    lights: { ambient: 0xffffff, key: 0xffffff, fill: 0xbfe3ff },
  },
  evening: {
    sea: 0xfff0e2, oceanTop: '#3b3d86', oceanBottom: '#f3a58b', border: 0xf29a78, halo: 0xffc7a6, arenaShadow: 0x3a2a6b, inkShadow: 0x2a1f4d,
    lights: { ambient: 0xffe9d6, key: 0xffd6ad, fill: 0xb7a6ff },
  },
} as const;
function chooseTheme(): ThemeName {
  try {
    const asked = new URLSearchParams(globalThis.location?.search ?? '').get('theme') ?? globalThis.localStorage?.getItem('loopy-theme');
    if (asked === 'day' || asked === 'evening') { try { globalThis.localStorage?.setItem('loopy-theme', asked); } catch { /* private mode: just not remembered */ } return asked; }
  } catch { /* no window (tests): the default */ }
  return 'evening';
}
export const THEME = { name: chooseTheme() as ThemeName, ...LOOKS[chooseTheme()] };

export const SEA = THEME.sea;       // arena floor

// Shared fixed colours (so no render file carries its own copy of a hex literal)
export const WHITE = 0xffffff;
export const INK_SHADOW = THEME.inkShadow;        // soft drop shadows under heads and land
export const ARENA_SHADOW = THEME.arenaShadow;      // the deeper blue cast beneath the arena rim
export const PUPIL = 0x141824;
export const GOLD = 0xffc933;              // crown fill
export const GOLD_EDGE = 0xb9860b;         // crown outline
export const OCEAN_TOP = THEME.oceanTop;         // the sea / sky behind the arena (day: light aqua kept apart from the saturated blue and teal player colours)
export const OCEAN_BOTTOM = THEME.oceanBottom;
export const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
export const BORDER = THEME.border;
export const HALO = THEME.halo;       // light band just outside the arena edge (opaque: no alpha stacking)

export const mix = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x10131c, t);
