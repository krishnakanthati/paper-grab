// On-screen direction buttons (shown only on touch devices by the stylesheet). They are hold-based like keys: touch
// two buttons at once for a diagonal, release one and you keep the other.
import { resolve, type GameRef } from './keyboard.ts';

const VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left

export function bindDpad(root: HTMLElement, gameRef: GameRef, onGesture: () => void) {
  const held = new Map<number, number>();               // pointerId -> direction index (every finger tracked on its own)
  const steer = () => {
    let vx = 0, vy = 0;
    for (const d of held.values()) { vx += VEC[d][0]; vy += VEC[d][1]; }
    if (vx || vy) resolve(gameRef).setTarget(Math.atan2(vy, vx));
  };
  for (const b of root.querySelectorAll<HTMLElement>('[data-dir]')) {
    const dir = Number(b.dataset.dir);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); onGesture();
      b.setPointerCapture?.(e.pointerId);
      held.set(e.pointerId, dir); steer();
    });
    const release = (e: PointerEvent) => { if (held.delete(e.pointerId)) steer(); };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
  }
  return { anyHeld: () => held.size > 0 };
}
