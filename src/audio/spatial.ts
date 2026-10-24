// Turns game state into audio parameters: where a distant event sits in the stereo field and how loud it is.
import type { Game } from '../game/index.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Stereo position and loudness of something happening at (x, y), relative to the human player. */
export function placeFromMe(game: Game, x: number, y: number) {
  const me = game.players[0];
  if (!me?.alive) return { pan: 0, vol: 0.4 };
  const dx = x - me.x, dy = y - me.y;
  return { pan: clamp(dx / 18, -1, 1), vol: clamp(1 - Math.hypot(dx, dy) / 40, 0, 1) };
}
