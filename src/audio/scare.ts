// The jump scare sting. The one deliberately harsh sound in the game, so it lives apart from sfx.ts (whose voices are all soft).
import type { Synth } from './synth.ts';

/** A burst of noise, a dissonant sliding screech and a low boom: loud and sudden. */
export function playScare(synth: Synth) {
  const ctx = synth.ctx();
  if (!ctx) return;
  const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * 0.5), buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; g.gain.value = 0.9; src.connect(g); g.connect(synth.sfx());
  src.onended = () => { src.disconnect(); g.disconnect(); };
  src.start(t);
  for (const [hz, to] of [[880, 700], [932, 760], [1240, 900]] as const) {      // a tritone-ish cluster, sliding down
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(to, t + 0.5);
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.35, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(og); og.connect(synth.sfx()); o.onended = () => { o.disconnect(); og.disconnect(); };
    o.start(t); o.stop(t + 0.6);
  }
  synth.note(synth.sfx(), 55, t, 0.7, 'sine', 0.5, 35);                           // a low boom under it
}
