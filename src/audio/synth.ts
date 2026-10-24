import { AUDIO } from './tuning.ts';

// Thin WebAudio toolkit: owns the context and buses, and builds enveloped notes. Browsers only allow audio
// after a user gesture, so nothing is created until ensure() is called from a click/key/touch.
export interface Synth {
  ensure(): boolean;                      // create the context on first call; false when WebAudio is unavailable
  ctx(): AudioContext | null;
  sfx(): GainNode;
  panned(pan: number, vol: number): AudioNode;   // one-shot bus: stereo position (-1 left .. 1 right) and loudness
  setLevels(audible: boolean): void;
  setPaused(p: boolean): void;
  note(dest: AudioNode, hz: number, t: number, dur: number, type: OscillatorType, vol: number, glideTo?: number, attack?: number): void;
}

/** Fold a pitch down by octaves until it is no higher than `maxHz`, so nothing is ever shrill. */
export function foldHz(hz: number, maxHz = AUDIO.maxHz): number {
  let f = hz;
  while (f > maxHz) f /= 2;
  return f;
}
/** Harsh waveforms are played as triangles (same pitch, none of the buzz). */
export const softWave = (type: OscillatorType): OscillatorType => (AUDIO.smoothWaves && (type === 'square' || type === 'sawtooth') ? 'triangle' : type);

/** How a requested note is actually played: folded below the pitch ceiling (a glide keeps its shape), smooth waveform. */
export function shapeNote(hz: number, glideTo: number | undefined, type: OscillatorType) {
  const f = foldHz(hz), factor = f / hz;
  return { hz: f, glideTo: glideTo === undefined ? undefined : glideTo * factor, type: softWave(type) };
}

/** How long a per-cue bus stays connected: longer than any cue (the longest is about 2 s). */
export const BUS_LIFETIME_MS = 6000;

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let master!: GainNode, sfx!: GainNode;

  return {
    ensure() {
      if (!ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain(); sfx = ctx.createGain();
        sfx.gain.value = AUDIO.sfxGain;
        // a compressor on the way out lets the levels be generous without clipping when effects stack
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        // tone shaping: roll off the top so nothing is shrill, then a gentle high-shelf cut
        const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = AUDIO.lowpassHz; tone.Q.value = AUDIO.lowpassQ;
        const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = AUDIO.shelfHz; shelf.gain.value = AUDIO.shelfDb;
        sfx.connect(tone); tone.connect(shelf); shelf.connect(master); master.connect(comp); comp.connect(ctx.destination);
        // a small generated "room" for the effects: a short decaying tail through a convolver
        const len = Math.floor(ctx.sampleRate * 1.0), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const d = ir.getChannelData(c);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
        const conv = ctx.createConvolver(), wet = ctx.createGain(), sendSfx = ctx.createGain();
        conv.buffer = ir; wet.gain.value = AUDIO.roomWet; sendSfx.gain.value = 0.22;
        sfx.connect(sendSfx); sendSfx.connect(conv);
        const soften = ctx.createBiquadFilter();             // roll off the highs of the tail so the room is warm, not hissy
        soften.type = 'lowpass'; soften.frequency.value = 3200; soften.Q.value = 0.5;
        conv.connect(soften); soften.connect(wet); wet.connect(master);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    },
    ctx: () => ctx,
    sfx: () => sfx,
    panned(pan, vol) {
      const g = ctx!.createGain(), p = ctx!.createStereoPanner();
      g.gain.value = vol; p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(sfx);
      setTimeout(() => { g.disconnect(); p.disconnect(); }, BUS_LIFETIME_MS);      // a cue's own little graph is torn down once it has surely finished, so a long session never piles them up
      return g;
    },
    setLevels(audible) {
      if (!ctx) return;
      master.gain.setTargetAtTime(audible ? 1 : 0, ctx.currentTime, 0.04);
    },
    setPaused(p) { if (ctx) void (p ? ctx.suspend() : ctx.resume()); },

    // one enveloped note: fast attack, exponential decay (a plucked / bell-like voice)
    note(dest, hz, t, dur, type, vol, glideTo, attack = AUDIO.minAttackSec) {
      const o = ctx!.createOscillator(), g = ctx!.createGain(), n = shapeNote(hz, glideTo, type);
      attack = Math.max(attack, AUDIO.minAttackSec);
      o.type = n.type;
      o.frequency.setValueAtTime(n.hz, t);
      if (n.glideTo) o.frequency.exponentialRampToValueAtTime(n.glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest);
      o.onended = () => { o.disconnect(); g.disconnect(); };
      o.start(t); o.stop(t + dur + 0.05);
    }
  };
}
