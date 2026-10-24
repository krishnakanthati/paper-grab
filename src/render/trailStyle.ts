// How your own open line looks. Opaque pairs of [width, colour] (a rim, then a core): translucent strokes double-blend where
// they overlap. Only the human's line uses a chosen style; everyone else's stays plain.
import { CHARACTER, isTouchScreen } from '../render3d/tuning.ts';
import { GOLD, GOLD_EDGE, darken, lighten, mix } from './palette.ts';

export type Stroke = readonly [number, number];

const hue = (h: number) => {                           // 0..1 -> a bright rainbow colour
  const f = (n: number) => { const k = (n + h * 12) % 12; return 0.62 - 0.38 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
};

/** Every line is drawn this much thicker than the base widths below (they are in cells, so it holds in every view). */
export const TRAIL_THICKNESS = 1.08;

/** `chunk` numbers the stretch of line being drawn, so the rainbow can change along it. */
export function strokesFor(style: string, col: number, chunk = 0): readonly Stroke[] {
  const k = TRAIL_THICKNESS * (isTouchScreen() ? CHARACTER.mobileBoost : 1);        // phones draw the characters much larger, so the line grows with them or it looks hair-thin beside them
  return baseStrokes(style, col, chunk).map(([w, c]) => [w * k, c] as const);
}

function baseStrokes(style: string, col: number, chunk: number): readonly Stroke[] {
  switch (style) {
    case 'candy': return [[0.98, lighten(col, 0.2)], [0.7, 0xffffff]];
    case 'night': return [[0.98, lighten(col, 0.55)], [0.7, darken(col, 0.55)]];
    case 'gold': return [[0.98, mix(GOLD_EDGE, GOLD, 0.35)], [0.7, GOLD]];
    case 'rainbow': { const h = hue((chunk * 0.13) % 1); return [[0.98, lighten(h, 0.6)], [0.7, h]]; }
    default: return [[0.98, lighten(col, 0.72)], [0.7, lighten(col, 0.42)]];
  }
}

let current = 'plain';
export const setTrailStyle = (id: string) => { current = id; };
export const trailStyle = () => current;
