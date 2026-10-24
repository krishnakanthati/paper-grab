// Turns a Species into meshes on a character's `facing` group: ears, snout, nose, beak, patches, horns, tail, wings,
// cheeks. Geometry is shared between every character of a kind; materials are per character (cheap, and disposed with it).
// Coordinates are the character's own: +x is forward, +y is left, +z is up; the body spans x/y +-0.45 and z 0.16..1.02.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, QuadraticBezierCurve3, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DECOR } from './decorTuning.ts';
import type { Species } from './species.ts';
import { CHARACTER as C } from './tuning.ts';

const cache = new Map<string, BufferGeometry>();
const geo = <T extends BufferGeometry>(key: string, make: () => T): T => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g as T; };

export interface Decor {
  ears: Mesh[];                     // wiggle with the run and the idle sway
  tail: Mesh | null;
  wings: Mesh[];
  highlights: Mesh[];               // the sparkle in each eye
  claws: Group[];                   // a crab's pincers (they wave)
  dispose(): void;
}

const TOP = C.bodyLift + C.bodySize[2];          // z of the top face
const FRONT = C.bodySize[0] / 2;                 // x of the front face
const SIDE = C.bodySize[1] / 2;                  // |y| of the side faces
const SIDES = [-1, 1] as const;
const D = DECOR;
const heightAt = (frac: number) => C.bodyLift + C.bodySize[2] * frac;       // z at a share of the body height

export function decorate(sp: Species, facing: Group, eyes: Mesh[], pupils: Mesh[], feet: Mesh[] = [], playerColor = 0xffffff): Decor {
  const mats: MeshStandardMaterial[] = [];
  const mat = (color: number, rough: number = D.rough.default, front = false) => { const m = new MeshStandardMaterial({ color, roughness: rough, metalness: D.metalness }); if (front) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; } mats.push(m); return m; };      // front: drawn on top of the body surface without shimmering
  const add = (g: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new Mesh(g, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); facing.add(mesh); return mesh;
  };
  const box = (key: string, size: readonly [number, number, number], radius: number, segs = 2) => geo(key, () => new RoundedBoxGeometry(size[0], size[1], size[2], segs, radius));
  const ball = geo('ball', () => new SphereGeometry(1, D.ballSegments[0], D.ballSegments[1]));
  const out: Decor = { ears: [], tail: null, wings: [], highlights: [], claws: [], dispose() { for (const m of mats) m.dispose(); } };
  const eyeZ = heightAt(C.eyeHeight), noseZ = heightAt(C.eyeHeight + D.nose.dzFromEye), mouthZ = heightAt(C.mouthHeight);

  // cheeks (blush): flattened balls on the front corners, below the eyes
  const blush = mat(sp.cheek, D.rough.cheek);
  for (const s of SIDES) add(ball, blush, FRONT + D.cheek.forward, s * D.cheek.y, eyeZ + D.cheek.dzFromEye, ...D.cheek.scale);

  // sparkle in the eyes: a big and a small bright dot on each pupil are most of what makes a face read as cute
  const shine = mat(D.colors.white, D.rough.shine);
  for (const pupil of pupils) {
    const { x, y, z } = pupil.position, r = C.pupilRadius;
    for (const k of [D.sparkle.big, D.sparkle.small]) out.highlights.push(add(ball, shine, x + r * k.x, y + k.y, z + r * k.z, k.r, k.r, k.r));
  }

  if (sp.eyePatch) {
    const dark = mat(sp.eyePatch, D.rough.eyePatch);
    for (const s of SIDES) add(ball, dark, FRONT + D.eyePatch.forward, s * C.eyeSpacing, eyeZ, ...D.eyePatch.scale);
    for (const e of eyes) e.position.x += D.eyePatch.eyeNudge;        // eyes sit just in front of their patches
  }

  // ears
  const ear = sp.ears, E = D.ear;
  if (ear.kind !== 'none') {
    const m = mat(ear.color, D.rough.body), inner = ear.inner ? mat(ear.inner, D.rough.inner) : null;
    for (const s of SIDES) {
      let mesh: Mesh;
      const big = ear.size ?? 1;
      if (ear.kind === 'round') {
        mesh = add(ball, m, E.round.x, s * E.round.y, TOP + E.round.dz, E.round.scale[0] * big, E.round.scale[1] * big, E.round.scale[2] * big);
        if (inner) { const i = new Mesh(ball, inner); i.position.set(...E.round.inner.at); i.scale.set(...E.round.inner.scale); mesh.add(i); }
      } else if (ear.kind === 'long') {
        mesh = add(box('longEar', E.long.size, E.long.radius, 3), m, E.long.x, s * E.long.y, TOP + E.long.dz);
        mesh.rotation.x = s * E.long.tilt;
        if (inner) { const i = new Mesh(box('longEarIn', E.long.inner.size, E.long.inner.radius), inner); i.position.x = E.long.inner.x; mesh.add(i); }
      } else if (ear.kind === 'point') {
        mesh = add(geo('coneEar', () => new ConeGeometry(E.point.radius, E.point.height, E.point.sides)), m, E.point.x, s * E.point.y, TOP + E.point.dz);
        mesh.rotation.x = Math.PI / 2; mesh.rotation.z = s * E.point.roll;
        if (inner) { const i = new Mesh(geo('coneEarIn', () => new ConeGeometry(E.point.inner.radius, E.point.inner.height, E.point.sides)), inner); i.position.set(E.point.inner.x, 0, 0); mesh.add(i); }
      } else {
        mesh = add(ball, m, E.floppy.x, s * E.floppy.y * (1 + (big - 1) * 0.3), TOP + E.floppy.dz, E.floppy.scale[0] * big, E.floppy.scale[1] * (1 + (big - 1) * 0.4), E.floppy.scale[2] * big);
        mesh.rotation.x = s * E.floppy.tilt;
      }
      out.ears.push(mesh);
    }
  }

  if (sp.snout) {
    const m = mat(sp.snout.color, D.rough.body), nos = mat(sp.snout.nostrils, D.rough.nostril), N = D.snout.nostril;
    add(box('snout', D.snout.size, D.snout.radius, 3), m, FRONT + D.snout.forward, 0, heightAt(C.eyeHeight + D.snout.dzFromEye));
    for (const s of SIDES) add(ball, nos, FRONT + N.forward, s * N.y, heightAt(C.eyeHeight + N.dzFromEye), ...N.scale);
  }
  if (sp.trunk) {                                                       // an elephant's trunk: a hanging rounded block with a curled tip
    const T = D.trunk, m = mat(sp.trunk, D.rough.body), z = heightAt(C.eyeHeight + T.dzFromEye);
    add(box('trunk', T.size, T.radius, 3), m, FRONT + T.forward, 0, z);
    add(box('trunkTip', T.tipSize, T.tipRadius, 2), m, FRONT + T.forward + T.tipForward, 0, z - T.tipDrop).rotation.y = T.tipTilt;
  }
  if (sp.noseHorn) {                                                    // a rhino's horn: a cone on the snout, pointing forward and up
    const H = D.noseHorn, dir = new Vector3(...H.dir).normalize();
    const horn = add(geo('noseHorn', () => new ConeGeometry(H.radius, H.height, H.sides)), mat(sp.noseHorn, D.rough.body), FRONT + H.forward, 0, heightAt(C.eyeHeight + H.dzFromEye));
    horn.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    horn.position.addScaledVector(dir, H.height / 2);
  }
  if (sp.claws) {                                                         // a crab: two big pincers on arms, and little legs along each side
    const C2 = D.claws, m = mat(sp.claws, D.rough.body), z = heightAt(C2.arm.dz);
    for (const s of SIDES) {
      const claw = new Group();
      claw.position.set(FRONT + C2.arm.forward, s * C2.arm.y, z);
      const arm = new Mesh(box('clawArm', C2.arm.size, C2.arm.radius), m); arm.position.set(0, s * -0.0, 0); claw.add(arm);
      const hand = new Mesh(ball, m); hand.position.set(C2.ball.forward, s * (C2.ball.y - C2.arm.y), 0); hand.scale.set(...C2.ball.scale); claw.add(hand);
      const mouthY = s * (C2.ball.y - C2.arm.y), tipMat = mat(C2.tip.color, D.rough.default);
      for (const k of SIDES) {                                           // the two fingers of the claw: tapering, with a gap between them, their tips curving in to meet
        const finger = new Mesh(geo('clawFinger', () => new ConeGeometry(C2.finger.radius, C2.finger.height, C2.finger.sides)), m);
        finger.position.set(C2.finger.forward, mouthY + k * C2.finger.spread, 0);
        finger.rotation.z = -Math.PI / 2 - k * C2.finger.close;
        claw.add(finger);
        const tip = new Mesh(ball, tipMat);                              // rounded tip so the point is not a needle
        tip.position.set(C2.tip.forward, mouthY + k * C2.tip.spread, 0); tip.scale.setScalar(C2.tip.radius);
        claw.add(tip);
      }
      claw.userData.base = { x: 0, y: 0, z: 0 };
      facing.add(claw); out.claws.push(claw);
    }
    const L = D.legs, legMat = mat(sp.claws, D.rough.body);
    for (const s of SIDES) for (const lx of L.xs) {
      const leg = add(box('crabLeg', L.size, 0.02, 2), legMat, lx, s * (SIDE + 0.04), heightAt(L.dz));
      leg.rotation.x = s * L.tilt;
    }
  }

  if (sp.shoes) {                                                         // shoes ride on the feet, so they swing with each step
    const sh = sp.shoes, body = mat(sh.color, 0.45), sole = mat(sh.sole ?? 0xffffff, 0.7), trim = mat(playerColor, 0.5), lace = mat(0xffffff, 0.6);
    const onFoot = (foot: Mesh, g: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const mesh = new Mesh(g, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); foot.add(mesh); return mesh; };
    for (const foot of feet) {
      if (sh.kind !== 'slipper') onFoot(foot, box('shoeSole', [0.31, 0.27, 0.04], 0.02), sole, 0.015, 0, -0.07);
      if (sh.kind === 'sneaker') {
        onFoot(foot, ball, trim, 0.1, 0, 0.015, 0.085, 0.11, 0.07);                       // toe cap in the player's colour
        for (const x of [-0.02, 0.04]) onFoot(foot, box('lace', [0.025, 0.15, 0.014], 0.006), lace, x, 0, 0.075);
      } else if (sh.kind === 'slipper') {
        onFoot(foot, ball, body, 0.04, 0, 0.03, 0.17, 0.15, 0.1);                         // a soft puffy top
        onFoot(foot, ball, trim, 0.07, 0, 0.1, 0.05, 0.05, 0.05);                         // a pom
      } else if (sh.kind === 'boot') {
        onFoot(foot, box('bootShaft', [0.17, 0.21, 0.1], 0.05), body, -0.045, 0, 0.1);
        onFoot(foot, box('bootCuff', [0.19, 0.23, 0.03], 0.014), trim, -0.045, 0, 0.165);   // cuff in the player's colour
      } else {
        for (const x of [-0.05, 0.04]) onFoot(foot, box('strap', [0.04, 0.25, 0.016], 0.006), trim, x, 0, 0.075);   // sandal straps in the player's colour
      }
    }
  }
  if (sp.nose) add(ball, mat(sp.nose, D.rough.nose), FRONT + D.nose.forward, 0, noseZ, ...D.nose.scale);
  if (sp.beak) {
    const B = D.beak, b = add(geo('beak', () => new ConeGeometry(B.radius, B.height, B.sides)), mat(sp.beak, D.rough.default), FRONT + B.forward, 0, heightAt(C.eyeHeight + B.dzFromEye));
    b.rotation.z = -Math.PI / 2;
  }
  const mouth = sp.mouth ?? 'smile';
  if (!sp.snout && !sp.beak && !sp.trunk && mouth !== 'none') {              // not everyone smiles: each character has its own mouth
    const M = D.smile;
    if (mouth === 'open') {                                                  // a small round "o"
      const O = D.mouthOpen;
      add(ball, mat(D.colors.mouth), FRONT + M.forward, 0, mouthZ, ...O.scale);
      add(ball, mat(0xff7f9f, D.rough.default), FRONT + M.forward + 0.004, 0, mouthZ - 0.02, ...O.tongue);
    } else {
      const m = D.mouths[mouth];
      const curve = new QuadraticBezierCurve3(new Vector3(0, -m.half, m.left), new Vector3(0, 0, m.mid), new Vector3(0, m.half, m.right));
      add(geo(`mouth-${mouth}`, () => new TubeGeometry(curve, M.segments, M.tube, M.radial)), mat(D.colors.mouth), FRONT + M.forward, 0, mouthZ);
    }
  }
  if (sp.horns) for (const s of SIDES) {
    const h = add(geo('horn', () => new ConeGeometry(D.horn.radius, D.horn.height, D.horn.sides)), mat(sp.horns), D.horn.x, s * D.horn.y, TOP + D.horn.dz + D.horn.height / 2 - 0.1);
    h.rotation.x = Math.PI / 2 - s * D.horn.lean;                       // pointing up, leaning out a little
  }
  for (const p of sp.patches ?? []) add(box(`patch${p.size.join('_')}`, p.size, Math.min(...p.size) * D.patchCorner), mat(p.color, D.rough.patch, true), p.at[0], p.at[1], p.at[2]);

  if (sp.tail) {
    const T = D.tail, m = mat(sp.tail.color, D.rough.body), z = heightAt(T.dz), x = -C.bodySize[0] / 2;
    if (sp.tail.kind === 'puff') out.tail = add(ball, m, x + T.puff.back, 0, z, T.puff.radius, T.puff.radius, T.puff.radius);
    else if (sp.tail.kind === 'long') { out.tail = add(box('tailLong', T.long.size, T.long.radius), m, x + T.long.back, 0, z + T.long.dz); out.tail.rotation.y = T.long.yaw; }
    else { out.tail = add(geo('tailCurl', () => new TorusGeometry(T.curl.radius, T.curl.tube, T.curl.segments[0], T.curl.segments[1], Math.PI * T.curl.arc)), m, x + T.curl.back, 0, z); out.tail.rotation.y = T.curl.yaw; }
  }
  if (sp.wings) {
    const W = D.wings, m = mat(sp.wings, D.rough.body);
    for (const s of SIDES) { const w = add(ball, m, W.x, s * (SIDE + W.out), heightAt(W.dz), ...W.scale); w.rotation.x = s * W.tilt; out.wings.push(w); }
    add(geo('wingTuft', () => new SphereGeometry(W.tuft.radius, 10, 8)), m, W.tuft.x, 0, TOP + W.tuft.dz, 1, 1, W.tuft.stretch);
  }

  // details: the small extras that make each character itself
  const R = D.ribbon;
  const ribbon = (m: MeshStandardMaterial, x: number, y: number, z: number) => {           // a bow: a knot and two loops
    add(ball, m, x, y, z, R.knot, R.knot, R.knot);
    for (const k of SIDES) { const c = add(geo('bowLoop', () => new ConeGeometry(R.loop.radius, R.loop.height, R.loop.sides)), m, x, y + k * R.loop.reach, z); c.rotation.x = k > 0 ? 0 : Math.PI; }
  };
  for (const d of sp.details ?? []) {
    const m = mat(d.color ?? D.colors.white, D.rough.body);
    switch (d.kind) {
      case 'stem': {                                                    // a blade of grass held in the mouth, poking out sideways
        const S = D.stem, dir = new Vector3(...S.dir).normalize(), base = new Vector3(FRONT + S.base.forward, S.base.y, mouthZ + S.base.dzMouth);
        const st = add(geo('stem', () => new CylinderGeometry(S.radius, S.radius, S.length, S.sides)), m, 0, 0, 0);
        st.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
        st.position.copy(base).addScaledVector(dir, S.length / 2);
        const tip = add(geo('stemTip', () => new SphereGeometry(1, 8, 6)), m, 0, 0, 0, ...S.tip.scale);
        tip.quaternion.copy(st.quaternion); tip.position.copy(base).addScaledVector(dir, S.length);
        break;
      }
      case 'whiskers': {
        const W = D.whiskers, mid = (W.perSide - 1) / 2;
        for (const s of SIDES) for (let k = 0; k < W.perSide; k++) {
          const w = add(geo('whisker', () => new BoxGeometry(...W.size)), m, FRONT + W.forward, s * W.y, noseZ + W.dzNose + (k - mid) * W.step);
          w.rotation.x = s * (k - mid) * W.fan; w.rotation.z = -s * W.sweep;
        }
        break;
      }
      case 'teeth': for (const s of SIDES) add(box('tooth', D.teeth.size, D.teeth.radius), mat(D.colors.white, D.rough.tooth), FRONT + D.teeth.forward, s * D.teeth.gap, mouthZ + D.teeth.dzMouth); break;
      case 'tongue': add(box('tongue', D.tongue.size, D.tongue.radius), m, FRONT + D.tongue.forward, D.tongue.y, mouthZ + D.tongue.dzMouth); break;
      case 'bow': ribbon(m, D.bow.x, D.bow.y, TOP + D.bow.dzTop); break;
      case 'bowtie': ribbon(m, FRONT + D.bowtie.forward, 0, C.bodyLift + D.bowtie.dzLift); break;
      case 'scarf': case 'collar': {
        const G = D.ring, z = heightAt(G.dz);
        add(geo('ring', () => new TorusGeometry(G.radius, G.tube, G.segments[0], G.segments[1])), m, 0, 0, z);
        if (d.kind === 'scarf') {
          const K = D.scarf.knot, Tl = D.scarf.tail;
          add(box('scarfKnot', K.size, K.radius), m, FRONT + K.forward, K.y, z + K.dz);
          add(box('scarfTail', Tl.size, Tl.radius), m, FRONT + Tl.forward, Tl.y, z + Tl.dz).rotation.x = Tl.tilt;
        }
        if (d.bell) add(ball, mat(D.colors.bell, D.rough.bell), FRONT + D.bell.forward, 0, z + D.bell.dz, D.bell.radius, D.bell.radius, D.bell.radius);
        break;
      }
      case 'flower': {
        const F = D.flower, centre = mat(D.colors.flowerCentre, D.rough.flowerCentre);
        for (let k = 0; k < F.petals; k++) { const a = (k / F.petals) * Math.PI * 2; add(ball, m, F.x + Math.cos(a) * F.ring, F.y + Math.sin(a) * F.ring, TOP + F.dzTop, ...F.petal); }
        add(ball, centre, F.x, F.y, TOP + F.centreDz, ...F.centre);
        break;
      }
      case 'leaf':
        for (const l of [D.leaf.a, D.leaf.b]) add(ball, m, l.at[0], l.at[1], TOP + l.at[2], ...l.scale).rotation.z = l.roll;
        break;
      case 'shell': {                                                   // a half eggshell worn as a hat
        const H = D.shell;
        add(geo('shell', () => new SphereGeometry(H.radius, H.segments[0], H.segments[1], 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, 0, TOP + H.dz, 1, 1, H.squash);
        for (let k = 0; k < H.teeth.count; k++) {
          const a = (k / H.teeth.count) * Math.PI * 2;
          add(geo('shellTooth', () => new ConeGeometry(H.teeth.radius, H.teeth.height, H.teeth.sides)), m, Math.cos(a) * H.teeth.ring, Math.sin(a) * H.teeth.ring, TOP + H.dz + H.teeth.dz).rotation.x = Math.PI;
        }
        break;
      }
      case 'freckles': {
        const F = D.freckles, dot = mat(D.colors.freckle, D.rough.freckle);
        for (const s of SIDES) for (const [dy, dz] of F.dots) add(ball, dot, FRONT + F.forward, s * (F.y + dy), eyeZ + F.dzFromEye + dz, ...F.scale);
        break;
      }
      case 'eyebrows': {
        const B = D.eyebrows;
        for (const s of SIDES) add(geo('brow', () => new BoxGeometry(...B.size)), m, FRONT + B.forward, s * C.eyeSpacing, eyeZ + B.dzFromEye).rotation.x = s * B.tilt;
        break;
      }
      case 'tuft': {
        const U = D.tuft, mid = (U.count - 1) / 2;
        for (let k = 0; k < U.count; k++) { const t = add(geo('tuft', () => new ConeGeometry(U.radius, U.height, U.sides)), m, U.x, (k - mid) * U.spread, TOP + U.dzTop); t.rotation.x = (k - mid) * U.fan; t.rotation.z = U.back; }
        break;
      }
    }
  }
  for (const m of [...out.ears, ...out.wings, ...(out.tail ? [out.tail] : [])]) m.userData.base = { x: m.rotation.x, y: m.rotation.y, z: m.rotation.z };
  return out;
}

/**
 * Secondary motion: ears flop, the tail wags, wings flutter. `t` is a clock in seconds (any phase works), `energy` 0..1.4
 * is how lively the character is: a little at rest, a lot when running or when it has just been poked.
 */
export function wiggle(d: Decor, t: number, energy: number) {
  const W = DECOR.wiggle, e = W.base + energy;
  d.ears.forEach((m, i) => { const b = m.userData.base; m.rotation.x = b.x + Math.sin(t * W.ear.xHz + i * W.ear.phase) * W.ear.xAmp * e; m.rotation.y = b.y + Math.sin(t * W.ear.yHz + i) * W.ear.yAmp * e; });
  d.claws.forEach((c, i) => { c.rotation.z = Math.sin(t * W.claw.hz + i * Math.PI) * W.claw.amp * e; });
  if (d.tail) { const b = d.tail.userData.base; d.tail.rotation.z = b.z + Math.sin(t * W.tail.hz) * W.tail.amp * e; }
  d.wings.forEach((m, i) => { const b = m.userData.base; m.rotation.x = b.x + (i ? 1 : -1) * Math.max(0, Math.sin(t * W.wing.hz)) * W.wing.amp * e; });
}

/** How many shared geometries are cached (it must stay a small constant however many characters come and go). */
export const decorGeometryCount = () => cache.size;

export function disposeDecor() { for (const g of cache.values()) g.dispose(); cache.clear(); }
