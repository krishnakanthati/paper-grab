// What the game sounds like, in numbers: how high it may go, how bright it may be, how loud. The aim is soft and pleasant,
// never shrill: notes are low and round (sine and triangle only), nothing is allowed above `maxHz`, and the top of the
// spectrum is rolled off on the way out.
export const AUDIO = {
  transposeSemitones: -7,        // every musical cue is played this far down from how it was written (a fifth lower: warmer)
  maxHz: 988,                    // no note may be higher than this: anything above is folded down by octaves
  lowpassHz: 2600, lowpassQ: 0.6,   // the whole effects bus is rolled off above this
  shelfHz: 2400, shelfDb: -5,    // and the highs that remain are turned down a little
  sfxGain: 1.2,                  // overall effects level (it was 1.5; a compressor still guards against clipping)
  minAttackSec: 0.012,           // never a faster attack than this: the click of an instant start is what makes sounds feel sharp
  roomWet: 0.8,                  // how much of the soft "room" tail is mixed in
  smoothWaves: true,             // square and sawtooth voices are played as triangle (same pitch, none of the buzz)
};
