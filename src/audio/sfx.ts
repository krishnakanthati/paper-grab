// Short sound effects. All are original, synthesized from oscillators.
import { PENTA, midiToHz } from './notes.ts';
import { AUDIO } from './tuning.ts';
import type { Synth } from './synth.ts';

/** Every musical cue is written for a brighter register and played this far down (see audio/tuning.ts). */
const pitch = (m: number) => midiToHz(m + AUDIO.transposeSemitones);

export function createSfx(synth: Synth) {
  const now = () => synth.ctx()!.currentTime;
  const ready = () => synth.ctx() !== null;
  return {
    start() {
      if (!ready()) return;
      const t = now();
      [72, 76, 79, 84].forEach((m, i) => synth.note(synth.sfx(), pitch(m), t + i * 0.07, 0.35, 'triangle', 0.16));
    },
    /** You step off your own land and start drawing a line: a soft rising pop. */
    leaveHome() {
      if (!ready()) return;
      const t = now();
      synth.note(synth.sfx(), 392, t, 0.12, 'sine', 0.1, 588);
      synth.note(synth.sfx(), 784, t + 0.02, 0.09, 'sine', 0.03);
    },
    /** You step onto land that belongs to someone else: a short, low squelch. */
    enemyLand() {
      if (!ready()) return;
      const t = now();
      synth.note(synth.sfx(), 380, t, 0.16, 'triangle', 0.13, 230);
      synth.note(synth.sfx(), 170, t, 0.1, 'sine', 0.12, 120);
    },
    /** Someone else steps onto YOUR land: two quick alert ticks, placed where they are. */
    intruder(pan: number, vol: number) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol);
      synth.note(bus, pitch(81), t, 0.09, 'triangle', 0.12);
      synth.note(bus, pitch(77), t + 0.1, 0.12, 'triangle', 0.12);
    },
    /** A capture took some of YOUR land: a small descending, minor figure. */
    landLost() {
      if (!ready()) return;
      const t = now();
      [76, 72, 69].forEach((m, i) => synth.note(synth.sfx(), pitch(m), t + i * 0.1, 0.3, 'triangle', 0.14));
    },
    /** You take the crown: a bright rising arpeggio with a sparkle on top. */
    crown() {
      if (!ready()) return;
      const t = now();
      [84, 88, 91].forEach((m, i) => synth.note(synth.sfx(), pitch(m), t + i * 0.08, 0.45, 'triangle', 0.15));
      synth.note(synth.sfx(), pitch(103), t + 0.26, 0.5, 'sine', 0.06);
    },
    /** Your share of the world passed a milestone: a bell, a step higher each time. */
    milestone(index: number) {
      if (!ready()) return;
      const t = now(), m = 79 + PENTA[index % PENTA.length] + 12 * Math.floor(index / PENTA.length);
      synth.note(synth.sfx(), pitch(m), t, 0.7, 'sine', 0.16);
      synth.note(synth.sfx(), pitch(m + 12), t, 0.5, 'sine', 0.07);
      synth.note(synth.sfx(), pitch(m + 19), t + 0.04, 0.4, 'sine', 0.035);
    },
    capture(claimed: number) {
      if (!ready()) return;
      // one smooth gesture that lasts as long as the colour spreads: a soft swell underneath, and a rising run of rounded notes
      // that each fade in (no clicky starts) and overlap the next, so it reads as one flowing sweep rather than separate beeps
      const t = now(), n = Math.min(8, 4 + Math.floor(Math.sqrt(claimed) / 3)), step = 0.075;
      synth.note(synth.sfx(), pitch(60), t, 0.2 + n * step, 'sine', 0.07, pitch(72), 0.14);
      for (let i = 0; i < n; i++) {
        const m = 72 + PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length), at = t + 0.02 + i * step, fade = 1 - (i / n) * 0.35;
        synth.note(synth.sfx(), pitch(m), at, 0.55, 'sine', 0.12 * fade, undefined, 0.035);
        synth.note(synth.sfx(), pitch(m + 12), at, 0.4, 'sine', 0.035 * fade, undefined, 0.05);
      }
    },
    /** The flip trick: a chime on take-off, a glide while it turns and a soft landing chime. Each kind of flip has its own little tune, so the sound is never the same twice. */
    flip(variant = 0) {
      if (!ready()) return;
      const t = now();
      const TUNES = [
        { notes: [76, 79, 83, 88], step: 0.06, land: [79, 86], glide: [64, 88] },          // front: a bright climb
        { notes: [88, 83, 79, 76], step: 0.06, land: [74, 81], glide: [88, 64] },          // back: the same run coming down
        { notes: [72, 79, 84, 91], step: 0.07, land: [76, 83], glide: [67, 91] },          // roll: wide open fifths
        { notes: [84, 88, 84, 91, 88], step: 0.05, land: [81, 88], glide: [72, 96] },      // spin: a quick twinkle
        { notes: [76, 79, 83, 88, 91, 95], step: 0.06, land: [83, 90], glide: [64, 95] },  // double: the climb, twice as far
        { notes: [76, 78, 82, 84, 88], step: 0.055, land: [80, 87], glide: [66, 90] },     // corkscrew: a whole-tone shimmer
      ];
      const tune = TUNES[Math.abs(Math.floor(variant)) % TUNES.length];
      tune.notes.forEach((m, i) => {
        synth.note(synth.sfx(), pitch(m), t + i * tune.step, 0.5, 'sine', 0.1, undefined, 0.02);
        synth.note(synth.sfx(), pitch(m + 12), t + i * tune.step, 0.32, 'sine', 0.03, undefined, 0.03);
      });
      synth.note(synth.sfx(), pitch(tune.glide[0]), t, 0.55, 'sine', 0.05, pitch(tune.glide[1]), 0.12);   // the whoosh of the turn
      const land = t + (variant === 4 ? 0.85 : 0.62);                              // touch-down, in time with the squash
      synth.note(synth.sfx(), pitch(tune.land[0]), land, 0.5, 'sine', 0.1, undefined, 0.02);
      synth.note(synth.sfx(), pitch(tune.land[1]), land + 0.06, 0.55, 'sine', 0.09, undefined, 0.02);
      synth.note(synth.sfx(), pitch(tune.land[1] + 12), land + 0.06, 0.3, 'sine', 0.025, undefined, 0.03);
    },
    /** Two heads colliding: a metallic clang over a dull thud and a tonal crunch. pan/vol place it for distant clashes. */
    clash(pan = 0, vol = 1) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol);
      synth.note(bus, 440, t, 0.3, 'triangle', 0.1, 330);                       // a soft clang, a detuned pair
      synth.note(bus, 659, t, 0.24, 'triangle', 0.06, 450);
      synth.note(bus, 120, t, 0.35, 'sine', 0.3, 45);                           // thud
      synth.note(bus, 160, t, 0.18, 'triangle', 0.12, 70);                      // tonal crunch (no noise)
      synth.note(bus, pitch(55), t + 0.08, 0.5, 'triangle', 0.07, pitch(43));
    },
    // other players' events: the same sounds, but quieter, softer, and placed in the stereo field
    otherCapture(claimed: number, pan: number, vol: number) {
      if (!ready()) return;
      const t = now(), n = Math.min(5, 2 + Math.floor(Math.sqrt(claimed) / 4)), bus = synth.panned(pan, vol * 0.9);
      for (let i = 0; i < n; i++) synth.note(bus, pitch(64 + PENTA[i % PENTA.length]), t + i * 0.07, 0.45, 'sine', 0.14, undefined, 0.035);
    },
    otherKill(pan: number, vol: number) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol);
      synth.note(bus, 260, t, 0.16, 'triangle', 0.09, 80);
      synth.note(bus, pitch(72), t + 0.05, 0.25, 'triangle', 0.13);
    },
    /** A beacon appears: a soft, rising three-note sparkle. */
    beaconSpawn(pan = 0, vol = 1) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol);
      [72, 76, 81].forEach((m, i) => synth.note(bus, pitch(m), t + i * 0.09, 0.4, 'sine', 0.09));
      synth.note(bus, pitch(93), t + 0.22, 0.35, 'sine', 0.03);
    },
    /** A beacon is taken: a warm swell under a bright chord. `mine` = you took it (fuller), otherwise it is heard from where it happened. */
    beacon(pan = 0, vol = 1, mine = true) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol * (mine ? 1 : 0.8));
      synth.note(bus, 110, t, 0.55, 'sine', 0.2, 196);
      [67, 71, 74, 79].forEach((m, i) => synth.note(bus, pitch(m), t + 0.05 + i * 0.045, 0.6, 'triangle', mine ? 0.13 : 0.1));
      synth.note(bus, pitch(91), t + 0.2, 0.5, 'sine', 0.04);
    },
    /** A power-up is taken: a short, soft chime whose shape tells the kind (rising = boost, steady pair = shield, falling shimmer = freeze). */
    powerup(kind: 'boost' | 'shield' | 'freeze' | 'magnet' = 'boost', pan = 0, vol = 1) {
      if (!ready()) return;
      const t = now(), bus = synth.panned(pan, vol);
      const notes = kind === 'boost' ? [67, 72, 76] : kind === 'shield' ? [72, 79] : kind === 'magnet' ? [60, 67, 72] : [84, 79, 76];
      notes.forEach((m, i) => synth.note(bus, pitch(m), t + i * 0.07, 0.35, 'sine', 0.1));
      if (kind === 'boost') synth.note(bus, 220, t, 0.25, 'triangle', 0.08, 440);
    },
    cut() {
      if (!ready()) return;
      const t = now();
      synth.note(synth.sfx(), 392, t, 0.16, 'sine', 0.07, 740);                       // a paper-plane "whoosh": a quick soft rising glide
      synth.note(synth.sfx(), 587, t + 0.025, 0.12, 'triangle', 0.04, 880);
      synth.note(synth.sfx(), 300, t, 0.14, 'triangle', 0.07, 90);                      // pop
      synth.note(synth.sfx(), pitch(79), t + 0.05, 0.25, 'triangle', 0.15);
      synth.note(synth.sfx(), pitch(86), t + 0.12, 0.35, 'triangle', 0.13);
    },
    death() {
      if (!ready()) return;
      const t = now();
      synth.note(synth.sfx(), 330, t, 0.7, 'triangle', 0.09, 70);                     // sad downward slide
      synth.note(synth.sfx(), 110, t, 0.5, 'sine', 0.22, 40);                         // low thump
      synth.note(synth.sfx(), pitch(67), t + 0.05, 0.5, 'triangle', 0.08, pitch(55));
    },
    win() {
      if (!ready()) return;
      const t = now();
      [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => {                                // bright rising run, then a held chord
        synth.note(synth.sfx(), pitch(m), t + i * 0.09, 0.6, 'triangle', 0.14);
        synth.note(synth.sfx(), pitch(m + 12), t + i * 0.09, 0.4, 'sine', 0.05);
      });
      for (const m of [84, 88, 91, 96]) synth.note(synth.sfx(), pitch(m), t + 0.7, 1.6, 'triangle', 0.1);
    },
  };
}
