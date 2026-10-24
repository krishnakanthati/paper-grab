// The safe-zone shield's bubble: a soft glowing disc and a bright ring round any player whose shield is up, flat on the ground. It
// blinks in its last second so you know it is about to drop. Drawn with a GroundBatch.
import { Group } from 'three';
import type { Game } from '../game/index.ts';
import { GroundBatch } from './groundBatch.ts';

export const SHIELD_LOOK = {
  color: 0x3aa0ff, rim: 0xffffff,
  radius: 1.6, pulseHz: 1.6,
  blinkLastTicks: 30, blinkHz: 5,
};

export function createShield3D(game: Game) {
  const group = new Group(), flat = new GroundBatch(0.15, 8);
  group.add(flat.mesh);
  const L = SHIELD_LOOK;
  return {
    group,
    update(nowMs: number, f: number) {
      flat.begin();
      for (const p of game.players) {
        if (!p.alive || p.shield <= 0) continue;
        const x = p.px + (p.x - p.px) * f, z = p.py + (p.y - p.py) * f, pulse = 1 + 0.08 * Math.sin(nowMs / 1000 * Math.PI * 2 * L.pulseHz), R = L.radius * pulse;
        const fade = p.shield < L.blinkLastTicks ? 0.4 + 0.6 * Math.abs(Math.sin(nowMs / 1000 * Math.PI * L.blinkHz)) : 1;
        flat.circle(x, z, R, L.color, 0.2 * fade, 40);
        flat.ring(x, z, R, 0.16, L.rim, 0.9 * fade, 40);
      }
      flat.end();
    },
    dispose() { flat.dispose(); },
  };
}
export type Shield3D = ReturnType<typeof createShield3D>;
