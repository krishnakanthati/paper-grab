// The follow camera as pure maths: where it looks, how far it is zoomed, how much it shakes. It knows nothing about PixiJS or Three.js
// (so it is testable in Node); whatever draws the scene reads `x`, `y` and `scale` from it. All smoothing is exponential in real time,
// so the camera moves the same at 30, 60 or 144 frames per second and never snaps to a sub-pixel position on its own.
//
// It never rotates: the same fixed pitch and zero yaw and roll for every screen. `pose3D` gives the matching perspective camera for a
// scene drawn on the XZ ground plane (X = a cell's x, Z = a cell's y, Y up), pitched 50 degrees down by default.
import { CAMERA } from '../config.ts';
import { clamp, smoothK } from '../anim/interp.ts';
import { pxPerCell } from './quality.ts';

export interface CameraTarget {
  x: number; y: number;           // where the player is (cells), already interpolated between logic ticks
  angle: number;                  // heading, radians (the view leads ahead along it)
  moving: number;                 // 0..1: how much it is travelling (no lead while standing still)
  cells: number;                  // land owned: the view zooms out a little as it grows
  followMs?: number;              // catch-up time override (a replay glides softer than live play)
  minView?: number;               // never zoom in closer than this many cells across (a replay uses it to keep the thrower on screen)
}

export interface CameraPose { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; distance: number; pitchDeg: number }

export const CAMERA_3D = { pitchDeg: 50, fovDeg: 28 } as const;

/**
 * The perspective camera for a view `viewCells` cells across the screen's shorter side. Distance is chosen from the field of view and
 * the aspect ratio, so the visible width of the arena is the same on a portrait phone, a landscape phone and a desktop window.
 * Zero yaw and roll: it sits straight "south" of the look-at point, `pitchDeg` above the ground, looking north.
 */
export function pose3D(x: number, y: number, viewCells: number, aspect: number, pitchDeg: number = CAMERA_3D.pitchDeg, fovDeg: number = CAMERA_3D.fovDeg): CameraPose {
  const p = (pitchDeg * Math.PI) / 180, half = Math.tan((fovDeg * Math.PI) / 360);
  const shorter = Math.min(Math.max(aspect, 1e-3), 1);                          // the shorter side is the width on a portrait screen, the height otherwise
  const distance = viewCells / (2 * half * shorter);
  return { position: { x, y: distance * Math.sin(p), z: y + distance * Math.cos(p) }, lookAt: { x, y: 0, z: y }, distance, pitchDeg };
}

export function createCameraController(start: { x: number; y: number }) {
  let x = start.x, y = start.y, view: number = CAMERA.baseView + 2, shake = 0, scale = 30, W = 800, H = 600;
  let leadX = 0, leadY = 0;                                 // how far ahead of the player the camera currently looks (cells)
  return {
    /** Advance by `dtMs` towards `target` (null while there is nobody to follow: the camera just stays where it is). */
    update(target: CameraTarget | null, dtMs: number, w: number, h: number) {
      W = Math.max(1, w); H = Math.max(1, h);               // a collapsed window must not divide by zero
      if (target) {
        const kLead = smoothK(dtMs, CAMERA.lookAheadMs);
        leadX += (Math.cos(target.angle) * CAMERA.lookAhead * target.moving - leadX) * kLead;      // eases in and out, so turns never make the view lurch
        leadY += (Math.sin(target.angle) * CAMERA.lookAhead * target.moving - leadY) * kLead;
        const k = smoothK(dtMs, target.followMs ?? CAMERA.followMs);
        x += (target.x + leadX - x) * k; y += (target.y + leadY - y) * k;
        const want = CAMERA.baseView + Math.min(CAMERA.maxGrowth, Math.sqrt(target.cells) * CAMERA.growth);
        view += (Math.max(want, target.minView ?? 0) - view) * smoothK(dtMs, target.minView ? CAMERA.zoomMs * 0.5 : CAMERA.zoomMs);
      }
      scale = pxPerCell(W, H, view);
      shake = Math.max(0, shake - dtMs * CAMERA.shakePerMs);
    },
    /** A random offset in pixels for this frame's shake (0 when it is not shaking). */
    shakeOffset(random: () => number = Math.random): { dx: number; dy: number } {
      return shake ? { dx: (random() - 0.5) * shake * CAMERA.shakePx, dy: (random() - 0.5) * shake * CAMERA.shakePx } : { dx: 0, dy: 0 };
    },
    /** Shake the view: strength 0..1 (1 = the biggest jolt). A stronger one always wins over a weaker one still playing. */
    kick(strength = 1) { shake = Math.max(shake, clamp(strength, 0, 1)); },
    get x() { return x; }, get y() { return y; },
    get view() { return view; },
    get scale() { return scale; },
    get shaking() { return shake; },
    /** Visible world rectangle in cells (for the minimap). */
    viewport() { return { x: x - W / scale / 2, y: y - H / scale / 2, w: W / scale, h: H / scale }; },
    /** The perspective camera for the current view (see pose3D). */
    pose(pitchDeg?: number, fovDeg?: number): CameraPose { return pose3D(x, y, Math.min(W, H) / scale, W / H, pitchDeg, fovDeg); },
  };
}
export type CameraController = ReturnType<typeof createCameraController>;
