// An arena is a shape: the playable cells of a grid. The world, and every country, is one of these.
export interface ArenaShape {
  id: string;          // stable key (ISO code, or 'WORLD')
  name: string;
  nx: number; ny: number;
  mask: string;        // base64, 1 bit per cell, row-major, most significant bit first; 1 = playable land
  backdrop?: string;   // CSS colour shown outside the arena
}

export function decodeMask(shape: ArenaShape): Uint8Array {
  const land = new Uint8Array(shape.nx * shape.ny);
  const bin = atob(shape.mask);
  for (let i = 0; i < land.length; i++) land[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return land;
}
