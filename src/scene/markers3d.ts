// Things lying on or floating over the map: beacons (a glowing circle on the ground showing what the burst will claim, ripples spreading
// from a floating orb, sparkles circling it), power-up orbs (a floating, bobbing disc with a symbol), and the aura round any player with an
// effect running. Flat parts are drawn with a GroundBatch; orbs, glows and icons are billboard sprites. The numbers for how it all looks are
// in BEACON_LOOK / PICKUP_LOOK; how it plays is BEACON / POWERUP (config.ts).
import { Group, Sprite, SpriteMaterial } from 'three';
import { BEACON, POWERUP } from '../config.ts';
import type { Game, PowerKind } from '../game/index.ts';
import { GroundBatch } from './groundBatch.ts';
import { glowTexture, iconTexture, orbTexture, ringTexture, sparkTexture } from './spriteTextures.ts';

export const BEACON_LOOK = {
  colors: { area: 0xd8f57a, areaEdge: 0xffffff, glow: 0xb7f06a, orb: 0x9b6bff, orbCore: 0xe6d8ff, orbRing: 0xffffff, spark: 0xfff3a0, pointer: 0x9b6bff },
  popMs: 520,                    // how long the pop-in takes
  rippleMs: 2400, ripples: 2,    // expanding rings from the orb: how long one takes, how many are out at once
  orbRadius: 0.8, orbBobCells: 0.12, bobHz: 0.9, orbHeight: 1.05,
  sparks: 6, sparkOrbit: 1.45, sparkSize: 0.11, spinHz: 0.35,
  blinkLastTicks: 30 * 6, blinkHz: 5,   // in its last seconds the whole thing blinks
  pointer: { inset: 26, radius: 15, arrow: 7, pulseHz: 1.4 },     // px
};
export const PICKUP_LOOK = {
  colors: { boost: 0xffa51f, shield: 0x3aa0ff, freeze: 0x8fe3ff, magnet: 0xff6fb5 } as Record<PowerKind, number>,
  radius: 0.85, bobCells: 0.1, bobHz: 0.9, popMs: 380, height: 1.0,
  blinkLastTicks: 30 * 4, blinkHz: 5,
  aura: { radius: 1.45, pulseHz: 1.6 },
};

const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1, u = Math.max(0, Math.min(1, t)); return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

/** Where a beacon's pointer sits on a screen of w x h: the beacon's position pulled in to the edge (with an inset) when it is off screen, else null. */
export function pointerFor(sx: number, sy: number, w: number, h: number, inset: number): { x: number; y: number; angle: number } | null {
  if (sx >= inset && sx <= w - inset && sy >= inset && sy <= h - inset) return null;
  const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
  const k = Math.min((cx - inset) / (Math.abs(dx) || 1e-9), (cy - inset) / (Math.abs(dy) || 1e-9));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

const makeSprite = (map: ReturnType<typeof glowTexture>, color: number, order: number) => {
  const s = new Sprite(new SpriteMaterial({ map, color, transparent: true, depthWrite: false, depthTest: true }));
  s.renderOrder = order; s.visible = false;
  return s;
};
const place = (s: Sprite, x: number, y: number, z: number, size: number, alpha: number) => { s.visible = alpha > 0.002 && size > 0; s.position.set(x, y, z); s.scale.set(size, size, 1); (s.material as SpriteMaterial).opacity = alpha; };

export function createBeacons3D(game: Game) {
  const group = new Group(), flat = new GroundBatch(0.14, 8);
  group.add(flat.mesh);
  const L = BEACON_LOOK, C = L.colors, firstSeen = new Map<number, number>();
  interface Orb { root: Group; halo: Sprite; halo2: Sprite; body: Sprite; core: Sprite; hi: Sprite; ring: Sprite; sparks: Sprite[] }
  const orbs = new Map<number, Orb>();
  const orbFor = (id: number): Orb => {
    let o = orbs.get(id);
    if (!o) {
      const root = new Group(), halo = makeSprite(glowTexture(), C.orb, 9), halo2 = makeSprite(glowTexture(), C.orb, 9), body = makeSprite(orbTexture(), C.orb, 10), core = makeSprite(glowTexture(), C.orbCore, 11), hi = makeSprite(glowTexture(), 0xffffff, 12), ring = makeSprite(ringTexture(), C.orbRing, 12);
      const sparks = Array.from({ length: L.sparks }, () => makeSprite(sparkTexture(), C.spark, 12));
      for (const s of [halo, halo2, body, core, hi, ring, ...sparks]) root.add(s);
      group.add(root); o = { root, halo, halo2, body, core, hi, ring, sparks }; orbs.set(id, o);
    }
    return o;
  };
  const dropOrb = (id: number) => { const o = orbs.get(id); if (!o) return; group.remove(o.root); for (const s of o.root.children as Sprite[]) (s.material as SpriteMaterial).dispose(); orbs.delete(id); };

  return {
    group,
    /** Beacons currently on the map with where to point at them (world x, z), for the screen-edge pointers. */
    positions: () => game.beacons.map(b => ({ id: b.id, x: b.x, z: b.y })),
    update(nowMs: number) {
      flat.begin();
      const live = new Set<number>();
      for (const b of game.beacons) {
        live.add(b.id);
        if (!firstSeen.has(b.id)) firstSeen.set(b.id, nowMs);
        const t = (nowMs - firstSeen.get(b.id)!) / 1000, pop = Math.max(0.0001, easeOutBack((nowMs - firstSeen.get(b.id)!) / L.popMs));
        const left = BEACON.lifetimeTicks - (game.tickCount - b.born);
        const blink = left < L.blinkLastTicks ? 0.55 + 0.45 * Math.abs(Math.sin(nowMs / 1000 * Math.PI * L.blinkHz)) : 1;
        const R = BEACON.radius * pop * (1 + 0.015 * Math.sin(t * 2.4)), x = b.x, z = b.y;
        // the circle it will claim
        flat.circle(x, z, R * 1.1, C.glow, 0.1 * blink, 48);
        flat.circle(x, z, R, C.area, 0.2 * blink, 48);
        flat.ring(x, z, R, 0.7, C.glow, 0.2 * blink, 48);
        flat.ring(x, z, R, 0.2, C.areaEdge, 0.95 * blink, 48);
        for (let i = 0; i < L.ripples; i++) {                                // ripples spreading from the orb
          const p = ((nowMs / L.rippleMs) + i / L.ripples) % 1;
          flat.ring(x, z, Math.max(0.01, R * p), 0.14, C.areaEdge, (1 - p) * 0.7 * blink, 40);
        }
        // the orb floats above the ground, bobbing a little, with a glow, a bright core and a ring
        const bob = Math.sin(t * Math.PI * 2 * L.bobHz) * L.orbBobCells, y = L.orbHeight + bob, r = L.orbRadius * pop, o = orbFor(b.id);
        place(o.halo, x, y, z, r * 4.2, 0.16 * blink); place(o.halo2, x, y, z, r * 3, 0.28 * blink);
        place(o.body, x, y, z, r * 2, blink); place(o.core, x - r * 0.1, y + r * 0.1, z, r * 1.1, 0.9 * blink);
        place(o.hi, x - r * 0.2, y + r * 0.22, z, r * 0.4, 0.95 * blink); place(o.ring, x, y, z, r * 2, 0.9 * blink);
        for (let i = 0; i < L.sparks; i++) {                                 // sparkles circling it
          const a = t * Math.PI * 2 * L.spinHz + (i / L.sparks) * Math.PI * 2, pr = L.sparkOrbit * pop, tw = 0.6 + 0.4 * Math.sin(t * 5 + i * 1.7);
          place(o.sparks[i], x + Math.cos(a) * pr, y + Math.sin(a * 2) * 0.12, z + Math.sin(a) * pr * 0.7, L.sparkSize * 3.2 * tw, 0.95 * blink);
        }
      }
      for (const id of firstSeen.keys()) if (!live.has(id)) { firstSeen.delete(id); dropOrb(id); }
      flat.end();
    },
    dispose() { for (const id of [...orbs.keys()]) dropOrb(id); flat.dispose(); },
  };
}
export type Beacons3D = ReturnType<typeof createBeacons3D>;

export function createPickups3D(game: Game) {
  const group = new Group(), flat = new GroundBatch(0.15, 8);
  group.add(flat.mesh);
  const L = PICKUP_LOOK, firstSeen = new Map<number, number>();
  interface Orb { root: Group; halo: Sprite; halo2: Sprite; body: Sprite; ring: Sprite; icon: Sprite }
  const orbs = new Map<number, Orb>();
  const orbFor = (id: number, kind: PowerKind): Orb => {
    let o = orbs.get(id);
    if (!o) {
      const col = L.colors[kind], root = new Group(), halo = makeSprite(glowTexture(), col, 9), halo2 = makeSprite(glowTexture(), col, 9), body = makeSprite(orbTexture(), col, 10), ring = makeSprite(ringTexture(), 0xffffff, 11), icon = makeSprite(iconTexture(kind), 0xffffff, 12);
      for (const s of [halo, halo2, body, ring, icon]) root.add(s);
      group.add(root); o = { root, halo, halo2, body, ring, icon }; orbs.set(id, o);
    }
    return o;
  };
  const dropOrb = (id: number) => { const o = orbs.get(id); if (!o) return; group.remove(o.root); for (const s of o.root.children as Sprite[]) (s.material as SpriteMaterial).dispose(); orbs.delete(id); };
  const freezeIcons: Sprite[] = [];
  const iconFor = (i: number) => { while (freezeIcons.length <= i) { const s = makeSprite(iconTexture('freeze'), 0xffffff, 12); freezeIcons.push(s); group.add(s); } return freezeIcons[i]; };

  return {
    group,
    update(nowMs: number, f: number) {
      flat.begin();
      const live = new Set<number>();
      for (const k of game.pickups) {
        live.add(k.id);
        if (!firstSeen.has(k.id)) firstSeen.set(k.id, nowMs);
        const seen = nowMs - firstSeen.get(k.id)!, t = seen / 1000, pop = Math.max(0.0001, easeOutBack(seen / L.popMs));
        const left = POWERUP.lifetimeTicks - (game.tickCount - k.born);
        const blink = left < L.blinkLastTicks ? 0.55 + 0.45 * Math.abs(Math.sin(nowMs / 1000 * Math.PI * L.blinkHz)) : 1;
        const r = L.radius * pop, y = L.height + Math.sin(t * Math.PI * 2 * L.bobHz) * L.bobCells, o = orbFor(k.id, k.kind);
        place(o.halo, k.x, y, k.y, r * 4.4, 0.14 * blink); place(o.halo2, k.x, y, k.y, r * 3, 0.26 * blink);
        place(o.body, k.x, y, k.y, r * 2, blink); place(o.ring, k.x, y, k.y, r * 2, 0.95 * blink); place(o.icon, k.x, y, k.y, r * 1.05, blink);
        flat.circle(k.x, k.y, r * 0.9, 0x000000, 0.1 * blink, 20);               // a faint shadow under it
      }
      for (const id of firstSeen.keys()) if (!live.has(id)) { firstSeen.delete(id); dropOrb(id); }
      // auras round players with an effect running
      let icons = 0;
      for (const p of game.players) {
        if (!p.alive || (p.boost <= 0 && p.shield <= 0 && p.frozen <= 0)) continue;
        const x = p.px + (p.x - p.px) * f, z = p.py + (p.y - p.py) * f, pulse = 1 + 0.08 * Math.sin(nowMs / 1000 * Math.PI * 2 * L.aura.pulseHz), R = L.aura.radius * pulse;
        if (p.shield > 0) {
          const fade = p.shield < 30 ? 0.4 + 0.6 * Math.abs(Math.sin(nowMs / 1000 * Math.PI * L.blinkHz)) : 1;     // blinks in its last second
          flat.circle(x, z, R, L.colors.shield, 0.16 * fade, 40);
          flat.ring(x, z, R, 0.14, 0xffffff, 0.85 * fade, 40);
        }
        if (p.frozen > 0) {
          flat.circle(x, z, R, L.colors.freeze, 0.4, 40);
          flat.ring(x, z, R, 0.14, 0xffffff, 0.95, 40);
          place(iconFor(icons++), x, 2.9, z, R * 0.8, 0.95);
        }
        if (p.boost > 0) {
          const a = p.angle + Math.PI;                                       // speed streaks trailing behind the head
          for (let i = -1; i <= 1; i++) {
            const sa = a + i * 0.35, len = 1.2 + 0.4 * Math.sin(nowMs / 90 + i);
            flat.line(x + Math.cos(sa) * R * 0.7, z + Math.sin(sa) * R * 0.7, x + Math.cos(sa) * (R * 0.7 + len), z + Math.sin(sa) * (R * 0.7 + len), 0.14, L.colors.boost, 0.85, true);
          }
        }
      }
      for (let i = icons; i < freezeIcons.length; i++) freezeIcons[i].visible = false;
      flat.end();
    },
    dispose() { for (const id of [...orbs.keys()]) dropOrb(id); for (const s of freezeIcons) (s.material as SpriteMaterial).dispose(); flat.dispose(); },
  };
}
export type Pickups3D = ReturnType<typeof createPickups3D>;
