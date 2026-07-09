import { describe, expect, it } from 'vitest';
import {
  fretToMidi,
  MAX_FRET,
  midiToFrequency,
  midiToName,
  restringFret,
  STANDARD_GUITAR_TUNING,
  tuningName,
} from './pitch';

describe('pitch', () => {
  it('standard tuning is E4 B3 G3 D3 A2 E2', () => {
    expect(STANDARD_GUITAR_TUNING.map((m) => midiToName(m))).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
  });

  it('recognizes named tunings', () => {
    expect(tuningName(STANDARD_GUITAR_TUNING)).toBe('Standard');
    expect(tuningName([64, 59, 55, 50, 45, 38])).toBe('Drop D');
    expect(tuningName([62, 57, 55, 50, 45, 38])).toBe('DADGAD');
    expect(tuningName([64, 59, 55, 50, 45, 41])).toBe('Custom');
    expect(tuningName([64, 59, 55, 50])).toBe('Custom');
  });

  it('maps frets to midi', () => {
    expect(fretToMidi(STANDARD_GUITAR_TUNING, 0, 0)).toBe(64);
    expect(fretToMidi(STANDARD_GUITAR_TUNING, 5, 5)).toBe(45); // low E, 5th fret = A2
    expect(() => fretToMidi(STANDARD_GUITAR_TUNING, 6, 0)).toThrow(RangeError);
    expect(() => fretToMidi(STANDARD_GUITAR_TUNING, 0, MAX_FRET + 1)).toThrow(RangeError);
    expect(() => fretToMidi(STANDARD_GUITAR_TUNING, 0, -1)).toThrow(RangeError);
  });

  it('midi to frequency (A4 = 440)', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(57)).toBeCloseTo(220);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  it('midi to name', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(61)).toBe('C#4');
    expect(midiToName(0)).toBe('C-1');
    expect(() => midiToName(128)).toThrow(RangeError);
    expect(() => midiToName(-1)).toThrow(RangeError);
  });

  it('restrings a fret pitch-preserving', () => {
    // 5th fret on the B string (index 1) = E4 = open high E (index 0)
    expect(restringFret(STANDARD_GUITAR_TUNING, 1, 5, 0)).toBe(0);
    // open high E moved to B string = 5th fret
    expect(restringFret(STANDARD_GUITAR_TUNING, 0, 0, 1)).toBe(5);
    // open low E (index 5) has no home on the A string below fret 0
    expect(restringFret(STANDARD_GUITAR_TUNING, 5, 0, 4)).toBeNull();
    // high fret pushed past MAX_FRET
    expect(restringFret(STANDARD_GUITAR_TUNING, 0, 24, 5)).toBeNull();
    // invalid strings
    expect(restringFret(STANDARD_GUITAR_TUNING, 0, 0, 6)).toBeNull();
    expect(restringFret(STANDARD_GUITAR_TUNING, -1, 0, 1)).toBeNull();
  });
});
