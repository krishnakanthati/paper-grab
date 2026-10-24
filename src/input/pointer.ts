// Mouse: head towards the cursor (the camera keeps you centred, so the cursor's angle from the screen centre is
// your heading). Touch / pen: drag anywhere, the direction of your latest stroke is your heading.
// While a key or an on-screen button is held, the pointer is ignored so the two inputs never fight.
import { CAMERA_3D } from '../render/cameraController.ts';
import { resolve, type GameRef } from './keyboard.ts';

/** The ground is seen at a slant: a step on screen is this much shorter than the same step on the ground along the screen's vertical, so heading is read with that undone. */
export const GROUND_FORESHORTEN = Math.sin((CAMERA_3D.pitchDeg * Math.PI) / 180);
/** The heading a screen offset (dx, dy pixels, y down) points to on the tilted ground. */
export const headingOnGround = (dx: number, dy: number) => Math.atan2(dy / GROUND_FORESHORTEN, dx);

export const MOUSE_DEADZONE_PX = 24;     // the cursor must be this far from the centre to steer
export const DRAG_MIN_PX = 14;           // a touch stroke must be at least this long to count as steering

export const DOUBLE_TAP_MS = 320, DOUBLE_TAP_PX = 40;

export function bindPointer(gameRef: GameRef, onGesture: () => void, suppress: () => boolean = () => false, onDoubleTap: () => void = () => {}) {
  let ax = 0, ay = 0, lastTap = -Infinity, lastX = 0, lastY = 0;
  window.addEventListener('pointerdown', e => {
    onGesture(); ax = e.clientX; ay = e.clientY;
    if ((e.target as Element | null)?.closest?.('button, a, input, #ov, #dpad')) { lastTap = -Infinity; return; }     // taps on the interface are not tricks
    const now = performance.now();
    if (now - lastTap <= DOUBLE_TAP_MS && Math.hypot(e.clientX - lastX, e.clientY - lastY) <= DOUBLE_TAP_PX) { lastTap = -Infinity; onDoubleTap(); }
    else { lastTap = now; lastX = e.clientX; lastY = e.clientY; }
  });
  window.addEventListener('pointermove', e => {
    const game = resolve(gameRef);
    if (!game.running || suppress()) return;
    if (e.pointerType === 'mouse') {
      const dx = e.clientX - window.innerWidth / 2, dy = e.clientY - window.innerHeight / 2;
      if (Math.hypot(dx, dy) > MOUSE_DEADZONE_PX) game.setTarget(headingOnGround(dx, dy));
    } else {
      const dx = e.clientX - ax, dy = e.clientY - ay;
      if (Math.hypot(dx, dy) > DRAG_MIN_PX) { game.setTarget(headingOnGround(dx, dy)); ax = e.clientX; ay = e.clientY; }   // re-anchor: the latest stroke decides
    }
  });
}
