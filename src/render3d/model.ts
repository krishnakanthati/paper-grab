// One 3D character: a rounded, slightly glossy body with a white outline rim, big eyes, two little feet, and a crown
// that is shown only on the leader. Geometry is shared between all characters; only the colour materials differ.
import {
  BackSide, BufferGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Quaternion, Shape, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GOLD, INK_SHADOW, PUPIL, WHITE, mix } from '../render/palette.ts';
import { decorate, disposeDecor, type Decor } from './decor.ts';
import type { Species } from './species.ts';
import { CHARACTER as C } from './tuning.ts';

let shared: {
  body: RoundedBoxGeometry; rim: RoundedBoxGeometry; eye: SphereGeometry; pupil: SphereGeometry; foot: RoundedBoxGeometry;
  arm: CylinderGeometry; hand: SphereGeometry;
  crown: ExtrudeGeometry; shadow: CircleGeometry; rimMat: MeshBasicMaterial; eyeMat: MeshStandardMaterial; pupilMat: MeshStandardMaterial;
  crownMat: MeshStandardMaterial; shadowMat: MeshBasicMaterial;
} | null = null;

function crownShape(): Shape {
  const s = new Shape();                                   // five-point crown outline, 0.7 wide, in x/y
  s.moveTo(-0.35, 0); s.lineTo(-0.35, 0.34); s.lineTo(-0.18, 0.16); s.lineTo(0, 0.42); s.lineTo(0.18, 0.16); s.lineTo(0.35, 0.34); s.lineTo(0.35, 0); s.closePath();
  return s;
}

function getShared() {
  if (shared) return shared;
  const [w, d, h] = C.bodySize, [fw, fd, fh] = C.footSize, o = C.outline;
  shared = {
    body: new RoundedBoxGeometry(w, d, h, C.bodySegments, C.bodyRadius),
    rim: new RoundedBoxGeometry(w + o * 2, d + o * 2, h + o * 2, C.bodySegments, C.bodyRadius + o),
    eye: new SphereGeometry(C.eyeRadius, C.eyeSegments[0], C.eyeSegments[1]),
    pupil: new SphereGeometry(C.pupilRadius, C.pupilSegments[0], C.pupilSegments[1]),
    foot: new RoundedBoxGeometry(fw, fd, fh, 3, 0.07),
    arm: new CylinderGeometry(0.1, 0.1, 1, 12), hand: new SphereGeometry(0.16, 16, 12),
    crown: new ExtrudeGeometry(crownShape(), { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }),
    shadow: new CircleGeometry(0.5, 28),
    rimMat: new MeshBasicMaterial({ color: WHITE, side: BackSide }),
    eyeMat: new MeshStandardMaterial({ color: WHITE, roughness: 0.25 }),
    pupilMat: new MeshStandardMaterial({ color: PUPIL, roughness: 0.2 }),
    crownMat: new MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.35 }),
    shadowMat: new MeshBasicMaterial({ color: INK_SHADOW, transparent: true, opacity: C.shadowAlpha, depthWrite: false }),
  };
  return shared;
}

export interface Character3D {
  /** Sits on the ground at the character's position; the ground shadow lives here and is never tipped. */
  ground: Group;
  /** Upright (the camera does the looking down); everything that stands up lives under it. */
  tilt: Group;
  /** Rotates to the heading, then holds the body, eyes, feet and crown. */
  facing: Group;
  body: Mesh; rim: Mesh; eyes: Mesh[]; pupils: Mesh[]; feet: Mesh[]; crown: Mesh; shadow: Mesh;
  /** Ears, tail, wings and eye sparkles of the species (empty lists for a plain character). */
  decor: Decor | null;
  /** The character's throwing arm (hidden unless throwing): the sphere at its end is the hand that holds the star. */
  hand: Mesh;
  /**
   * Pose the arm to throw towards (dx, dy) (a unit direction in the character's own frame, x forward, y to the side): `wind` 0..1 draws the hand
   * back and up, then `rel` 0..1 flicks it forward and lets go. `null` puts the arm away.
   */
  setArm(aim: { dx: number; dy: number; wind: number; rel: number } | null): void;
  /** Angel look for a death: a glowing halo above and a pair of little flapping wings, grown to `amount` (0 = hidden, 1 = full); `t` is a clock in seconds for the flapping. */
  setAngel(amount: number, t: number): void;
  setCrown(on: boolean): void;
  dispose(): void;                                         // frees this character's own material only: geometry is shared
}

/**
 * `color` is the player's own colour. A plain character is wholly that colour; a character with a `species` looks like that
 * animal and wears the player colour on its feet, so you can still tell whose head is whose.
 */
export function createCharacter(color: number, cast?: Species): Character3D {
  const species = cast && !cast.plain ? cast : undefined;      // 'classic' is the plain, single-colour block
  const s = getShared();
  const [, , h] = C.bodySize;
  const bodyColor = species ? species.body : color;
  const mat = new MeshStandardMaterial({ color: bodyColor, roughness: 0.42, metalness: 0.04, emissive: bodyColor, emissiveIntensity: species ? 0.06 : 0.12 });
  const footMat = species ? new MeshStandardMaterial({ color: species.shoes?.color ?? species.feet ?? color, roughness: 0.45, metalness: 0.04 }) : mat;

  const ground = new Group(), tilt = new Group(), facing = new Group();
  facing.rotation.order = 'ZXY';                           // roll about the forward axis first, then yaw to the heading
  ground.add(tilt); tilt.add(facing);

  const shadow = new Mesh(s.shadow, s.shadowMat);
  shadow.scale.set(0.95, 0.62, 1); shadow.position.set(0.04, -0.12, 0.01);
  ground.add(shadow);

  const body = new Mesh(s.body, mat);
  body.position.z = C.bodyLift + h / 2;
  // a slightly larger back-facing shell reads as an outline: each character's own body colour darkened, so it is crisp on pale land too
  const rimMat = new MeshBasicMaterial({ color: mix(bodyColor, C.outlineInk, C.outlineMix), side: BackSide });
  const rim = new Mesh(s.rim, rimMat);
  rim.position.copy(body.position);
  facing.add(rim, body);

  const eyes: Mesh[] = [], pupils: Mesh[] = [];
  const frontX = C.bodySize[0] / 2;
  for (const side of [-1, 1]) {
    const eye = new Mesh(s.eye, s.eyeMat);
    eye.position.set(frontX - 0.04, side * C.eyeSpacing, C.bodyLift + h * C.eyeHeight);
    eye.scale.set(0.8, 1, 1.08);
    const pupil = new Mesh(s.pupil, s.pupilMat);
    pupil.position.set(frontX + 0.02, side * C.eyeSpacing, C.bodyLift + h * C.eyeHeight);
    facing.add(eye, pupil);
    eyes.push(eye); pupils.push(pupil);
  }

  const feet: Mesh[] = [];
  for (const side of [-1, 1]) {
    const foot = new Mesh(s.foot, footMat);
    foot.position.set(0.04, side * 0.22, C.footSize[2] / 2);
    facing.add(foot);
    feet.push(foot);
  }

  const crown = new Mesh(s.crown, s.crownMat);
  crown.rotation.x = Math.PI / 2;                           // stand the flat outline up so it faces forward
  crown.position.set(0, 0.06, C.crownLift);
  crown.visible = false;
  facing.add(crown);

  // the throwing arm: a short rounded limb in the body's own colour (with the same dark outline shell as the body) from the side of the body to a round hand
  const armGroup = new Group(); armGroup.visible = false;
  const seg = new Group(), segBody = new Mesh(s.arm, mat), segRim = new Mesh(s.arm, rimMat);
  segRim.scale.set(1.5, 1.02, 1.5); seg.add(segRim, segBody);
  const hand = new Mesh(s.hand, mat), handRim = new Mesh(s.hand, rimMat); handRim.scale.setScalar(1.28); hand.add(handRim);
  armGroup.add(seg, hand); facing.add(armGroup);
  const up = new Vector3(0, 1, 0), v = new Vector3(), q = new Quaternion();
  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const setArm = (aim: { dx: number; dy: number; wind: number; rel: number } | null) => {
    if (!aim) { armGroup.visible = false; return; }
    const side = aim.dy >= 0 ? 1 : -1, sx = 0.02, sy = side * (C.bodySize[1] / 2 - 0.02), sz = C.bodyLift + h * 0.5;
    const len = aim.rel > 0 ? -0.55 + 1.35 * ease(aim.rel) : 0.3 - 0.85 * aim.wind;           // reaches out, draws back, then flicks forward
    const lift = aim.rel > 0 ? 0.28 * (1 - ease(aim.rel)) : 0.28 * aim.wind;                   // cocked up while it winds up
    const hx = sx + aim.dx * len, hy = sy + aim.dy * len, hz = sz + lift;
    hand.position.set(hx, hy, hz);
    v.set(hx - sx, hy - sy, hz - sz); const L = Math.max(0.001, v.length());
    seg.position.set((hx + sx) / 2, (hy + sy) / 2, (hz + sz) / 2); seg.scale.set(1, L, 1); seg.quaternion.copy(q.setFromUnitVectors(up, v.divideScalar(L)));
    armGroup.visible = true;
  };

  // the angel look for a death: a halo, and a big pair of feathered wings (four fanned feathers each, white with a dark outline so they read on any floor)
  const angel = new Group(); angel.visible = false; facing.add(angel);
  const haloMat = new MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffd24a, emissiveIntensity: 0.9, roughness: 0.3 });
  const haloRim = new MeshBasicMaterial({ color: 0xb8860b, side: BackSide });
  const wingMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.5 });
  const wingRim = new MeshBasicMaterial({ color: 0x5a6a8a, side: BackSide });
  const haloGeo = new TorusGeometry(0.34, 0.065, 12, 36);
  const halo = new Mesh(haloGeo, haloMat); halo.position.set(0, 0, C.bodyLift + h + 0.42); halo.add(new Mesh(haloGeo, haloRim)); (halo.children[0] as Mesh).scale.setScalar(1.18); angel.add(halo);
  const FEATHERS = [{ a: -0.2, len: 1.0 }, { a: 0.15, len: 1.3 }, { a: 0.5, len: 1.2 }, { a: 0.85, len: 0.9 }];   // fanned from straight out to swept back
  const wings = [-1, 1].map(side => {
    const pivot = new Group(); pivot.position.set(-0.1, side * (C.bodySize[1] / 2 - 0.06), C.bodyLift + h * 0.6);
    for (const f of FEATHERS) {
      const feather = new Mesh(s.hand, wingMat), rim = new Mesh(s.hand, wingRim);
      const reach = 0.3 * f.len;
      feather.scale.set(0.5, 1.9 * f.len, 0.32); rim.scale.set(1.2, 1.1, 1.3);
      feather.position.set(-Math.sin(f.a) * reach * 1.3, side * Math.cos(f.a) * reach * 1.3, 0);
      feather.rotation.z = side * f.a; feather.add(rim);
      pivot.add(feather);
    }
    angel.add(pivot); return { pivot, side };
  });
  const setAngel = (amount: number, t: number) => {
    if (amount <= 0.001) { angel.visible = false; return; }
    angel.visible = true; angel.scale.setScalar(Math.max(0.01, amount));
    halo.position.z = C.bodyLift + h + 0.42 + Math.sin(t * 4) * 0.03; halo.rotation.z = t * 1.5;
    for (const w of wings) w.pivot.rotation.x = w.side * (0.45 + Math.sin(t * 7) * 0.3);      // the wings lift up and out and beat
  };

  const decor = species ? decorate(species, facing, eyes, pupils, feet, color) : null;
  return {
    ground, tilt, facing, body, rim, eyes, pupils, feet, crown, shadow, decor, hand, setArm, setAngel,
    setCrown(on) { crown.visible = on; },
    dispose() { haloMat.dispose(); haloRim.dispose(); wingMat.dispose(); wingRim.dispose(); haloGeo.dispose(); mat.dispose(); rimMat.dispose(); if (footMat !== mat) footMat.dispose(); decor?.dispose(); },
  };
}

/** Free the shared geometry and materials (only when the whole 3D layer is torn down). */
export function disposeShared() {
  if (!shared) return;
  for (const v of Object.values(shared) as Array<BufferGeometry | MeshBasicMaterial | MeshStandardMaterial>) v.dispose();
  shared = null;
  disposeDecor();
}
