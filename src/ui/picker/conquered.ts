// Which countries you have won (own the whole arena, or close the loop round the rim). Kept in the platform store as one
// comma-separated string; a stale or edited value just yields fewer ids, never an error.
import { storage } from '../../platform/storage.ts';

export const CONQUERED_KEY = 'conquered';

export function parseConquered(text: string | null, known?: (id: string) => boolean): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  for (const part of text.split(',')) { const id = part.trim(); if (id && id.length <= 8 && (!known || known(id))) ids.add(id); }
  return [...ids];
}

export const conqueredStore = {
  load: (known?: (id: string) => boolean) => parseConquered(storage.get(CONQUERED_KEY), known),
  save: (ids: Iterable<string>) => storage.set(CONQUERED_KEY, [...ids].join(',')),
};
