// Which character the player chose, kept in the platform store (see platform/storage.ts): the game works without it.
import { storage } from '../../platform/storage.ts';
import { DEFAULT_SPECIES, isSpecies, speciesById, speciesForBot, type Species } from '../../render3d/index.ts';

const KEY = 'character';

export const chosenCharacter = {
  get(): string { const v = storage.get(KEY); return isSpecies(v) ? v : DEFAULT_SPECIES; },
  set(id: string) { storage.set(KEY, id); },
};

/** Which animal each player is: you are whatever you chose, every computer player gets a different one, none of them the same as yours. */
export const speciesOfPlayer = (playerId: number): Species => {
  const mine = chosenCharacter.get();
  return playerId === 1 ? speciesById(mine) : speciesForBot(playerId, mine);
};
