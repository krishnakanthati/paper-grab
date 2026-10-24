// The ONE WebGL context for the whole game: the renderer, the scene, a perspective camera pitched down at the ground with no yaw or roll, the lights
// and the sea behind everything. Layers add themselves to `scene`; the camera controller's pose is applied here each frame. Also converts between
// the ground and the screen (for name tags, beacon pointers and steering). Created once for the page; arenas come and go inside it.
import {
  AmbientLight, CanvasTexture, Color, DirectionalLight, Group, LinearFilter, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA_3D, type CameraPose } from '../render/cameraController.ts';
import { OCEAN_BOTTOM, OCEAN_TOP } from '../render/palette.ts';
import { wantsMsaa } from '../render/quality.ts';
import { CHARACTER as C } from '../render3d/tuning.ts';

export interface Shell {
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Everything of the current arena goes under this, so swapping arenas is removing one group. */
  root: Group;
  fovDeg: number;
  /** CSS size of the canvas. */
  size(): { w: number; h: number };
  /** Fit the canvas to the window (CSS pixels) and the camera to its shape. */
  resize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  /** Point the camera: its pose from the controller, plus a shake of (dx, dy) screen pixels at `pxPerCell`. */
  applyPose(pose: CameraPose, shake: { dx: number; dy: number }, pxPerCell: number): void;
  /** Where a ground point (cell x, height y, cell z) is on screen, in CSS pixels, and whether it is in front of the camera and on screen. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  /** The ground point (cell x, cell y) under a screen position in CSS pixels, or null when the ray misses the ground. */
  groundAt(sx: number, sy: number): { x: number; y: number } | null;
  /** The ground rectangle (cells) the screen currently covers: the box round its four corners' ground points. */
  bounds(): { x: number; y: number; w: number; h: number };
  render(): void;
  dispose(): void;
}

/**
 * The camera's view of the ground, as plain functions (no renderer needed, so they are testable in Node): pointing the camera from a controller
 * pose, going from a ground point to a screen pixel and back, and the ground rectangle the screen covers.
 */
export function createCameraView(camera: PerspectiveCamera, size: () => { w: number; h: number }) {
  const ray = new Raycaster(), v3 = new Vector3(), v2 = new Vector2();
  const groundAt = (sx: number, sy: number) => {
    const { w, h } = size();
    camera.updateMatrixWorld();
    v2.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y > -1e-6) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  };
  return {
    applyPose(pose: CameraPose, shake: { dx: number; dy: number }, pxPerCell: number) {
      const sx = shake.dx / Math.max(1, pxPerCell), sz = shake.dy / Math.max(1, pxPerCell) / Math.max(0.3, Math.sin((pose.pitchDeg * Math.PI) / 180));
      camera.position.set(pose.position.x - sx, pose.position.y, pose.position.z - sz);
      camera.up.set(0, 1, 0);
      camera.lookAt(pose.lookAt.x - sx, pose.lookAt.y, pose.lookAt.z - sz);
      camera.updateMatrixWorld();
    },
    project(x: number, y: number, z: number) {
      const { w, h } = size();
      camera.updateMatrixWorld();
      v3.set(x, y, z).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * w, y: (1 - (v3.y * 0.5 + 0.5)) * h, visible: v3.z > -1 && v3.z < 1 };
    },
    groundAt,
    bounds() {
      const { w, h } = size();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [sx, sy] of [[0, 0], [w, 0], [w, h], [0, h]]) {
        const g = groundAt(sx, sy);
        if (!g) continue;
        x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x); y0 = Math.min(y0, g.y); y1 = Math.max(y1, g.y);
      }
      return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 1, h: 1 };
    },
  };
}
export type CameraView = ReturnType<typeof createCameraView>;

function waterBackground(): CanvasTexture | Color {
  if (typeof document === 'undefined') return new Color(OCEAN_TOP);
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 256;
  const c = cv.getContext('2d')!, g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, OCEAN_TOP); g.addColorStop(1, OCEAN_BOTTOM);
  c.fillStyle = g; c.fillRect(0, 0, 8, 256);
  const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; tex.minFilter = tex.magFilter = LinearFilter; tex.generateMipmaps = false;
  return tex;
}

export function createShell(parent: HTMLElement, w: number, h: number, pixelRatio: number): Shell {
  const renderer = new WebGLRenderer({ antialias: wantsMsaa(pixelRatio), stencil: true, powerPreference: 'high-performance' });     // throws without WebGL: the caller says so on screen
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  parent.prepend(canvas);

  const scene = new Scene();
  scene.background = waterBackground();
  scene.add(new AmbientLight(0xffffff, C.lights.ambient));
  const key = new DirectionalLight(0xffffff, C.lights.key); key.position.set(-0.6, 1.2, 0.7); scene.add(key);     // from the upper left, in front
  const fill = new DirectionalLight(0xbfe3ff, C.lights.fill); fill.position.set(0.8, 0.6, 0.5); scene.add(fill);
  const root = new Group(); scene.add(root);

  const fovDeg = CAMERA_3D.fovDeg;
  const camera = new PerspectiveCamera(fovDeg, w / Math.max(1, h), 1, 1500);
  let W = w, H = h;
  const view = createCameraView(camera, () => ({ w: W, h: H }));

  return {
    canvas, renderer, scene, camera, root, fovDeg,
    size: () => ({ w: W, h: H }),
    resize(nw, nh) {
      W = Math.max(1, nw); H = Math.max(1, nh);
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
    },
    setPixelRatio(r) { renderer.setPixelRatio(r); renderer.setSize(W, H, false); },
    applyPose: view.applyPose, project: view.project, groundAt: view.groundAt, bounds: view.bounds,
    render() { renderer.render(scene, camera); },
    dispose() { renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); },
  };
}
