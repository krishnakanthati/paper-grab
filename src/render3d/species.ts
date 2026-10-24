// The cast: every character is data. A species says what the body is made of (colours, ears, snout, patches...) and
// decor.ts turns that into meshes. Adding a character is adding an entry here; nothing else needs to change.
export type EarKind = 'round' | 'long' | 'point' | 'floppy' | 'none';
export type MouthKind = 'smile' | 'grin' | 'smirk' | 'flat' | 'frown' | 'open' | 'none';
export type TailKind = 'puff' | 'long' | 'curl';

export type DetailKind = 'stem' | 'whiskers' | 'teeth' | 'tongue' | 'bow' | 'bowtie' | 'scarf' | 'collar' | 'flower' | 'leaf' | 'shell' | 'freckles' | 'eyebrows' | 'tuft';
/** A little extra that gives a character its own personality: a blade of grass, whiskers, a scarf, an eggshell hat... */
export interface Detail { kind: DetailKind; color?: number; bell?: boolean }

export type ShoeKind = 'sneaker' | 'slipper' | 'boot' | 'sandal';
/** Footwear: `color` is the shoe itself; the toe cap, strap or cuff is always the player's own colour, which keeps players distinguishable. */
export interface Shoes { kind: ShoeKind; color: number; sole?: number }

export interface Patch { at: readonly [number, number, number]; size: readonly [number, number, number]; color: number }

export interface Species {
  id: string;
  name: string;
  body: number;                                   // main body colour
  ears: { kind: EarKind; color: number; inner?: number; size?: number };   // size: a multiplier on round/floppy ears (an elephant's are big)
  snout?: { color: number; nostrils: number };    // a boxy pig/cow muzzle
  nose?: number;                                  // a small round nose (panda, bear, cat)
  beak?: number;
  trunk?: number;                                 // an elephant's trunk (colour)
  claws?: number;                                 // a crab's two big pincers (colour), with little legs along the sides
  noseHorn?: number;                              // a rhino's single horn on its nose (colour)
  patches?: Patch[];                              // dark blotches stuck on the body (cow)
  eyePatch?: number;                              // dark rings round the eyes (panda)
  horns?: number;
  tail?: { kind: TailKind; color: number };
  wings?: number;
  cheek: number;                                  // blush
  feet?: number;                                  // otherwise the player's own colour, which is how you tell players apart
  mouth?: MouthKind;                              // not everyone smiles: default 'smile' (ignored when there is a snout, beak or trunk)
  shoes?: Shoes;                                  // little shoes or slippers on the feet (see SHOE_BY_ID)
  details?: Detail[];                             // see Detail: what makes this character itself
  plain?: boolean;                                // the original look: a block wholly in the player's own colour, nothing added
}

const CAST: Species[] = [
  { id: 'classic', name: 'classic', plain: true, body: 0xffffff, cheek: 0xffffff, ears: { kind: 'none', color: 0xffffff } },
  {
    id: 'cow', name: 'cow', body: 0xfdfdfb, cheek: 0xffb3c1, horns: 0xf2cf8e,
    ears: { kind: 'round', color: 0x2a2a33, inner: 0xffc2cc },
    snout: { color: 0xffb7c4, nostrils: 0xe0788f },
    patches: [
      { at: [-0.12, 0.22, 0.975], size: [0.36, 0.32, 0.05], color: 0x2a2a33 },
      { at: [0.1, 0.485, 0.62], size: [0.3, 0.05, 0.3], color: 0x2a2a33 },
      { at: [-0.2, -0.485, 0.55], size: [0.34, 0.05, 0.28], color: 0x2a2a33 },
      { at: [0.478, 0.26, 0.56], size: [0.05, 0.34, 0.34], color: 0x2a2a33 },      // a patch round one eye
    ],
    tail: { kind: 'long', color: 0x2a2a33 },
    details: [{ kind: 'stem', color: 0x7ed957 }, { kind: 'tuft', color: 0x2a2a33 }],
  },
  {
    id: 'panda', mouth: 'smile', name: 'panda', body: 0xfbfbf9, cheek: 0xffc0c8, eyePatch: 0x23232b,
    ears: { kind: 'round', color: 0x23232b }, nose: 0x23232b, feet: 0x23232b,
    tail: { kind: 'puff', color: 0xfbfbf9 },
    details: [{ kind: 'stem', color: 0x6dbb4a }],
  },
  {
    id: 'skull', mouth: 'none', name: 'skull', body: 0xfbfbf9, cheek: 0xffffff, eyePatch: 0x7a35e0, nose: 0x23232b,
    ears: { kind: 'none', color: 0xfbfbf9 },
    patches: [{ at: [-0.18, 0.1, 0.975], size: [0.22, 0.05, 0.05], color: 0xe3e3ea }, { at: [0.0, -0.3, 0.975], size: [0.05, 0.22, 0.05], color: 0xe3e3ea }],     // hairline cracks
    details: [{ kind: 'teeth' }],
  },
  {
    id: 'bear', mouth: 'smile', name: 'bear', body: 0x9b6a43, cheek: 0xffa59a,
    ears: { kind: 'round', color: 0x8a5a36, inner: 0xd9b48a }, nose: 0x2f2a2e,
    patches: [{ at: [0.47, 0, 0.34], size: [0.06, 0.4, 0.24], color: 0xe3c29a }],       // a pale muzzle
    tail: { kind: 'puff', color: 0x8a5a36 },
    details: [{ kind: 'bowtie', color: 0x3b82f6 }],
  },
  {
    id: 'koala', mouth: 'flat', name: 'koala', body: 0xb9bec9, cheek: 0xffb3c1,
    ears: { kind: 'round', color: 0xaab0bd, inner: 0xf3e6ee, size: 1.6 }, nose: 0x2f2a2e,
    patches: [{ at: [0.47, 0, 0.4], size: [0.06, 0.34, 0.3], color: 0xeceff4 }],       // a pale chest
    details: [{ kind: 'leaf', color: 0x6dbb4a }],
  },
  {
    id: 'lion', mouth: 'grin', name: 'lion', body: 0xf2b84b, cheek: 0xffa88a,
    ears: { kind: 'round', color: 0xc9822b, inner: 0xf8dcae }, nose: 0x8a4b2a,
    patches: [{ at: [0.47, 0, 0.34], size: [0.06, 0.4, 0.22], color: 0xfff0cf }],
    tail: { kind: 'long', color: 0xf2b84b },
    details: [{ kind: 'tuft', color: 0xc9822b }, { kind: 'whiskers', color: 0x8a5a36 }],
  },
  {
    id: 'kitty', mouth: 'smirk', name: 'kitty', body: 0xffb34d, cheek: 0xff8a8a,
    ears: { kind: 'point', color: 0xffb34d, inner: 0xffc9c9 }, nose: 0xff7d8d,
    patches: [
      { at: [0.0, 0.0, 0.975], size: [0.5, 0.1, 0.05], color: 0xf08a1c },
      { at: [-0.12, 0.0, 0.975], size: [0.4, 0.1, 0.05], color: 0xf08a1c },
    ],
    tail: { kind: 'long', color: 0xffb34d },
    details: [{ kind: 'whiskers', color: 0x5a3a2a }, { kind: 'collar', color: 0xe5484d, bell: true }],
  },
  {
    id: 'piglet', name: 'piglet', body: 0xffb8c8, cheek: 0xff8fa8,
    ears: { kind: 'floppy', color: 0xff9cb2 },
    snout: { color: 0xff93ab, nostrils: 0xd9607f },
    tail: { kind: 'curl', color: 0xff93ab },
    details: [{ kind: 'flower', color: 0xffe14a }],
  },
  {
    id: 'froggy', mouth: 'grin', name: 'froggy', body: 0x7be36a, cheek: 0xffa3b5,
    ears: { kind: 'none', color: 0x7be36a },
    patches: [
      { at: [0.05, 0.24, 0.975], size: [0.18, 0.18, 0.05], color: 0x58c24b },
      { at: [-0.15, -0.2, 0.975], size: [0.22, 0.2, 0.05], color: 0x58c24b },
    ],
    details: [{ kind: 'leaf', color: 0x3fae4c }],
  },
  {
    id: 'owlet', name: 'owlet', body: 0xa9744a, cheek: 0xffb09a, beak: 0xffb02e, wings: 0x8a5a36,
    ears: { kind: 'point', color: 0x8a5a36, inner: 0xd9b48a },
    patches: [{ at: [0.47, 0, 0.46], size: [0.06, 0.5, 0.4], color: 0xf3dfc0 }],      // a pale belly
    details: [{ kind: 'eyebrows', color: 0x5a3a22 }],
  },
  {
    id: 'puppy', mouth: 'open', name: 'puppy', body: 0xf3d9a6, cheek: 0xff9fa8, nose: 0x2f2a2e,
    ears: { kind: 'floppy', color: 0xb97f4a },
    patches: [{ at: [0.0, -0.22, 0.975], size: [0.34, 0.3, 0.05], color: 0xb97f4a }],
    tail: { kind: 'long', color: 0xf3d9a6 },
    details: [{ kind: 'tongue', color: 0xff7f9f }, { kind: 'collar', color: 0x3b82f6 }],
  },
  {
    id: 'foxy', mouth: 'smirk', name: 'foxy', body: 0xff8a3d, cheek: 0xffb0a0, nose: 0x2f2a2e,
    ears: { kind: 'point', color: 0xff8a3d, inner: 0x3a2a25 },
    patches: [{ at: [0.47, 0, 0.34], size: [0.06, 0.4, 0.22], color: 0xfff1e0 }],
    tail: { kind: 'long', color: 0xfff1e0 },
    details: [{ kind: 'whiskers', color: 0x3a2a25 }, { kind: 'eyebrows', color: 0x3a2a25 }],
  },
  {
    id: 'mousey', mouth: 'flat', name: 'mousey', body: 0xc9cfd9, cheek: 0xffa3b5, nose: 0xff8aa0,
    ears: { kind: 'round', color: 0xc9cfd9, inner: 0xffb3c4 }, feet: 0xffb3c4,
    tail: { kind: 'curl', color: 0xffb3c4 },
    details: [{ kind: 'whiskers', color: 0x8a90a0 }, { kind: 'bow', color: 0xffd23c }],
  },
  {
    id: 'ducky', name: 'ducky', body: 0xfff06b, cheek: 0xff9f7a, beak: 0xff9e1f,
    ears: { kind: 'none', color: 0xfff06b }, wings: 0xffe14a,
    tail: { kind: 'puff', color: 0xffe14a },
    details: [{ kind: 'bowtie', color: 0xe5484d }],
  },
  {
    id: 'tiger', mouth: 'flat', name: 'tiger', body: 0xff9a2e, cheek: 0xffb0a0, nose: 0xff7d8d,
    ears: { kind: 'round', color: 0xe9791a, inner: 0xfff0d8 },
    patches: [
      { at: [-0.22, 0, 0.975], size: [0.07, 0.44, 0.05], color: 0x3a2418 }, { at: [-0.04, 0, 0.975], size: [0.07, 0.34, 0.05], color: 0x3a2418 }, { at: [0.14, 0, 0.975], size: [0.07, 0.2, 0.05], color: 0x3a2418 },
      { at: [-0.1, 0.485, 0.62], size: [0.06, 0.05, 0.3], color: 0x3a2418 }, { at: [0.12, 0.485, 0.55], size: [0.06, 0.05, 0.24], color: 0x3a2418 },
      { at: [-0.1, -0.485, 0.62], size: [0.06, 0.05, 0.3], color: 0x3a2418 }, { at: [0.12, -0.485, 0.55], size: [0.06, 0.05, 0.24], color: 0x3a2418 },
      { at: [0.472, 0, 0.36], size: [0.05, 0.34, 0.2], color: 0xfff3e2 },                    // a pale muzzle
    ],
    tail: { kind: 'long', color: 0xff9a2e },
    details: [{ kind: 'whiskers', color: 0xffffff }],
  },
  {
    id: 'elephant', name: 'elephant', body: 0xb5bfce, cheek: 0xffb3c1, trunk: 0xa7b2c2,
    ears: { kind: 'floppy', color: 0xa3aebf, size: 1.9 },
    patches: [
      { at: [0.5, 0.17, 0.3], size: [0.1, 0.06, 0.2], color: 0xfffaf0 }, { at: [0.5, -0.17, 0.3], size: [0.1, 0.06, 0.2], color: 0xfffaf0 },      // two little tusks
    ],
    tail: { kind: 'long', color: 0xa3aebf },
    details: [{ kind: 'tuft', color: 0x8f9bae }],
  },
  {
    id: 'penguin', name: 'penguin', body: 0x35405c, cheek: 0xff9fa8, beak: 0xffa31f, wings: 0x2a3350,
    ears: { kind: 'none', color: 0x35405c },
    patches: [{ at: [0.47, 0, 0.46], size: [0.06, 0.5, 0.4], color: 0xf7f9ff }],
    details: [{ kind: 'scarf', color: 0xe5484d }],
  },
  {
    id: 'rhino', name: 'rhino', body: 0x9a97a8, cheek: 0xffb3c1, noseHorn: 0xf3e6cf,
    ears: { kind: 'round', color: 0x8b8899, inner: 0xe9bfc9 },
    snout: { color: 0x8c899c, nostrils: 0x5f5c70 },
    patches: [
      { at: [-0.05, 0.485, 0.62], size: [0.34, 0.05, 0.26], color: 0x858296 }, { at: [-0.05, -0.485, 0.62], size: [0.34, 0.05, 0.26], color: 0x858296 },      // skin plates
    ],
    tail: { kind: 'long', color: 0x8b8899 },
    details: [{ kind: 'eyebrows', color: 0x4b4858 }],
  },
  {
    id: 'crab', name: 'crab', body: 0xff6b4a, cheek: 0xffb3a0, claws: 0xe84b34, mouth: 'smile',
    ears: { kind: 'none', color: 0xff6b4a },
    patches: [
      { at: [-0.12, 0.22, 0.975], size: [0.16, 0.15, 0.05], color: 0xff9a82 }, { at: [0.1, -0.2, 0.975], size: [0.13, 0.13, 0.05], color: 0xff9a82 },        // lighter spots on the shell
    ],
    details: [{ kind: 'tuft', color: 0xe84b34 }],
  },
];

/** Every non-plain character's footwear. */
const SHOE_BY_ID: Record<string, Shoes> = {
  skull: { kind: 'sneaker', color: 0x2c2c38, sole: 0xffffff }, bear: { kind: 'boot', color: 0x6b4426 }, koala: { kind: 'slipper', color: 0xf3e6ee },
  lion: { kind: 'sandal', color: 0xc9822b }, cow: { kind: 'boot', color: 0x2a2a33 }, panda: { kind: 'sneaker', color: 0xfbfbf9, sole: 0x23232b },
  kitty: { kind: 'slipper', color: 0xffc9c9 }, piglet: { kind: 'sneaker', color: 0xff93ab },
  froggy: { kind: 'sneaker', color: 0x3fae4c }, owlet: { kind: 'boot', color: 0x5a3a22 }, puppy: { kind: 'sneaker', color: 0x3b82f6, sole: 0xffffff },
  foxy: { kind: 'boot', color: 0x3a2a25 }, mousey: { kind: 'slipper', color: 0xffb3c4 }, ducky: { kind: 'boot', color: 0xe5484d },
  tiger: { kind: 'sneaker', color: 0x3a2418, sole: 0xfff3e2 }, elephant: { kind: 'slipper', color: 0x8f9bae }, penguin: { kind: 'sneaker', color: 0xe5484d, sole: 0xf7f9ff },
  rhino: { kind: 'boot', color: 0x5f5c70 }, crab: { kind: 'sandal', color: 0xe84b34 },
};
export const SPECIES: readonly Species[] = CAST.map(sp => (sp.plain || sp.shoes || !SHOE_BY_ID[sp.id] ? sp : { ...sp, shoes: SHOE_BY_ID[sp.id] }));

export const DEFAULT_SPECIES = 'classic';
export const speciesById = (id: string | null | undefined): Species => SPECIES.find(s => s.id === id) ?? SPECIES[0];
export const isSpecies = (id: unknown): id is string => typeof id === 'string' && SPECIES.some(s => s.id === id);
/**
 * Computer players each get a different character: they walk through the cast skipping whatever `exclude` (the human's
 * choice) is, so nobody on the map looks like you and no two computer players match until the cast runs out.
 */
export function speciesForBot(playerId: number, exclude?: string): Species {
  const pool = SPECIES.filter(s => s.id !== exclude);
  const list = pool.length ? pool : SPECIES;
  const n = Math.max(0, Math.floor(playerId) - 2);
  return list[n % list.length];
}
