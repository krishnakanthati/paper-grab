// What points buy. A point comes from finishing a round goal (1), doing a flip in the air (1) or conquering a country (CONQUER_POINTS). The first few
// characters and the plain trail are free; the rest unlock one by one. Costs are plain numbers here, nothing else decides them.
export const CONQUER_POINTS = 3;
export const FREE_CHARACTERS = 6;                 // the first six in the cast
export const CHARACTER_STEP = 2;                  // then each next character costs this much more than the one before

export interface TrailStyle { id: string; name: string; cost: number }
export const TRAILS: readonly TrailStyle[] = [
  { id: 'plain', name: 'plain', cost: 0 },
  { id: 'candy', name: 'candy', cost: 3 },
  { id: 'night', name: 'night', cost: 6 },
  { id: 'gold', name: 'gold', cost: 10 },
  { id: 'rainbow', name: 'rainbow', cost: 15 },
];
export const DEFAULT_TRAIL = 'plain';

export const characterCost = (index: number) => (index < FREE_CHARACTERS ? 0 : (index - FREE_CHARACTERS + 1) * CHARACTER_STEP);
export const trailById = (id: string | null | undefined) => TRAILS.find(t => t.id === id) ?? TRAILS[0];
export const points = (goalsDone: number, conquered: number, flips = 0) => Math.max(0, goalsDone) + Math.max(0, flips) + CONQUER_POINTS * Math.max(0, conquered);
export const characterUnlocked = (index: number, pts: number) => pts >= characterCost(index);
export const trailUnlocked = (id: string, pts: number) => pts >= trailById(id).cost;

/** Names newly available when points go from `before` to `after` (characters given by name in cast order). */
export function newUnlocks(characterNames: readonly string[], before: number, after: number): string[] {
  const out: string[] = [];
  characterNames.forEach((n, i) => { if (!characterUnlocked(i, before) && characterUnlocked(i, after)) out.push(n); });
  for (const t of TRAILS) if (before < t.cost && after >= t.cost) out.push(t.name + ' trail');
  return out;
}
/** The cheapest thing still locked, as { name, cost }, or null when everything is open. */
export function nextUnlock(characterNames: readonly string[], pts: number): { name: string; cost: number } | null {
  const locked = [
    ...characterNames.map((n, i) => ({ name: n, cost: characterCost(i) })),
    ...TRAILS.map(t => ({ name: t.name + ' trail', cost: t.cost })),
  ].filter(x => x.cost > pts);
  return locked.length ? locked.reduce((a, b) => (b.cost < a.cost ? b : a)) : null;
}
