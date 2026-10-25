// Game events turned into visual effects: particles, expanding rings, camera shake and the dust behind heads.
import { EFFECTS } from '../config.ts';
import type { Game, Player } from '../game/index.ts';
import { WHITE, colorOf, lighten } from './palette.ts';

/** What the effects need from the particle system and the camera (so any renderer can provide them). */
export interface ParticleSink {
  burst(x: number, y: number, color: number, n: number, speed: number, size: number): void;
  ring(x: number, y: number, color: number, maxRadius: number, durMs?: number): void;
}
export interface ShakeSink { kick(strength?: number): void }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createEffects(game: Game, particles: ParticleSink, camera: ShakeSink) {
  const dustAcc = new Map<number, number>();
  const distanceFromMe = (x: number, y: number) => { const me = game.players[0]; return me?.alive ? Math.hypot(x - me.x, y - me.y) : Infinity; };

  return {
    capture(p: Player, claimed: number[]) {
      const col = lighten(colorOf(p.id), 0.25), n = Math.min(40, claimed.length);
      for (let i = 0; i < n; i++) {
        const c = claimed[(Math.random() * claimed.length) | 0];
        particles.burst((c % game.NX) + 0.5, ((c / game.NX) | 0) + 0.5, col, 1, 2.6, 0.32);
      }
      const near = p.id === 1 || distanceFromMe(p.x, p.y) < EFFECTS.kickFarCells;
      if (near) particles.ring(p.x, p.y, col, 2.2 + Math.sqrt(claimed.length) * 0.22);              // a bigger grab pulses wider
      if (p.id === 1) camera.kick(Math.min(EFFECTS.captureKickMax, claimed.length * EFFECTS.captureKickPerCell));
    },
    /**
     * A death is not a boom. The 3D character plays its own fall (see render3d/death.ts); here there is only the small stuff that
     * goes with it: a few pieces of its colour thrown low, a puff of dust, and one soft ring. The jolt is much gentler.
     */
    kill(victim: Player) {
      const col = colorOf(victim.id);
      particles.burst(victim.x, victim.y, col, 12, 3.4, 0.4);
      particles.burst(victim.x, victim.y, lighten(col, 0.6), 8, 1.4, 0.55);
      particles.ring(victim.x, victim.y, lighten(col, 0.35), 1.9);
      const strength = victim.id === 1 ? 0.55 : clamp(1 - distanceFromMe(victim.x, victim.y) / EFFECTS.kickFarCells, 0, 1) * EFFECTS.kickOthers * 0.6;
      if (strength > 0) camera.kick(strength);
    },
    /** Two heads meet face to face: a bright flash at the meeting point, a hard ring and sparks of both colours thrown apart, and a firm jolt (the harder the closer to you). */
    clash(a: Player, b: Player) {
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, ca = colorOf(a.id), cb = colorOf(b.id);
      particles.burst(x, y, WHITE, 16, 8.5, 0.3);
      particles.burst(x, y, lighten(ca, 0.3), 12, 6.5, 0.42);
      particles.burst(x, y, lighten(cb, 0.3), 12, 6.5, 0.42);
      particles.ring(x, y, WHITE, 3.4, 420);
      particles.ring(x, y, lighten(ca, 0.45), 2.4, 560);
      const mine = a.id === 1 || b.id === 1;
      const strength = mine ? 1 : clamp(1 - distanceFromMe(x, y) / EFFECTS.kickFarCells, 0, 1) * EFFECTS.kickOthers * 1.4;
      if (strength > 0) camera.kick(strength);
    },
    win() {
      const me = game.players[0];
      for (let id = 1; id <= game.players.length; id++) particles.burst(me.x, me.y, colorOf(id), 30, 9, 0.5);
      particles.ring(me.x, me.y, WHITE, 8, 900);
    },
    /** A small puff behind every head that is out on a line, at a steady rate whatever the frame rate. */
    dust(dtMs: number) {
      for (const p of game.players) {
        if (!p.alive || !p.trail.length) { dustAcc.delete(p.id); continue; }
        let acc = (dustAcc.get(p.id) ?? 0) + dtMs;
        while (acc >= EFFECTS.dustEveryMs) {
          acc -= EFFECTS.dustEveryMs;
          particles.burst(p.x - Math.cos(p.angle) * 0.5, p.y - Math.sin(p.angle) * 0.5, lighten(colorOf(p.id), 0.55), 1, 0.7, 0.2);
        }
        dustAcc.set(p.id, acc);
      }
    },
  };
}
