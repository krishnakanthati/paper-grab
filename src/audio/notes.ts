// Music theory helpers: pitch maths and the scale/chords the generated music draws from.
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// C major pentatonic degrees: any mix of these notes sounds consonant over the chords below.
export const PENTA = [0, 2, 4, 7, 9];
// one chord per bar (MIDI notes): C, Am, F, G
export const CHORDS: ReadonlyArray<readonly number[]> = [[48, 52, 55], [45, 48, 52], [53, 57, 60], [55, 59, 62]];
