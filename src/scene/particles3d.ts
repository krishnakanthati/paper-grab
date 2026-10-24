// Confetti, dust and sparkles as ONE draw call: a fixed pool of point sprites updated in place (no allocation while playing), sized in world
// units so they scale with the camera and shrink with distance. Each has its own colour, alpha and shape (disc, diamond or four-pointed
// star). Expanding rings lie flat on the ground and are drawn by a small immediate-mode batch. The pool is capped (and the cap shrinks on a
// struggling device), and a particle simply stops being drawn when its life is over.
import { BufferAttribute, BufferGeometry, Color, Group, Points, ShaderMaterial } from 'three';
import { EFFECTS } from '../config.ts';
import { GroundBatch } from './groundBatch.ts';

export const SHAPE = { disc: 0, diamond: 1, star: 2 } as const;
const GRAVITY = 9, DRAG = 1.4, GROUND = 0.12;

const VERT = `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aShape;
uniform float uPx; varying vec3 vColor; varying float vAlpha; varying float vShape;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uPx / -mv.z); vColor = aColor; vAlpha = aAlpha; vShape = aShape; }`;
const FRAG = `varying vec3 vColor; varying float vAlpha; varying float vShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float a = 1.0;
  if (vShape < 0.5) { float d = length(p); a = 1.0 - smoothstep(0.82, 1.0, d); }
  else if (vShape < 1.5) { float d = abs(p.x) + abs(p.y); a = 1.0 - smoothstep(0.82, 1.0, d); }
  else { float d = pow(abs(p.x), 0.5) + pow(abs(p.y), 0.5); a = 1.0 - smoothstep(0.9, 1.1, d); a = max(a, (1.0 - smoothstep(0.0, 0.28, length(p))) * 0.9); }
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
#include <colorspace_fragment>
}`;

interface Ring { x: number; z: number; color: number; max: number; life: number; dur: number }

export function createParticles3D(capacity: number = EFFECTS.maxParticles) {
  const group = new Group();
  const N = capacity;
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
  const life = new Float32Array(N), max = new Float32Array(N), size = new Float32Array(N), shape = new Float32Array(N);
  const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
  const position = new Float32Array(N * 3), color = new Float32Array(N * 3), aSize = new Float32Array(N), aAlpha = new Float32Array(N), aShape = new Float32Array(N);
  let count = 0, density = 1;

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(position, 3).setUsage(35048));
  geo.setAttribute('aColor', new BufferAttribute(color, 3).setUsage(35048));
  geo.setAttribute('aSize', new BufferAttribute(aSize, 1).setUsage(35048));
  geo.setAttribute('aAlpha', new BufferAttribute(aAlpha, 1).setUsage(35048));
  geo.setAttribute('aShape', new BufferAttribute(aShape, 1).setUsage(35048));
  geo.setDrawRange(0, 0);
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uPx: { value: 600 } } });
  const points = new Points(geo, mat); points.frustumCulled = false; points.renderOrder = 12;
  const rings = new GroundBatch(0.16, 11);
  const ringList: Ring[] = [];
  group.add(points, rings.mesh);
  const tmp = new Color();

  const spawn = (x: number, y: number, z: number, vxx: number, vyy: number, vzz: number, ms: number, sz: number, hex: number, sh: number) => {
    if (count >= Math.max(0, Math.floor(N * density))) return;
    const i = count++;
    px[i] = x; py[i] = y; pz[i] = z; vx[i] = vxx; vy[i] = vyy; vz[i] = vzz; life[i] = 0; max[i] = ms; size[i] = sz; shape[i] = sh;
    tmp.setHex(hex); cr[i] = tmp.r; cg[i] = tmp.g; cb[i] = tmp.b;
  };

  return {
    group,
    /** Tell the sprites how big a world length is on screen: the drawing buffer's height over twice the tangent of half the vertical field of view. */
    setView(bufferHeightPx: number, fovDeg: number) { mat.uniforms.uPx.value = bufferHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)); },
    /** 0..1: the share of the pool in use (lower on struggling devices). */
    setDensity(d: number) { density = Math.max(0, Math.min(1, d)); },
    /** An expanding, fading ring on the ground (an impact or a capture pulse). */
    ring(x: number, y: number, color: number, maxRadius: number, durMs: number = EFFECTS.ringMs) {
      if (density <= 0.2 && ringList.length > 3) return;                       // struggling device: keep only a few rings
      ringList.push({ x, z: y, color, max: maxRadius, life: 0, dur: durMs });
    },
    get count() { return count; },
    get ringCount() { return ringList.length; },
    /** A burst of `n` pieces: thrown outwards along the ground and up, falling back under gravity. */
    burst(x: number, y: number, color: number, n: number, speed: number, sz: number, sh: number = SHAPE.disc) {
      n = Math.min(Math.round(n * density), Math.max(0, Math.floor(N * density) - count));       // never past the cap
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.9), up = 1.5 + Math.random() * 2.5;
        spawn(x, GROUND, y, Math.cos(a) * v, up, Math.sin(a) * v, 520 + Math.random() * 500, sz * (0.6 + Math.random() * 0.8), color, sh);
      }
    },
    /** Four-pointed sparkles rising off a spot (landing sparkles, a flip's take-off). */
    sparkle(x: number, y: number, color: number, n: number, speed: number, sz: number) { this.burst(x, y, color, n, speed, sz, SHAPE.star); },
    update(dtMs: number) {
      const dt = dtMs / 1000;
      let w = 0;
      const drag = Math.exp(-DRAG * dt);
      for (let i = 0; i < count; i++) {
        life[i] += dtMs;
        if (life[i] >= max[i]) continue;                                    // over: it is not copied forward, which removes it
        vy[i] -= GRAVITY * dt;
        vx[i] *= drag; vz[i] *= drag;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        if (py[i] < GROUND) { py[i] = GROUND; vy[i] *= -0.3; vx[i] *= 0.7; vz[i] *= 0.7; }      // lands and skids
        if (w !== i) {
          px[w] = px[i]; py[w] = py[i]; pz[w] = pz[i]; vx[w] = vx[i]; vy[w] = vy[i]; vz[w] = vz[i];
          life[w] = life[i]; max[w] = max[i]; size[w] = size[i]; shape[w] = shape[i]; cr[w] = cr[i]; cg[w] = cg[i]; cb[w] = cb[i];
        }
        w++;
      }
      count = w;
      for (let i = 0; i < count; i++) {
        const t = life[i] / max[i];
        position[i * 3] = px[i]; position[i * 3 + 1] = py[i]; position[i * 3 + 2] = pz[i];
        color[i * 3] = cr[i]; color[i * 3 + 1] = cg[i]; color[i * 3 + 2] = cb[i];
        aSize[i] = size[i] * (1 - t * 0.6); aAlpha[i] = 1 - t * t; aShape[i] = shape[i];
      }
      geo.setDrawRange(0, count);
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aShape']) (geo.attributes[k] as BufferAttribute).needsUpdate = true;
      rings.begin();
      for (let i = ringList.length - 1; i >= 0; i--) {
        const r = ringList[i];
        r.life += dtMs;
        if (r.life >= r.dur) { ringList.splice(i, 1); continue; }
        const t = r.life / r.dur, e = 1 - Math.pow(1 - t, 3);                  // ease-out: fast at first, settling
        rings.ring(r.x, r.z, r.max * e, 0.34 * (1 - t) + 0.05, r.color, Math.pow(1 - t, 1.5), 40);
      }
      rings.end();
    },
    dispose() { geo.dispose(); mat.dispose(); rings.dispose(); },
  };
}
export type Particles3D = ReturnType<typeof createParticles3D>;
