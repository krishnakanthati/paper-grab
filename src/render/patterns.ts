// A quiet motif per player colour, so every territory reads as a patterned sheet of paper instead of a flat fill.
// Each tile is grey with lighter motifs; the territory fill multiplies it by the player's colour, so the base stays that
// colour and the motifs come out a few shades lighter. Tiles are 2 cells wide and wrap seamlessly
// because every motif sits well inside the tile.

const LOGICAL = 128;                       // the tile is drawn on a 128-unit sheet (2 cells) ...
const TILE = 512;                          // ... but rasterised at 4x, so the motifs stay crisp on high-density screens and when zoomed in
export const PATTERN_BASE = 0.9;           // the tile's base grey (0..1): the fill colour is divided by this so the base stays true to the colour
export const PATTERN_COUNT = 8;

type Draw = (g: CanvasRenderingContext2D) => void;
const at = (g: CanvasRenderingContext2D, x: number, y: number, fn: () => void) => { g.save(); g.translate(x, y); fn(); g.restore(); };
const spots = (g: CanvasRenderingContext2D, fn: () => void) => { for (const [x, y] of [[32, 32], [96, 96]]) at(g, x, y, fn); };

const DRAW: Draw[] = [
  g => spots(g, () => { g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); }),                                    // dots
  g => { g.lineWidth = 12; g.lineCap = 'round'; for (const [x, y] of [[32, 64], [96, 64]]) { g.beginPath(); g.moveTo(x - 16, y + 24); g.lineTo(x + 16, y - 24); g.stroke(); } },   // slashes
  g => spots(g, () => { g.beginPath(); g.moveTo(0, -17); g.lineTo(13, 0); g.lineTo(0, 17); g.lineTo(-13, 0); g.closePath(); g.fill(); }),   // diamonds
  g => spots(g, () => { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }),   // stars
  g => { g.lineWidth = 7; g.lineCap = 'round'; for (const y of [32, 96]) { g.beginPath(); g.moveTo(14, y); g.bezierCurveTo(34, y - 22, 50, y + 22, 64, y); g.bezierCurveTo(78, y - 22, 94, y + 22, 114, y); g.stroke(); } },   // waves
  g => { g.fillRect(16, 16, 32, 32); g.fillRect(80, 80, 32, 32); },                                                          // checks
  g => spots(g, () => { g.beginPath(); g.moveTo(0, 14); g.bezierCurveTo(-26, -6, -12, -22, 0, -8); g.bezierCurveTo(12, -22, 26, -6, 0, 14); g.fill(); }),   // hearts
  g => spots(g, () => { g.fillRect(-4, -14, 8, 28); g.fillRect(-14, -4, 28, 8); }),                                        // plus signs
];

const canvases = new Map<number, HTMLCanvasElement | null>();

/** The painted tile for a player id as a plain canvas (ids repeat the 8 motifs), or null where there is no canvas (tests, workers). Any renderer can make a texture of it. */
export function patternCanvas(id: number): HTMLCanvasElement | null {
  const k = ((id - 1) % PATTERN_COUNT + PATTERN_COUNT) % PATTERN_COUNT;
  if (canvases.has(k)) return canvases.get(k)!;
  let cv: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas'); cv.width = cv.height = TILE;
    const g = cv.getContext('2d');
    if (g) {
      const grey = Math.round(PATTERN_BASE * 255);
      g.fillStyle = `rgb(${grey},${grey},${grey})`; g.fillRect(0, 0, TILE, TILE);
      g.scale(TILE / LOGICAL, TILE / LOGICAL);
      g.fillStyle = g.strokeStyle = '#ffffff';
      DRAW[k](g);
    } else cv = null;
  }
  canvases.set(k, cv);
  return cv;
}

/** The colour to multiply the tile by: brightened so the tile's grey base lands back on `color`. */
export const patternTint = (color: number) => {
  const up = (v: number) => Math.min(255, Math.round(v / PATTERN_BASE));
  return (up((color >> 16) & 255) << 16) | (up((color >> 8) & 255) << 8) | up(color & 255);
};
