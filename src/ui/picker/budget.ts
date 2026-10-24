// How big the globe's textures may be on this device. Texture memory is the biggest cost of the picker (the land image alone
// is width x width/2 x 4 bytes on the CPU and again, plus mipmaps, on the GPU), so a phone or a low-memory machine gets
// smaller ones instead of risking the page being killed. The numbers live in GLOBE.tex (mapScene.ts).
import { GLOBE } from './mapScene.ts';

export interface DeviceInfo { coarse: boolean; deviceMemoryGB?: number; maxTexture: number }
export interface TextureBudget { colour: number; quick: number; bump: number; overlay: number }

type TexConfig = typeof GLOBE.tex;

export function pickTextureBudget(d: DeviceInfo, t: TexConfig = GLOBE.tex): TextureBudget {
  const low = d.deviceMemoryGB !== undefined && d.deviceMemoryGB <= t.lowMemoryGB;
  const cap = (n: number) => Math.max(256, Math.min(n, d.maxTexture));
  const colour = cap(low ? t.low : d.coarse ? t.mobile : t.desktop);
  return {
    colour,
    quick: Math.min(cap(t.quick), colour),
    bump: Math.min(cap(t.bump), colour),
    overlay: Math.min(cap(low || d.coarse ? t.overlayMobile : t.overlayDesktop), colour),
  };
}

/** Rough bytes the picker's textures take on the CPU side and (with mipmaps) on the GPU side, for a budget. */
export function textureBytes(b: TextureBudget) {
  const px = (w: number) => w * (w / 2) * 4;
  const cpu = px(b.colour) + px(b.bump) + 2 * px(b.overlay);
  return { cpu, gpu: Math.round((px(b.colour) + px(b.bump) + 2 * px(b.overlay)) * 1.34) };
}
