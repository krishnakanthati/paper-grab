// Steering by tilting the phone (the gyroscope / accelerometer, reported by the browser as `deviceorientation`).
// Tilt it the way you want to go, like rolling a ball: the heading follows the direction the phone leans. Holding it
// level (or within the dead zone) keeps the current heading, so you can rest your hands. The pose you hold when a round
// starts is the "level" one, because nobody plays with the phone flat on a table.
//
// The maths is pure (tiltVector, headingFromTilt) so it can be tested without a phone; bindTilt does the wiring.
import { storage } from '../platform/storage.ts';
import { resolve, type GameRef } from './keyboard.ts';

export const TILT = {
  deadzoneDeg: 7,              // leaning less than this changes nothing
  smoothing: 0.25,             // 0..1: how quickly the filtered lean follows the sensor (lower = steadier, higher = snappier)
  resumeAfterMs: 1200,         // after you touch the screen buttons, the tilt stays out of the way for this long
  settleMs: 300,               // wait this long after enabling/re-centring before taking the "level" pose
  storageKey: 'tilt',
};

export interface Pose { beta: number; gamma: number }

/** Wrap an angle in degrees to -180..180. */
export const wrapDeg = (a: number) => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };

/**
 * The lean as a vector in SCREEN coordinates (x right, y down), in degrees. The browser reports beta (front/back tilt) and
 * gamma (left/right tilt) in the device's own frame; when the screen is rotated (landscape) the axes swap, so `angle`
 * (screen.orientation.angle: 0, 90, 180, 270) turns them back to what the player sees.
 * Leaning the top edge down = beta falling = "forward" = up the screen; right edge down = gamma rising = right.
 */
export function tiltVector(pose: Pose, rest: Pose, angle: number): [number, number] {
  const b = wrapDeg(pose.beta - rest.beta), g = wrapDeg(pose.gamma - rest.gamma);
  switch (((Math.round(angle / 90) % 4) + 4) % 4) {
    case 1: return [-b, -g];
    case 2: return [-g, -b];
    case 3: return [b, g];
    default: return [g, b];
  }
}

/** Heading (radians, game convention: 0 = right, y down) for a lean, or null while it is inside the dead zone. */
export function headingFromTilt(dx: number, dy: number, deadzoneDeg = TILT.deadzoneDeg): number | null {
  return Math.hypot(dx, dy) < deadzoneDeg ? null : Math.atan2(dy, dx);
}

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

export interface TiltOptions {
  game: GameRef;
  busy(): boolean;             // true while the on-screen arrows or keys are in use: the tilt stays out of their way
  coarse?: boolean;            // only offer tilt on touch devices (default: detected)
}

export function bindTilt(o: TiltOptions) {
  const hasApi = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const coarse = o.coarse ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  let supported = hasApi && coarse, on = false, listening = false;
  let rest: Pose | null = null, latest: Pose | null = null, settleAt = 0, quietUntil = 0, fx = 0, fy = 0, primed = false;
  const listeners: Array<() => void> = [];
  const stored = () => storage.get(TILT.storageKey) !== 'off';
  const store = (v: boolean) => storage.set(TILT.storageKey, v ? 'on' : 'off');
  const changed = () => { for (const cb of listeners) cb(); };

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    latest = { beta: e.beta, gamma: e.gamma };
    const now = performance.now();
    if (!rest) { if (now >= settleAt) rest = { ...latest }; else return; }
    if (!on) return;
    if (o.busy()) { quietUntil = now + TILT.resumeAfterMs; return; }
    if (now < quietUntil) return;
    const [dx, dy] = tiltVector(latest, rest, typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0);
    if (!primed) { fx = dx; fy = dy; primed = true; } else { fx += (dx - fx) * TILT.smoothing; fy += (dy - fy) * TILT.smoothing; }
    const heading = headingFromTilt(fx, fy);
    const g = resolve(o.game);
    if (heading !== null && g.running) g.setTarget(heading);
  };
  const listen = () => { if (!listening) { window.addEventListener('deviceorientation', onOrient); listening = true; } };

  const api = {
    get supported() { return supported; },
    enabled: () => on,
    /** Take the pose the phone is held in right now as "level" (called when a round starts). */
    recentre() { rest = null; primed = false; settleAt = performance.now() + TILT.settleMs; },
    /**
     * Turn tilt steering on. On iOS the browser only allows it after a permission prompt, which must be asked from a tap:
     * call this from the play button. Resolves false if there is no sensor or permission was refused.
     */
    async enable(): Promise<boolean> {
      if (!supported) return false;
      const ctor = (window as unknown as { DeviceOrientationEvent: OrientationCtor }).DeviceOrientationEvent;
      if (typeof ctor.requestPermission === 'function') {
        try { if ((await ctor.requestPermission()) !== 'granted') { supported = false; changed(); return false; } } catch { supported = false; changed(); return false; }
      }
      listen(); on = true; store(true); api.recentre(); changed();
      return true;
    },
    /** The player's own on/off switch. Returns whether tilt is now on. */
    toggle() { if (!supported) return false; on = !on; store(on); if (on) { listen(); api.recentre(); } changed(); return on; },
    wantedByDefault: () => stored(),
    onChange(cb: () => void) { listeners.push(cb); },
    dispose() { window.removeEventListener('deviceorientation', onOrient); listening = false; },
  };
  return api;
}
export type Tilt = ReturnType<typeof bindTilt>;
