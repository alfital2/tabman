/** Open-string MIDI pitches, highest-sounding string first (index 0). */
export type Tuning = readonly number[];

export const MAX_FRET = 24;

export const STANDARD_GUITAR_TUNING: Tuning = Object.freeze([64, 59, 55, 50, 45, 40]); // E4 B3 G3 D3 A2 E2

const NAMED_TUNINGS: ReadonlyArray<{ name: string; tuning: Tuning }> = [
  { name: 'Standard', tuning: STANDARD_GUITAR_TUNING },
  { name: 'Drop D', tuning: Object.freeze([64, 59, 55, 50, 45, 38]) },
  { name: 'Half Step Down', tuning: Object.freeze([63, 58, 54, 49, 44, 39]) },
  { name: 'Drop C', tuning: Object.freeze([62, 57, 53, 48, 43, 36]) },
  { name: 'DADGAD', tuning: Object.freeze([62, 57, 55, 50, 45, 38]) },
  { name: 'Open G', tuning: Object.freeze([62, 59, 55, 50, 43, 38]) },
  { name: 'Open D', tuning: Object.freeze([62, 57, 54, 50, 45, 38]) },
];

export function tuningName(tuning: Tuning): string {
  for (const { name, tuning: candidate } of NAMED_TUNINGS) {
    if (candidate.length === tuning.length && candidate.every((midi, i) => midi === tuning[i])) {
      return name;
    }
  }
  return 'Custom';
}

export function isValidMidi(midi: number): boolean {
  return Number.isSafeInteger(midi) && midi >= 0 && midi <= 127;
}

export function fretToMidi(tuning: Tuning, stringIndex: number, fret: number): number {
  const open = tuning[stringIndex];
  if (open === undefined) {
    throw new RangeError(`string ${String(stringIndex)} is outside the tuning (${String(tuning.length)} strings)`);
  }
  if (!Number.isSafeInteger(fret) || fret < 0 || fret > MAX_FRET) {
    throw new RangeError(`fret must be an integer 0..${String(MAX_FRET)}, got ${String(fret)}`);
  }
  return open + fret;
}

/** A4 (midi 69) = 440 Hz, twelve-tone equal temperament. */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function midiToName(midi: number): string {
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`midi must be an integer 0..127, got ${String(midi)}`);
  }
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]!}${String(octave)}`;
}

/**
 * The fret on `toString` that sounds the same pitch as `fromFret` on
 * `fromString`, or null when the pitch is unreachable there (off the neck).
 * Powers pitch-preserving drags between strings.
 */
export function restringFret(tuning: Tuning, fromString: number, fromFret: number, toString: number): number | null {
  const fromOpen = tuning[fromString];
  const toOpen = tuning[toString];
  if (fromOpen === undefined || toOpen === undefined) return null;
  if (!Number.isSafeInteger(fromFret) || fromFret < 0 || fromFret > MAX_FRET) return null;
  const fret = fromOpen + fromFret - toOpen;
  return fret >= 0 && fret <= MAX_FRET ? fret : null;
}
