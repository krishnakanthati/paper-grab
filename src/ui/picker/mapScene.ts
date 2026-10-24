// The 3D globe used to choose a country. Land is painted onto a texture (colour + a relief map so the countries read as
// raised) and wrapped round a sphere; picking turns a ray hit into lon/lat and tests it against the country outlines,
// which stays exact however the globe is turned. This file is pure Three.js scene logic with no renderer or canvas in it,
// so it can be tested without a GPU: mapView.ts owns the WebGL canvas, the textures and the camera controls.
import { AmbientLight, DirectionalLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Ray, Scene, Sphere, SphereGeometry, Vector2, Vector3 } from 'three';
import type { Country } from '../../data/countries.ts';

export const GLOBE = {
  radius: 100,
  fov: 32,
  margin: 0.99,                                            // the globe fills this share of the limiting half-angle of the view
  start: { lon: 10, lat: 22 },                             // where the globe faces when it opens
  pickRadiusPx: 16,                                        // clicking this close to a tiny country still picks it
  // land texture width in px (height is half): big enough to stay crisp at the closest zoom, capped to what the GPU allows
  tex: { desktop: 6144, mobile: 4096, low: 2048, lowMemoryGB: 4, bump: 2048, quick: 2048, overlayDesktop: 3072, overlayMobile: 2048 },   // low = devices reporting this much memory or less   // quick = the first, fast paint before the full one
  minDistance: 1.5,                                        // closest zoom, in globe radii from the centre
  bumpScale: 2.2,
  colors: { ocean: '#2f9bf0', land: '#f4f7fb', border: '#c9d5e6', hover: '#ffe7a1', selected: '#ffc933', conquered: '#4fcf8a' },
  relief: { ocean: 0, land: 120 },                         // grey levels of the relief map
  lift: { hover: 1.003, conquered: 1.006, selected: 1.009 },                 // radius factor of each highlight shell: the chosen country really stands off the surface
} as const;

const D2R = Math.PI / 180;

/**
 * The globe is a little comical, not a true sphere: a plump, slightly squashed ball with a few soft lumps. This is how far the surface sits from
 * the centre in a given direction (1 = the plain radius). Everything that has to sit ON the surface (the highlight shells, picking, projecting a
 * country's label point) uses the same function, so they all agree with the drawn shape. Pure maths, so it can be tested.
 */
export const GLOBE_SHAPE = { squash: 0.13, lumps: 0.05 } as const;
export function globeShape(x: number, y: number, z: number): number {
  const l = Math.hypot(x, y, z) || 1, nx = x / l, ny = y / l, nz = z / l;
  const bumps = Math.sin(2.3 * nx + 1.1) * Math.sin(2.1 * ny + 0.4) * Math.sin(2.6 * nz - 0.3);       // three slow waves multiplied: a few big, rounded lumps
  return 1 - GLOBE_SHAPE.squash * ny * ny + GLOBE_SHAPE.lumps * bumps;
}
const SHAPE_MAX = (() => { let m = 0; for (let a = 0; a < 48; a++) for (let b = 0; b <= 24; b++) { const lo = (a / 48) * Math.PI * 2, la = (b / 24 - 0.5) * Math.PI; m = Math.max(m, globeShape(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo))); } return m; })();

/** Push every vertex of a sphere out or in along its own direction to the comical shape. Keeps the sphere's normals (smooth, no seam). */
function deform(geo: SphereGeometry) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = globeShape(x, y, z); p.setXYZ(i, x * f, y * f, z * f); }
  p.needsUpdate = true; geo.computeBoundingSphere();
  return geo;
}
/** Point on a sphere of radius r for a lon/lat in degrees: lon 0 / lat 0 faces +z, north is +y. */
export function lonLatToVector(lon: number, lat: number, r: number = GLOBE.radius, out = new Vector3()): Vector3 {
  const cl = Math.cos(lat * D2R);
  return out.set(r * cl * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * cl * Math.cos(lon * D2R));
}
export function vectorToLonLat(v: Vector3): [number, number] {
  const n = v.clone().normalize();
  return [Math.atan2(n.x, n.z) / D2R, Math.asin(Math.max(-1, Math.min(1, n.y))) / D2R];
}

interface Ring { pts: Array<[number, number]>; minLon: number; maxLon: number; minLat: number; maxLat: number }
const toRing = (pts: Array<[number, number]>): Ring => {
  let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
  for (const [x, y] of pts) { if (x < minLon) minLon = x; if (x > maxLon) maxLon = x; if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; }
  return { pts, minLon, maxLon, minLat, maxLat };
};
const inRing = (r: Ring, lon: number, lat: number) => {
  if (lon < r.minLon || lon > r.maxLon || lat < r.minLat || lat > r.maxLat) return false;
  let inside = false;
  const p = r.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export type OverlayKind = 'hover' | 'selected' | 'conquered';

export interface MapScene {
  scene: Scene;
  camera: PerspectiveCamera;
  globe: Mesh;
  sun: DirectionalLight;
  /** Highlight shells: one sphere each for the hovered and the chosen country, painted onto small transparent textures. */
  overlays: { hover: Mesh; selected: Mesh; conquered: Mesh };
  /** Set by the view: called when the hovered or chosen country changed and that shell's texture needs repainting. */
  onChange: ((which: OverlayKind) => void) | null;
  /** Countries won so far: they are tinted green. */
  setConquered(ids: Iterable<string>): void;
  setSelected(id: string | null): void;
  setHover(id: string | null): void;
  /** Country under a pointer position given in normalised device coordinates (-1..1), or the nearest tiny one within reach. */
  pick(ndcX: number, ndcY: number, viewportPx?: { w: number; h: number }): string | null;
  /** The country containing a lon/lat, if any. */
  countryAt(lon: number, lat: number): string | null;
  /** Unit direction (from the globe's centre) of a country's label point, for turning the globe towards it. */
  directionOf(id: string): Vector3 | null;
  /** Turn the camera to face a lon/lat (keeps its distance). */
  look(lon: number, lat: number): void;
  fit(aspect: number): void;                               // distance at which the whole globe fits this aspect ratio
  project(lon: number, lat: number): Vector2;              // lon/lat -> normalised device coordinates
  /** Paint the flat colour or relief texture of the whole land (done once). */
  paint(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'colour' | 'bump'): void;
  /** The same painting in pieces, so a big texture can be drawn a few countries at a time without one long freeze. */
  paintBase(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'colour' | 'bump'): void;
  paintCountries(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'colour' | 'bump', from: number, to: number): void;
  countryTotal(): number;
  /** Paint one highlight shell: only the hovered or chosen country, on transparent. */
  paintOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, which: OverlayKind): void;
  dispose(): void;
}

export function createMapScene(countries: Country[], aspect = 2): MapScene {
  const scene = new Scene();
  const R = GLOBE.radius;
  const globe = new Mesh(deform(new SphereGeometry(R, 128, 64)), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.02, bumpScale: GLOBE.bumpScale }));
  scene.add(globe);
  scene.add(new AmbientLight(0xffffff, 1.0));
  const sun = new DirectionalLight(0xffffff, 1.6); scene.add(sun);

  const rings = new Map<string, Ring[]>(), centres = new Map<string, [number, number]>();
  for (const c of countries) {
    const rs = c.outline.filter(r => r.length >= 3).map(toRing);
    if (!rs.length) continue;
    rings.set(c.id, rs); centres.set(c.id, c.centre);
  }

  const camera = new PerspectiveCamera(GLOBE.fov, aspect, 1, R * 12);
  const ray = new Ray(), sphere = new Sphere(new Vector3(), R);
  const surface = new Vector3();
  const shell = (k: number) => { const m = new Mesh(deform(new SphereGeometry(R * k, 128, 64)), new MeshBasicMaterial({ transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 2; return m; };
  const overlays = { hover: shell(GLOBE.lift.hover), selected: shell(GLOBE.lift.selected), conquered: shell(GLOBE.lift.conquered) };
  scene.add(overlays.conquered, overlays.hover, overlays.selected);
  let conquered: string[] = [];
  let selected: string | null = null, hover: string | null = null, dist = R * 3;

  const countryAt = (lon: number, lat: number) => {
    for (const [id, rs] of rings) for (const r of rs) if (inRing(r, lon, lat)) return id;
    return null;
  };
  const place = (dir: Vector3) => { camera.position.copy(dir).normalize().multiplyScalar(dist); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); };

  const fillCountry = (ctx: CanvasRenderingContext2D, id: string, w: number, h: number) => {
    ctx.beginPath();
    for (const r of rings.get(id)!) {
      // the outlines are simplified polygons: curving through their edge midpoints keeps coasts smooth however far you zoom in
      const n = r.pts.length, at = (i: number): [number, number] => { const [lon, lat] = r.pts[(i + n) % n]; return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h]; };
      const mid = (i: number): [number, number] => { const a = at(i), b = at(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      const [sx, sy] = mid(n - 1);
      ctx.moveTo(sx, sy);
      for (let i = 0; i < n; i++) { const [cx, cy] = at(i), [mx, my] = mid(i); ctx.quadraticCurveTo(cx, cy, mx, my); }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  };

  const api: MapScene = {
    scene, camera, globe, sun, overlays, onChange: null,
    setConquered(ids) {
      conquered = [...ids].filter(id => rings.has(id));
      overlays.conquered.visible = conquered.length > 0; api.onChange?.('conquered');
    },
    setSelected(id) {
      const n = id && rings.has(id) ? id : null;
      if (n === selected) return;
      selected = n; overlays.selected.visible = !!n; api.onChange?.('selected');
      if (hover) { overlays.hover.visible = hover !== selected; }
    },
    setHover(id) {
      const n = id && rings.has(id) ? id : null;
      if (n === hover) return;
      hover = n; overlays.hover.visible = !!n && n !== selected; api.onChange?.('hover');
    },
    countryAt,
    directionOf(id) { const c = centres.get(id); return c ? lonLatToVector(c[0], c[1], 1) : null; },
    look(lon, lat) { place(lonLatToVector(lon, lat, 1)); },
    project(lon, lat) { const o = lonLatToVector(lon, lat); const v = o.multiplyScalar(globeShape(o.x, o.y, o.z)).project(camera); return new Vector2(v.x, v.y); },
    pick(ndcX, ndcY, viewportPx) {
      camera.updateMatrixWorld(true);
      const dir = new Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();   // exact ray-sphere: no triangle raycast per pointer move
      ray.set(camera.position, dir);
      let hit: Vector3 | null = null, r: number = R * SHAPE_MAX;                  // the surface is lumpy: close in on it by re-aiming at the sphere that fits where the ray last landed
      for (let i = 0; i < 5; i++) {
        sphere.radius = r; hit = ray.intersectSphere(sphere, surface.clone());
        if (!hit) break;
        r = R * globeShape(hit.x, hit.y, hit.z);
      }
      if (hit) { const [lon, lat] = vectorToLonLat(hit); const id = countryAt(lon, lat); if (id) return id; }
      if (!viewportPx) return null;                                    // open sea or a sliver: take the nearest country centre if it is close
      const toCam = camera.position.clone().normalize();
      let best: string | null = null, bestD: number = GLOBE.pickRadiusPx;
      for (const [id, [lon, lat]] of centres) {
        if (lonLatToVector(lon, lat, 1).dot(toCam) < 0.05) continue;   // on the far side of the globe
        const p = api.project(lon, lat);
        const d = Math.hypot((p.x - ndcX) * viewportPx.w / 2, (p.y - ndcY) * viewportPx.h / 2);
        if (d < bestD) { bestD = d; best = id; }
      }
      return best;
    },
    fit(a) {
      camera.aspect = a;
      const vf = (GLOBE.fov * D2R) / 2, hf = Math.atan(Math.tan(vf) * a);
      dist = (R * SHAPE_MAX) / Math.sin(Math.min(vf, hf) * GLOBE.margin);
      if (camera.position.lengthSq() === 0) place(lonLatToVector(GLOBE.start.lon, GLOBE.start.lat, 1)); else place(camera.position);
    },
    paintBase(ctx, w, h, kind) {
      const c = GLOBE.colors, lv = GLOBE.relief;
      ctx.fillStyle = kind === 'bump' ? `rgb(${lv.ocean},${lv.ocean},${lv.ocean})` : c.ocean; ctx.fillRect(0, 0, w, h);
    },
    paintCountries(ctx, w, h, kind, from, to) {
      const c = GLOBE.colors, lv = GLOBE.relief, bump = kind === 'bump';
      ctx.fillStyle = bump ? `rgb(${lv.land},${lv.land},${lv.land})` : c.land;
      ctx.strokeStyle = c.border; ctx.lineWidth = Math.max(1, w / 1400); ctx.lineJoin = 'round';
      const ids = [...rings.keys()];
      for (let i = from; i < Math.min(to, ids.length); i++) { fillCountry(ctx, ids[i], w, h); if (!bump) ctx.stroke(); }
    },
    countryTotal: () => rings.size,
    paint(ctx, w, h, kind) { api.paintBase(ctx, w, h, kind); api.paintCountries(ctx, w, h, kind, 0, rings.size); },
    paintOverlay(ctx, w, h, which) {
      ctx.clearRect(0, 0, w, h);
      const ids = which === 'conquered' ? conquered : [which === 'hover' ? hover : selected];
      if (!ids.some(Boolean)) return;
      ctx.fillStyle = GLOBE.colors[which]; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, w / 900); ctx.lineJoin = 'round';
      for (const id of ids) if (id) { fillCountry(ctx, id, w, h); ctx.stroke(); }
    },
    dispose() { globe.geometry.dispose(); (globe.material as MeshStandardMaterial).dispose(); for (const o of [overlays.hover, overlays.selected, overlays.conquered]) { o.geometry.dispose(); (o.material as MeshBasicMaterial).dispose(); } },
  };
  api.fit(aspect);
  return api;
}
