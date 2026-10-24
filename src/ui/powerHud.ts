// Small pills for the power-ups you have running, with the seconds left. The DOM is only touched when the text changes.
import { TICK_HZ } from '../config.ts';
import type { Game } from '../game/index.ts';

const LABELS: Array<{ key: 'boost' | 'shield' | 'frozen'; text: string }> = [
  { key: 'boost', text: 'boost' }, { key: 'shield', text: 'shield' }, { key: 'frozen', text: 'frozen' },
];

export function createPowerHud(game: Game, el: HTMLElement) {
  let last = '';
  return {
    update() {
      const me = game.players[0];
      const html = me && me.alive ? LABELS.filter(l => me[l.key] > 0).map(l => `<span class="fx fx-${l.key}">${l.text} ${Math.ceil(me[l.key] / TICK_HZ)}s</span>`).join('') : '';
      if (html !== last) { last = html; el.innerHTML = html; }
    },
  };
}
