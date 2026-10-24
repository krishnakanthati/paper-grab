// What the player has earned, kept in the platform store (see platform/storage.ts).
import { storage } from '../platform/storage.ts';
import { DEFAULT_TRAIL, trailById } from './unlocks.ts';

export const profile = {
  goalsDone(): number { const n = Number(storage.get('goals')); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; },
  trail(): string { return trailById(storage.get('trail') ?? DEFAULT_TRAIL).id; },
  setTrail(id: string) { storage.set('trail', trailById(id).id); },
};
