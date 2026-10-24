// Small canvas pictures used by the billboard sprites (orbs, glows, icons). Painted once, white on transparent, so a sprite's material
// colour tints them. Without a canvas (tests) every function gives null and a sprite is simply untextured.
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { PowerKind } from '../game/index.ts';

const cache = new Map<string, CanvasTexture | null>();
function paint(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): CanvasTexture | null {
  if (cache.has(key)) return cache.get(key)!;
  let tex: CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d');
    if (c) { draw(c, size); tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; }
  }
  cache.set(key, tex);
  return tex;
}

/** A soft round glow, white in the middle fading to nothing. */
export const glowTexture = () => paint('glow', 128, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
});
/** A solid disc with a very slightly darker rim, so a tinted orb reads as round. */
export const orbTexture = () => paint('orb', 128, (c, s) => {
  const g = c.createRadialGradient(s * 0.42, s * 0.38, s * 0.05, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(236,236,236,1)'); g.addColorStop(1, 'rgba(205,205,205,1)');
  c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); c.fill();
});
/** A thin white ring. */
export const ringTexture = () => paint('ring', 128, (c, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.05; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - s * 0.04, 0, Math.PI * 2); c.stroke(); });
/** A four-pointed sparkle. */
export const sparkTexture = () => paint('spark', 64, (c, s) => {
  c.fillStyle = '#fff'; c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, r = i % 2 ? s * 0.14 : s * 0.5; c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
  c.closePath(); c.fill();
});

/** The little symbol on a power-up: a bolt (boost), a shield, a snowflake (freeze) or a horseshoe magnet. */
export const iconTexture = (kind: PowerKind) => paint('icon-' + kind, 128, (c, s) => {
  const r = s * 0.42, x = s / 2, y = s / 2;
  c.fillStyle = c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'boost') {
    c.beginPath();
    const pts = [[0.15, -1], [-0.55, 0.1], [-0.05, 0.1], [-0.2, 1], [0.55, -0.15], [0.05, -0.15]];
    pts.forEach(([px, py], i) => (i ? c.lineTo(x + px * r, y + py * r) : c.moveTo(x + px * r, y + py * r)));
    c.closePath(); c.fill();
  } else if (kind === 'shield') {
    c.beginPath();
    [[-0.7, -0.75], [0.7, -0.75], [0.7, 0.1], [0, 1], [-0.7, 0.1]].forEach(([px, py], i) => (i ? c.lineTo(x + px * r, y + py * r) : c.moveTo(x + px * r, y + py * r)));
    c.closePath(); c.fill();
  } else if (kind === 'magnet') {
    c.lineWidth = r * 0.34; c.lineCap = 'butt';
    c.beginPath(); c.arc(x, y + r * 0.1, r * 0.6, Math.PI, 0); c.stroke();
    c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.1); c.lineTo(x - r * 0.6, y + r * 0.85); c.moveTo(x + r * 0.6, y + r * 0.1); c.lineTo(x + r * 0.6, y + r * 0.85); c.stroke();
  } else {
    c.lineWidth = r * 0.28;
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
  }
});
