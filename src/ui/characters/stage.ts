// The 3D stage behind the character-select screen: a glowing pedestal, one character on it that breathes, hops, blinks,
// wiggles its ears and tail, and boings when poked; swapping characters shrinks the old one away and pops the new one in
// with a jelly overshoot. Its own small WebGL renderer, created when the screen opens and disposed when it closes.
import {
  AdditiveBlending, AmbientLight, CanvasTexture, CircleGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Group, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { colorOf } from '../../render/palette.ts';
import { createCharacter, easeOutBack, speciesById, wiggle, type Character3D } from '../../render3d/index.ts';
import { Jelly } from './jelly.ts';
import { STAGE as S } from './tuning.ts';

const pixelRatio = () => Math.min(Math.max(window.devicePixelRatio || 1, 1), S.maxPixelRatio);

export interface Stage {
  /** Show this character. `animate` false puts it there instantly (first open). */
  show(id: string, animate?: boolean): void;
  poke(): void;
  /** A minimal giggle (hover): a quick shake and a little squeeze. */
  tickle(): void;
  /** A happy little celebration (used when the player picks "use"). */
  cheer(): void;
  resize(): void;
  dispose(): void;
}

interface Actor { c: Character3D; jelly: Jelly; born: number; leaveAt: number; nextBlink: number; blinkAt: number; spinSeed: number }

const D2R = Math.PI / 180;
const glowTexture = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = cv.getContext('2d')!; ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new CanvasTexture(cv);
};

/** Returns null when WebGL is unavailable (the screen then just shows the name and the buttons). */
export function createStage(host: HTMLElement, opts: { compact?: boolean } = {}): Stage | null {
  const compact = !!opts.compact;                                      // inline picker: just the character, framed tight, no pedestal
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(pixelRatio());
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation;cursor:pointer;';
  host.appendChild(canvas);

  const scene = new Scene();                                          // z is up; the character faces +x, towards the camera
  scene.add(new AmbientLight(0xffffff, S.light.ambient));
  const key = new DirectionalLight(S.colors.sun, S.light.key); key.position.set(4, -3, 6); scene.add(key);
  const rim = new DirectionalLight(S.colors.rim, S.light.rim); rim.position.set(-4, 3, 2); scene.add(rim);

  // pedestal, the glow on it and a faint beam of light above it
  const P = S.pedestal, glowTex = glowTexture();
  const disc = new Mesh(new CylinderGeometry(P.radius, P.radius * 1.04, P.height, 56), new MeshStandardMaterial({ color: S.colors.pedestal, roughness: 0.35, emissive: S.colors.glow, emissiveIntensity: 0.55 }));
  disc.rotation.x = Math.PI / 2; disc.position.z = -P.height / 2;
  const glow = new Mesh(new CircleGeometry(P.glowRadius, 48), new MeshBasicMaterial({ map: glowTex, color: S.colors.glow, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  glow.position.z = 0.012;
  const beam = new Mesh(new CylinderGeometry(P.beamTop, P.radius, P.beamHeight, 40, 1, true), new MeshBasicMaterial({ color: S.colors.beam, transparent: true, opacity: P.beamOpacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  beam.rotation.x = Math.PI / 2; beam.position.z = P.beamHeight / 2;
  if (!compact) scene.add(disc, glow, beam);
  else { glow.scale.setScalar(S.compactGlow.scale); (glow.material as MeshBasicMaterial).opacity = S.compactGlow.opacity; scene.add(glow); }   // a soft pool of light under its feet

  const camera = new PerspectiveCamera(S.fov, 1, 0.1, 100);
  const frame = () => {                                              // keep the pedestal and the tallest character on screen at any shape
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(pixelRatio());                            // follows browser zoom and moving between screens, so it never goes soft
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const t = Math.tan((S.fov * D2R) / 2);
    const hh = compact ? S.compact.halfHeight : S.fitHalfHeight, hw = compact ? S.compact.halfWidth : S.fitHalfWidth;
    const dist = Math.max(hh / t, hw / (t * camera.aspect)), el = (compact ? S.compact.elevationDeg : S.elevationDeg) * D2R;
    camera.up.set(0, 0, 1);
    const lookZ = compact ? S.compact.lookAtZ : S.lookAtZ;
    camera.position.set(Math.cos(el) * dist, 0, lookZ + Math.sin(el) * dist);
    camera.lookAt(0, 0, lookZ);
  };

  const stageGroup = new Group(); scene.add(stageGroup);
  let current: Actor | null = null; const leaving: Actor[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  const spawn = (id: string, now: number, instant: boolean): Actor => {
    const c = createCharacter(colorOf(1), speciesById(id));
    c.tilt.rotation.x = 0;                                           // the game tips characters towards its camera; here the camera does the looking
    c.shadow.visible = false;
    c.ground.scale.setScalar(compact ? 1 : S.charScale);
    stageGroup.add(c.ground);
    const a: Actor = { c, jelly: new Jelly(), born: instant ? now - S.popMs : now, leaveAt: -1, nextBlink: now + rnd(...S.blinkEveryMs), blinkAt: -1, spinSeed: Math.random() };
    if (!instant) a.jelly.poke(Math.random() < 0.5 ? -1 : 1, S.poke.arrive);  // lands with a wobble
    return a;
  };
  const retire = (a: Actor, now: number) => { a.leaveAt = now; leaving.push(a); };
  const free = (a: Actor) => { stageGroup.remove(a.c.ground); a.c.dispose(); };

  const pose = (a: Actor, dt: number, now: number) => {
    const j = a.jelly.step(dt);
    const age = now - a.born, leave = a.leaveAt < 0 ? 0 : (now - a.leaveAt) / S.leaveMs;
    const grow = a.leaveAt < 0 ? Math.max(0.0001, easeOutBack(age / S.popMs)) : Math.max(0, 1 - leave * leave);
    const { c } = a;
    c.ground.scale.setScalar((compact ? 1 : S.charScale) * grow);
    c.facing.rotation.set(j.roll, 0, Math.sin(now / 1000 * Math.PI * 2 * S.idleSwayHz + a.spinSeed * S.swaySeedSpread) * S.idleSwayRad + j.yaw + (a.leaveAt < 0 ? 0 : leave * S.leaveSpin), 'ZXY');
    c.facing.rotation.x = j.roll;
    c.facing.scale.set(j.sx, j.sy, j.sz);
    c.facing.position.z = j.hop;
    if (now >= a.nextBlink) { a.blinkAt = now; a.nextBlink = now + rnd(...S.blinkEveryMs); }
    let blink = 1;
    if (a.blinkAt >= 0) { const k = (now - a.blinkAt) / S.blinkMs; if (k >= 1) a.blinkAt = -1; else blink = 1 - Math.sin(k * Math.PI) * 0.9; }
    for (const e of c.eyes) e.scale.z = 1.05 * blink;
    for (const p of c.pupils) p.visible = blink > 0.45;
    if (c.decor) { for (const h of c.decor.highlights) h.visible = blink > 0.45; wiggle(c.decor, now / 1000, j.energy); }
  };

  let raf = 0, last = 0, disposed = false;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (!host.isConnected || host.offsetParent === null) { last = 0; return; }   // hidden (the game is running): draw nothing, cost nothing
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
    if (current) pose(current, dt, t);
    for (let i = leaving.length - 1; i >= 0; i--) { pose(leaving[i], dt, t); if (t - leaving[i].leaveAt > S.leaveMs) { free(leaving[i]); leaving.splice(i, 1); } }
    renderer.render(scene, camera);
  };

  // drag to spin it, tap to poke it
  let downX = 0, lastX = 0, lastT = 0, moved = false, dragging = false;
  canvas.addEventListener('pointerdown', e => { dragging = true; moved = false; downX = lastX = e.clientX; lastT = performance.now(); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || !current) return;
    if (Math.abs(e.clientX - downX) > 6) moved = true;
    const now = performance.now(), dtm = Math.max(1, now - lastT);
    if (moved) current.jelly.push(((e.clientX - lastX) / dtm) * 1000 * S.dragSpin);
    lastX = e.clientX; lastT = now;
  });
  const up = () => { if (dragging && !moved) api.poke(); dragging = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { dragging = false; });

  const api: Stage = {
    show(id, animate = true) {
      const now = performance.now();
      if (current) retire(current, now);
      current = spawn(id, now, !animate);
      stageGroup.add(current.c.ground);
    },
    tickle() { current?.jelly.tickle(Math.random() < 0.5 ? -1 : 1); },
    poke() { current?.jelly.poke(Math.random() < 0.5 ? -1 : 1, S.poke.tap); },
    cheer() { if (!current) return; current.jelly.poke(1, S.poke.cheer); current.jelly.hop.kick(S.poke.cheerHop); },
    resize: frame,
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect(); dprQuery?.removeEventListener?.('change', frame);
      if (current) free(current); for (const a of leaving) free(a); leaving.length = 0; current = null;
      for (const m of [disc, glow, beam]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
      glowTex.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
  // while it is off screen the animation loop is not even scheduled; coming back on screen restarts it
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    const on = entries.some(e => e.isIntersecting);
    if (!on) { cancelAnimationFrame(raf); raf = 0; last = 0; } else if (!raf && !disposed) raf = requestAnimationFrame(loop);
  }) : null;
  io?.observe(host);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(frame) : null;     // the box can change without a window resize (layout, orientation, breakpoints)
  ro?.observe(host);
  const dprQuery = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
  dprQuery?.addEventListener?.('change', frame);
  frame();
  raf = requestAnimationFrame(loop);
  return api;
}
