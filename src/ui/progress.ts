// Top progress bar (your share of the world, with the percentage in a bubble) and the capture counter.
import type { Game } from '../game/index.ts';
import { $ } from './dom.ts';

export function createProgress(game: Game) {
  const lbl = $('plbl'), fill = $('pfill'), kills = $('killn');
  let lastPct = '', lastKills = -1;
  return {
    update() {
      const me = game.players[0];
      const pct = me ? (game.counts[1] / game.landCount) * 100 : 0;
      const text = Math.max(1, Math.round(pct)) + '%';
      if (text !== lastPct) { lastPct = text; lbl.textContent = text; fill.style.width = `calc(14px + (100% - 14px) * ${Math.max(0, Math.min(100, pct)) / 100})`; }
      const k = me?.kills ?? 0;
      if (k !== lastKills) { lastKills = k; kills.textContent = String(k); }
    },
  };
}
