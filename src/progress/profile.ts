// What the player has earned, kept in the platform store (see platform/storage.ts).
import { storage } from '../platform/storage.ts';
import { DEFAULT_TRAIL, trailById } from './unlocks.ts';

export const profile = {
  goalsDone(): number { const n = Number(storage.get('goals')); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; },
  /** Points earned from flips in the air (one each). */
  flipPoints(): number { const n = Number(storage.get('flips')); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; },
  addFlipPoint() { storage.set('flips', String(profile.flipPoints() + 1)); },
  trail(): string { return trailById(storage.get('trail') ?? DEFAULT_TRAIL).id; },
  setTrail(id: string) { storage.set('trail', trailById(id).id); },
};
