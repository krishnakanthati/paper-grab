// The safe-zone shield: a player who has it ready can switch it on for a few seconds, during which nobody else can catch, cut or crash
// into them (see combat.ts); afterwards it recharges. The timers are on the player and counted down here.
import { SHIELD } from '../config.ts';
import type { Ctx, Player } from './types.ts';

/** Count every player's shield and recharge timers down by one tick. */
export function tickShields(g: Ctx) {
  for (const p of g.players) { if (p.shield > 0) p.shield--; if (p.shieldCool > 0) p.shieldCool--; }
}

/** Switch the shield on, if this player is alive, not held captive and it has recharged. Returns whether it came on. */
export function useShield(g: Ctx, p: Player | undefined): boolean {
  if (!g.running || !p || !p.alive || p.capturedBy || p.shield > 0 || p.shieldCool > 0) return false;
  p.shield = SHIELD.ticks; p.shieldCool = SHIELD.cooldownTicks;
  g.events.onShield?.(p);
  return true;
}
