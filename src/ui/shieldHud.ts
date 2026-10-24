// The shield button in the top bar: shows whether your safe-zone shield is ready, up (with the seconds left) or recharging (a filling ring).
// The DOM is only touched when something changes.
import { SHIELD, TICK_HZ } from '../config.ts';
import type { Game } from '../game/index.ts';

export function createShieldHud(game: Game, btn: HTMLElement) {
  let last = '';
  return {
    update() {
      const me = game.players[0];
      let state = 'off', fill = 0, label = 'shield';
      if (me && me.alive) {
        if (me.shield > 0) { state = 'on'; fill = me.shield / SHIELD.ticks; label = `shield on, ${Math.ceil(me.shield / TICK_HZ)} seconds left`; }
        else if (me.shieldCool > 0) { state = 'cool'; fill = 1 - me.shieldCool / SHIELD.cooldownTicks; label = `shield recharging, ${Math.ceil(me.shieldCool / TICK_HZ)} seconds`; }
        else { state = 'ready'; fill = 1; label = 'shield ready (E)'; }
      }
      const key = state + ':' + Math.round(fill * 100);
      if (key === last) return;
      last = key;
      btn.dataset.state = state; btn.style.setProperty('--fill', String(Math.round(fill * 100)));
      btn.setAttribute('aria-label', label); btn.title = label;
    },
  };
}
