// The WebGL side of the globe: a transparent canvas, the orbit camera, the land textures and pointer handling (hover on
// desktop, click or tap to choose). It renders only while something moves, so a still picker costs no battery.
//
// Smoothness decisions:
//  - the land is painted ONCE (quickly at low resolution so the globe appears at once, then at full resolution when idle);
//    hovering/choosing a country never repaints it: each of those is a small transparent shell sphere with its own texture;
//  - hover is resolved at most once per frame, with an exact ray-sphere test, so fast mouse moves cost nothing extra;
//  - choosing a country turns the globe with a time-based ease-in-out (never a sudden start) and zooms in a little;
//  - zoom and rotation are damped by OrbitControls, and a new drag or wheel cancels any turn in progress.
import { CanvasTexture, LinearMipmapLinearFilter, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Country } from '../../data/countries.ts';
import { pickTextureBudget } from './budget.ts';
import { createMapScene, GLOBE, lonLatToVector, type MapScene, type OverlayKind } from './mapScene.ts';

const TAP_SLOP_PX = 7;
const SLICE_MS = 6;             // painting the full-size land texture works for at most this long, then yields to the browser (no long freeze)
const SLICE_COUNTRIES = 12;     // ...a few countries per step           // a press that moves less than this is a tap, not the start of a drag
const SPIN_SPEED = 0.9;          // OrbitControls units: roughly a minute per turn
const FOCUS_ZOOM = 0.84;         // choosing a country moves the camera to this share of the whole-globe distance
const TURN = { baseMs: 380, perRadianMs: 380, minMs: 450, maxMs: 1000 };
const SUN_OFFSET = new Vector3(-0.6, 0.8, 0.5).multiplyScalar(GLOBE.radius * 2);   // the light rides with the camera, so the front is always lit

export interface MapView {
  setSelected(id: string | null): void;
  setConquered(ids: Iterable<string>): void;
  resize(): void;
  /** Start the globe turning again (used by pull-to-refresh). */
  spin(): void;
  dispose(): void;
}

const makeCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Returns null when WebGL is unavailable (the list still works). */
export function createMapView(host: HTMLElement, countries: Country[], onPick: (id: string) => void, onHover: (id: string | null) => void): MapView | null {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
  host.appendChild(canvas);

  const w0 = Math.max(1, host.clientWidth), h0 = Math.max(1, host.clientHeight);
  const map: MapScene = createMapScene(countries, w0 / h0);
  map.look(GLOBE.start.lon, GLOBE.start.lat);

  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const budget = pickTextureBudget({ coarse, deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, maxTexture: renderer.capabilities.maxTextureSize });
  /** `keep` false: once the GPU has its copy, the canvas shrinks to a pixel, so the big image is not held in main memory too. */
  const mkTex = (c: HTMLCanvasElement, srgb: boolean, keep = false) => {
    const t = new CanvasTexture(c);
    if (!keep) t.onUpdate = () => { t.onUpdate = null; c.width = 1; c.height = 1; };
    t.wrapS = RepeatWrapping; t.offset.x = 0.25;                     // SphereGeometry's u=0 sits at lon -90, not -180
    t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso;   // mipmaps keep it clean zoomed out, size keeps it sharp zoomed in
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };

  let raf = 0, last = 0, disposed = false, onScreen = true;     // onScreen: false while the start panel is hidden (the game is running), so the globe costs nothing then
  const request = () => { if (!raf && !disposed && onScreen) raf = requestAnimationFrame(frame); };

  // --- land textures: a quick low-res paint now, the full-resolution one when the browser is idle ---
  const mat = map.globe.material as unknown as { map: CanvasTexture | null; bumpMap: CanvasTexture | null; needsUpdate: boolean };
  let landWidths = { colourW: budget.quick, bumpW: budget.bump };       // what is on screen now, so a lost GPU context can be repainted
  const paintLand = (colourW: number, bumpW: number) => {
    landWidths = { colourW, bumpW };
    const col = makeCanvas(colourW, colourW / 2), bmp = makeCanvas(bumpW, bumpW / 2);
    map.paint(col.getContext('2d')!, col.width, col.height, 'colour');
    map.paint(bmp.getContext('2d')!, bmp.width, bmp.height, 'bump');
    return { colour: mkTex(col, true), bump: mkTex(bmp, false) };
  };
  /** The full-size land texture, painted a few countries at a time so the page never freezes while it is made. */
  const paintLandSliced = (colourW: number, bumpW: number) => new Promise<{ colour: CanvasTexture; bump: CanvasTexture } | null>(resolve => {
    const col = makeCanvas(colourW, colourW / 2), bmp = makeCanvas(bumpW, bumpW / 2);
    const cctx = col.getContext('2d')!, bctx = bmp.getContext('2d')!, total = map.countryTotal();
    map.paintBase(cctx, col.width, col.height, 'colour'); map.paintBase(bctx, bmp.width, bmp.height, 'bump');
    let i = 0;
    const later: (cb: () => void) => void = typeof requestIdleCallback === 'function' ? cb => { requestIdleCallback(cb, { timeout: 200 }); } : cb => { window.setTimeout(cb, 16); };
    const step = () => {
      if (disposed) { resolve(null); return; }
      const t0 = performance.now();
      while (i < total && performance.now() - t0 < SLICE_MS) {
        map.paintCountries(cctx, col.width, col.height, 'colour', i, i + SLICE_COUNTRIES);
        map.paintCountries(bctx, bmp.width, bmp.height, 'bump', i, i + SLICE_COUNTRIES);
        i += SLICE_COUNTRIES;
      }
      if (i < total) later(step);
      else { landWidths = { colourW, bumpW }; resolve({ colour: mkTex(col, true), bump: mkTex(bmp, false) }); }
    };
    step();
  });
  const apply = (t: { colour: CanvasTexture; bump: CanvasTexture }) => {
    const old = [mat.map, mat.bumpMap];
    mat.map = t.colour; mat.bumpMap = t.bump; mat.needsUpdate = true;
    for (const o of old) o?.dispose();
    request();
  };
  const fullW = budget.colour, quickW = budget.quick;
  apply(paintLand(quickW, Math.min(budget.bump, quickW)));
  let upgradeTimer = 0;
  if (fullW > quickW) {
    const idle: (cb: () => void) => number = typeof requestIdleCallback === 'function' ? cb => requestIdleCallback(cb, { timeout: 600 }) : cb => window.setTimeout(cb, 120);
    upgradeTimer = idle(() => { if (!disposed) void paintLandSliced(fullW, budget.bump).then(t => { if (t && !disposed) apply(t); }); });
  }

  // --- highlight shells: small transparent textures, repainted alone when hover or the chosen country changes ---
  const ow = budget.overlay;
  const shells = (['hover', 'selected', 'conquered'] as const).map(which => {
    const cv = makeCanvas(ow, ow / 2), tex = mkTex(cv, true, true);          // these stay: they are repainted whenever hover/selection changes
    (map.overlays[which].material as unknown as { map: CanvasTexture }).map = tex;
    return { which, cv, tex };
  });
  const repaintShell = (which: OverlayKind) => {
    const s = shells.find(x => x.which === which)!;
    map.paintOverlay(s.cv.getContext('2d')!, s.cv.width, s.cv.height, which);
    s.tex.needsUpdate = true;
  };
  let conqueredIds: string[] = [];
  map.onChange = which => { repaintShell(which); request(); };

  const controls = new OrbitControls(map.camera, canvas);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.7;
  controls.minDistance = GLOBE.radius * GLOBE.minDistance;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI - 0.25;
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = SPIN_SPEED;
  let home = map.camera.position.length();                           // camera distance that frames the whole globe
  controls.maxDistance = home * 1.25;
  controls.update();
  const stopSpin = () => { controls.autoRotate = false; };

  // --- turning to a chosen country: ease-in-out along the great circle, zooming in a little ---
  interface Turn { from: Vector3; q: Quaternion; d0: number; d1: number; t0: number; ms: number }
  let turn: Turn | null = null;
  const startTurn = (dir: Vector3, dist: number) => {
    const from = map.camera.position.clone().normalize(), to = dir.clone().normalize();
    const angle = from.angleTo(to);
    turn = { from, q: new Quaternion().setFromUnitVectors(from, to), d0: map.camera.position.length(), d1: Math.max(controls.minDistance, dist), t0: performance.now(),
      ms: Math.min(TURN.maxMs, Math.max(TURN.minMs, TURN.baseMs + angle * TURN.perRadianMs)) };
  };
  const stepTurn = (now: number) => {
    if (!turn) return false;
    const t = Math.min(1, (now - turn.t0) / turn.ms), e = easeInOut(t);
    const dir = turn.from.clone().applyQuaternion(new Quaternion().slerp(turn.q, e));
    map.camera.position.copy(dir).multiplyScalar(turn.d0 + (turn.d1 - turn.d0) * e);
    if (t >= 1) turn = null;
    return true;
  };

  function frame(t: number) {
    raf = 0;
    last = t;
    const turning = stepTurn(performance.now());
    const live = controls.update();
    map.sun.position.copy(map.camera.position).add(SUN_OFFSET);
    renderer.render(map.scene, map.camera);
    if (turning || live) request();
  }
  controls.addEventListener('change', request);
  controls.addEventListener('start', () => { stopSpin(); turn = null; });

  // --- pointer: hover is resolved once per frame; a short press is a tap, a drag is a rotation ---
  const ndc = (x: number, y: number): [number, number] => { const r = canvas.getBoundingClientRect(); return [((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)]; };
  const px = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  let downX = 0, downY = 0, downT = 0, hover: string | null = null, hoverRaf = 0, hx = 0, hy = 0;
  // the cursor tells you what a drag will do: an open hand over the globe (drag to turn it), a pointing hand over a country (click to
  // choose it), and a closed hand while you are actually turning it
  let dragging = false;
  const setCursor = (c: 'grab' | 'grabbing' | 'pointer') => { if (canvas.style.cursor !== c) canvas.style.cursor = c; };
  canvas.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); dragging = false; });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons && !dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP_PX) { dragging = true; setCursor('grabbing'); }
  });
  const endDrag = () => { if (dragging) { dragging = false; setCursor(hover ? 'pointer' : 'grab'); } };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP_PX || performance.now() - downT > 700) return;   // it was a drag
    const [x, y] = ndc(e.clientX, e.clientY), id = map.pick(x, y, px());
    if (id) onPick(id);
  });
  const resolveHover = () => {
    hoverRaf = 0;
    const [x, y] = ndc(hx, hy), id = map.pick(x, y, px());
    if (id !== hover) { hover = id; map.setHover(id); onHover(id); }
    if (!dragging) setCursor(hover ? 'pointer' : 'grab');
  };
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;                       // hover only makes sense for a mouse that is not dragging
    hx = e.clientX; hy = e.clientY;
    if (!hoverRaf) hoverRaf = requestAnimationFrame(resolveHover);
  });
  canvas.addEventListener('pointerleave', () => { cancelAnimationFrame(hoverRaf); hoverRaf = 0; if (hover) { hover = null; map.setHover(null); onHover(null); } });

  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    const wasHome = Math.abs(map.camera.position.length() - home) < 1e-3;
    map.fit(w / h);
    home = map.camera.position.length();
    controls.maxDistance = home * 1.25;
    if (!wasHome) map.camera.position.setLength(Math.min(Math.max(map.camera.position.length(), controls.minDistance), controls.maxDistance));
    request();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); if (onScreen) { last = 0; request(); } }) : null;
  io?.observe(host);
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { for (const s of shells) s.tex.needsUpdate = true; apply(paintLand(landWidths.colourW, landWidths.bumpW)); });     // the land canvases were released after upload: paint them again
  resize();

  return {
    setConquered(ids) { conqueredIds = [...ids]; map.setConquered(conqueredIds); request(); },
    setSelected(id) {
      map.setSelected(id);
      const dir = id ? map.directionOf(id) : lonLatToVector(GLOBE.start.lon, GLOBE.start.lat, 1);
      if (id) stopSpin();
      if (dir) startTurn(dir, home * (id ? FOCUS_ZOOM : 1));
      request();
    },
    resize,
    spin() { if (!reduceMotion) controls.autoRotate = true; startTurn(lonLatToVector(GLOBE.start.lon, GLOBE.start.lat, 1), home); request(); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); cancelAnimationFrame(hoverRaf); if (typeof cancelIdleCallback === 'function') cancelIdleCallback(upgradeTimer); else clearTimeout(upgradeTimer);
      ro?.disconnect(); io?.disconnect(); window.removeEventListener('resize', resize);
      controls.dispose(); map.dispose(); mat.map?.dispose(); mat.bumpMap?.dispose(); for (const s of shells) { s.tex.dispose(); s.cv.width = 1; s.cv.height = 1; } renderer.dispose(); renderer.forceContextLoss(); canvas.remove();      // forceContextLoss hands the GPU context back at once
    },
  };
}
