import { describe, expect, it } from 'vitest';
import {
  chordIntervals,
  chordName,
  getChord,
  listChordNames,
  parseChordName,
  ROOT_NAMES,
  searchChords,
  voicingPitchClasses,
} from './chords';
import { MAX_FRET } from './pitch';

describe('parseChordName', () => {
  it('parses roots, accidentals and qualities', () => {
    expect(parseChordName('C')).toEqual({ root: 0, quality: 'maj' });
    expect(parseChordName('Am')).toEqual({ root: 9, quality: 'm' });
    expect(parseChordName('G7')).toEqual({ root: 7, quality: '7' });
    expect(parseChordName('F#maj7')).toEqual({ root: 6, quality: 'maj7' });
    expect(parseChordName('Bbm7')).toEqual({ root: 10, quality: 'm7' });
    expect(parseChordName('Db')).toEqual({ root: 1, quality: 'maj' });
    expect(parseChordName('Csus4')).toEqual({ root: 0, quality: 'sus4' });
    expect(parseChordName('E5')).toEqual({ root: 4, quality: '5' });
    expect(parseChordName('Cmin')).toEqual({ root: 0, quality: 'm' });
  });

  it('rejects nonsense', () => {
    expect(parseChordName('H')).toBeNull();
    expect(parseChordName('Cwut')).toBeNull();
    expect(parseChordName('')).toBeNull();
  });
});

describe('chordName', () => {
  it('formats names', () => {
    expect(chordName(0, 'maj')).toBe('C');
    expect(chordName(9, 'm')).toBe('Am');
    expect(chordName(6, 'maj7')).toBe('F#maj7');
  });
});

describe('getChord voicings', () => {
  it('C major offers the open shape plus barre shapes, ascending by position', () => {
    const c = getChord('C')!;
    expect(c.voicings.length).toBeGreaterThanOrEqual(2);
    expect(c.voicings[0]!.shape).toBe('open');
    // the open C is x32010 in our order [e0,B1,G0,D2,A3,E x]
    expect(c.voicings[0]!.frets).toEqual([0, 1, 0, 2, 3, null]);
    // positions ascend
    const bases = c.voicings.map((v) => v.baseFret);
    expect([...bases]).toEqual([...bases].sort((a, b) => a - b));
  });

  it('open A comes out of the A-shape at the nut (x02220)', () => {
    const a = getChord('A')!;
    expect(a.voicings.some((v) => voicingKeyEq(v.frets, [0, 2, 2, 2, 0, null]))).toBe(true);
  });

  it('power chords have just root + fifth', () => {
    const e5 = getChord('E5')!;
    for (const v of e5.voicings) {
      const pcs = new Set(voicingPitchClasses(v));
      expect([...pcs].every((pc) => pc === 4 || pc === 11)).toBe(true); // E and B
    }
  });

  it('every voicing of every chord actually spells that chord', () => {
    for (const name of listChordNames()) {
      const chord = getChord(name)!;
      const tones = new Set(chordIntervals(chord.quality).map((i) => (chord.root + i) % 12));
      for (const v of chord.voicings) {
        const pcs = voicingPitchClasses(v);
        // in range
        for (const f of v.frets) {
          if (f !== null) expect(f).toBeGreaterThanOrEqual(0), expect(f).toBeLessThanOrEqual(MAX_FRET);
        }
        // sounds at least two strings
        expect(pcs.length).toBeGreaterThanOrEqual(2);
        // every sounded pitch is a chord tone
        for (const pc of pcs) {
          expect(tones.has(pc), `${name} (${v.shape}) plays a non-chord tone ${String(pc)}`).toBe(true);
        }
        // the root is present
        expect(pcs.includes(chord.root), `${name} (${v.shape}) is missing its root`).toBe(true);
        // triads/sevenths include the third
        if (chord.quality !== '5' && chord.quality !== 'sus2' && chord.quality !== 'sus4') {
          const isMinor = chord.quality === 'm' || chord.quality === 'm7' || chord.quality === 'm6';
          const third = (chord.root + (isMinor ? 3 : 4)) % 12;
          expect(pcs.includes(third), `${name} (${v.shape}) is missing its third`).toBe(true);
        }
      }
    }
  });
});

describe('search', () => {
  it('lists a name per root × quality', () => {
    const names = listChordNames();
    expect(names).toContain('C');
    expect(names).toContain('Am7');
    expect(names).toContain('F#m');
    expect(names.length).toBeGreaterThan(80);
  });

  it('filters and ranks by prefix, exact first', () => {
    const res = searchChords('am');
    expect(res[0]).toBe('Am'); // exact parse of "am" is promoted to the front
    expect(res).toContain('Am7');
    const g7 = searchChords('g7');
    expect(g7[0]).toBe('G7');
    const empty = searchChords('');
    expect(empty.length).toBe(listChordNames().length);
  });

  it('root names cover all 12 pitch classes', () => {
    expect(ROOT_NAMES).toHaveLength(12);
  });
});

function voicingKeyEq(a: readonly (number | null)[], b: readonly (number | null)[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
