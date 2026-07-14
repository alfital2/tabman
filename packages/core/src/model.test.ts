import { describe, expect, it } from 'vitest';
import { bend } from './articulation';
import { createDuration, HALF, QUARTER, WHOLE } from './duration';
import { fraction, fractionEquals } from './fraction';
import {
  barAdvanceWholes,
  barFilledInWholes,
  barHasRoomFor,
  clampTempo,
  createBar,
  createBeat,
  createDefaultScore,
  createNote,
  createRest,
  createScore,
  createTrack,
  createVoice,
  isBarComplete,
  isBarOverfull,
  isRest,
  voiceDurationInWholes,
  withScoreMeta,
} from './model';
import { createTimeSignature, FOUR_FOUR } from './timeSignature';

describe('note', () => {
  it('validates string and fret', () => {
    expect(() => createNote(-1, 0)).toThrow(RangeError);
    expect(() => createNote(0, 25)).toThrow(RangeError);
    expect(() => createNote(0, 1.5)).toThrow(RangeError);
    expect(createNote(0, 24).fret).toBe(24);
  });

  it('dedupes articulations by type, last wins', () => {
    const note = createNote(0, 5, { articulations: [bend(1), bend(2)] });
    expect(note.articulations).toEqual([{ type: 'bend', amount: 2 }]);
  });

  it('is frozen', () => {
    const note = createNote(0, 5);
    expect(Object.isFrozen(note)).toBe(true);
    expect(Object.isFrozen(note.articulations)).toBe(true);
  });
});

describe('beat', () => {
  it('keeps at most one note per string (last wins) and sorts by string', () => {
    const beat = createBeat(QUARTER, [createNote(2, 3), createNote(0, 1), createNote(2, 7)]);
    expect(beat.notes.map((n) => [n.string, n.fret])).toEqual([
      [0, 1],
      [2, 7],
    ]);
  });

  it('rest = no notes', () => {
    expect(isRest(createRest(QUARTER))).toBe(true);
    expect(isRest(createBeat(QUARTER, [createNote(0, 0)]))).toBe(false);
  });
});

describe('bar', () => {
  it('measures fill against the time signature', () => {
    const bar = createBar(FOUR_FOUR, [createVoice([createBeat(HALF, []), createBeat(QUARTER, [])])]);
    expect(fractionEquals(barFilledInWholes(bar), fraction(3, 4))).toBe(true);
    expect(isBarComplete(bar)).toBe(false);
    expect(barHasRoomFor(bar, fraction(1, 4))).toBe(true);
    expect(barHasRoomFor(bar, fraction(1, 2))).toBe(false);
  });

  it('detects complete and overfull bars', () => {
    const complete = createBar(FOUR_FOUR, [createVoice([createBeat(WHOLE, [])])]);
    expect(isBarComplete(complete)).toBe(true);
    expect(isBarOverfull(complete)).toBe(false);
    const overfull = createBar(createTimeSignature(2, 4), [createVoice([createBeat(WHOLE, [])])]);
    expect(isBarOverfull(overfull)).toBe(true);
    expect(isBarComplete(overfull)).toBe(false);
  });

  it('uses the longest voice for fill', () => {
    const bar = createBar(FOUR_FOUR, [
      createVoice([createBeat(QUARTER, [])]),
      createVoice([createBeat(WHOLE, [])]),
    ]);
    expect(fractionEquals(barFilledInWholes(bar), fraction(1))).toBe(true);
  });

  it('voice duration sums dotted/tuplet beats exactly', () => {
    const tripletEighth = createDuration(8, { tuplet: { actual: 3, normal: 2 } });
    const voice = createVoice([
      createBeat(tripletEighth, []),
      createBeat(tripletEighth, []),
      createBeat(tripletEighth, []),
      createBeat(createDuration(4, { dots: 1 }), []),
      createBeat(createDuration(8), []),
    ]);
    // 3×(1/12) + 3/8 + 1/8 = 1/4 + 1/2 = 3/4
    expect(fractionEquals(voiceDurationInWholes(voice), fraction(3, 4))).toBe(true);
  });
});

describe('score', () => {
  it('default score: one track, four empty 4/4 bars, 120 BPM', () => {
    const score = createDefaultScore();
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0]!.bars).toHaveLength(4);
    expect(score.tempo).toBe(120);
    expect(score.tracks[0]!.tuning).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('clamps tempo to sane bounds', () => {
    expect(clampTempo(0)).toBe(20);
    expect(clampTempo(9999)).toBe(400);
    expect(clampTempo(NaN)).toBe(120);
    expect(clampTempo(Infinity)).toBe(120);
    expect(createScore({ tempo: -5 }).tempo).toBe(20);
  });

  it('withScoreMeta patches shallowly', () => {
    const score = createDefaultScore();
    const next = withScoreMeta(score, { title: 'Riff', tempo: 90 });
    expect(next.title).toBe('Riff');
    expect(next.tempo).toBe(90);
    expect(next.subtitle).toBe(score.subtitle);
    expect(next.tracks[0]).toBe(score.tracks[0]); // structural sharing
  });

  it('factories reject empty collections', () => {
    expect(() => createTrack({ bars: [] })).toThrow(RangeError);
    expect(() => createTrack({ tuning: [] })).toThrow(RangeError);
    expect(() => createScore({ tracks: [] })).toThrow(RangeError);
    expect(() => createBar(FOUR_FOUR, [])).toThrow(RangeError);
  });
});

describe('pickup bars', () => {
  it('createBar defaults pickup to false and accepts the flag', () => {
    expect(createBar(FOUR_FOUR).pickup).toBe(false);
    expect(createBar(FOUR_FOUR, undefined, { pickup: true }).pickup).toBe(true);
  });

  it('barAdvanceWholes: normal bar advances by capacity even when underfull', () => {
    const bar = createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 1)])])]);
    expect(fractionEquals(barAdvanceWholes(bar), fraction(1, 1))).toBe(true);
  });

  it('barAdvanceWholes: pickup bar advances by its content', () => {
    const bar = createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 1)])])], { pickup: true });
    expect(fractionEquals(barAdvanceWholes(bar), fraction(1, 4))).toBe(true);
  });

  it('barAdvanceWholes: empty pickup falls back to capacity; overfull uses content', () => {
    expect(fractionEquals(barAdvanceWholes(createBar(FOUR_FOUR, undefined, { pickup: true })), fraction(1, 1))).toBe(true);
    const overfull = createBar(
      createTimeSignature(1, 4),
      [createVoice([createBeat(HALF, [createNote(0, 1)])])],
    );
    expect(fractionEquals(barAdvanceWholes(overfull), fraction(1, 2))).toBe(true);
  });
});
