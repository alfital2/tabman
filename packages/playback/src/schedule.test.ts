import { describe, expect, it } from 'vitest';
import {
  bend,
  createBar,
  createBeat,
  createNote,
  createRest,
  createScore,
  createTimeSignature,
  createTrack,
  createVoice,
  EIGHTH,
  FOUR_FOUR,
  HALF,
  plainArticulation,
  QUARTER,
  slide,
  type Bar,
} from '@tabkit/core';
import { beatStartSeconds, scheduleScore, secondsPerWhole } from './schedule';

function scoreOf(...bars: Bar[]) {
  return createScore({ tempo: 120, tracks: [createTrack({ bars })] });
}

describe('secondsPerWhole', () => {
  it('is 240/bpm', () => {
    expect(secondsPerWhole(120)).toBe(2);
    expect(secondsPerWhole(60)).toBe(4);
    expect(() => secondsPerWhole(0)).toThrow(RangeError);
    expect(() => secondsPerWhole(-10)).toThrow(RangeError);
  });
});

describe('scheduleScore', () => {
  it('places beats at cumulative offsets; bars advance by capacity', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 0)])])]), // underfilled
      createBar(FOUR_FOUR, [createVoice([createBeat(HALF, [createNote(0, 2)])])]),
    );
    const { events, totalSec } = scheduleScore(score, 120);
    expect(events).toHaveLength(2);
    expect(events[0]!.startSec).toBe(0);
    expect(events[0]!.durationSec).toBeCloseTo(0.5);
    // bar 1 starts a full 2s later despite bar 0 holding only one quarter
    expect(events[1]!.startSec).toBeCloseTo(2);
    expect(totalSec).toBeCloseTo(4);
  });

  it('overfull bars advance by their content, not capacity', () => {
    const score = scoreOf(
      createBar(createTimeSignature(2, 4), [
        createVoice([createBeat(HALF, [createNote(0, 0)]), createBeat(QUARTER, [createNote(0, 1)])]),
      ]),
      createBar(createTimeSignature(2, 4), [createVoice([createBeat(QUARTER, [createNote(0, 2)])])]),
    );
    const { events } = scheduleScore(score, 120);
    // bar 0 content = 3/4 whole = 1.5s > capacity 1s → bar 1 starts at 1.5s
    expect(events[2]!.startSec).toBeCloseTo(1.5);
  });

  it('computes midi and frequency per note', () => {
    const score = scoreOf(createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 5)])])]));
    const note = scheduleScore(score, 120).events[0]!.notes[0]!;
    expect(note.midi).toBe(69); // high E + 5 = A4
    expect(note.frequency).toBeCloseTo(440);
  });

  it('hammer-on ties the next note and folds it into the source', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [plainArticulation('hammerOn')] })]),
          createBeat(QUARTER, [createNote(0, 7)]),
        ]),
      ]),
    );
    const { events } = scheduleScore(score, 120);
    const source = events[0]!.notes[0]!;
    const target = events[1]!.notes[0]!;
    expect(target.attack).toBe(false);
    expect(source.attack).toBe(true);
    expect(source.sustainSec).toBeCloseTo(1); // rings through both quarters
    expect(source.pitch).toBeDefined();
    const last = source.pitch![source.pitch!.length - 1]!;
    expect(last.ratio).toBeCloseTo(2 ** (2 / 12)); // two semitones up
  });

  it('legato slide chains fold the target bend too', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [slide('legato')] })]),
          createBeat(QUARTER, [createNote(0, 7, { articulations: [bend(1)] })]),
        ]),
      ]),
    );
    const { events } = scheduleScore(score, 120);
    const source = events[0]!.notes[0]!;
    expect(events[1]!.notes[0]!.attack).toBe(false);
    const last = source.pitch![source.pitch!.length - 1]!;
    // glide to +2 semitones, then bend a further whole tone (+2 more)
    expect(last.ratio).toBeCloseTo(2 ** (4 / 12));
  });

  it('slides step chromatically through every fret (quantized, not fretless)', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(2, 5, { articulations: [slide('shift')] })]), // G string 5 → 10
          createBeat(QUARTER, [createNote(2, 10)]),
        ]),
      ]),
    );
    const source = scheduleScore(score, 120).events[0]!.notes[0]!;
    const anchors = source.pitch!;
    // 5 semitones → at least one hold+step anchor pair per fret
    expect(anchors.length).toBeGreaterThanOrEqual(10);
    // every intermediate fret's ratio appears exactly (chromatic staircase)
    for (let semitone = 1; semitone <= 5; semitone++) {
      const expected = 2 ** (semitone / 12);
      expect(anchors.some((a) => Math.abs(a.ratio - expected) < 1e-9)).toBe(true);
    }
    // times stay monotonic
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]!.atSec).toBeGreaterThanOrEqual(anchors[i - 1]!.atSec);
    }
  });

  it('shift slide glides but re-picks the destination', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [slide('shift')] })]),
          createBeat(QUARTER, [createNote(0, 9)]),
        ]),
      ]),
    );
    const { events } = scheduleScore(score, 120);
    const source = events[0]!.notes[0]!;
    const target = events[1]!.notes[0]!;
    expect(target.attack).toBe(true);
    expect(source.glideToMidi).toBe(target.midi);
    expect(source.pitch![source.pitch!.length - 1]!.ratio).toBeCloseTo(2 ** (4 / 12));
  });

  it('play-from the middle of a legato chain re-folds it (no silence, keeps the glide)', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [plainArticulation('hammerOn')] })]),
          createBeat(QUARTER, [createNote(0, 7, { articulations: [plainArticulation('hammerOn')] })]),
          createBeat(QUARTER, [createNote(0, 9)]),
        ]),
      ]),
    );
    // Full playback: the whole chain folds into beat 0.
    const full = scheduleScore(score, 120);
    expect(full.events[0]!.notes[0]!.attack).toBe(true);
    expect(full.events[1]!.notes[0]!.attack).toBe(false);
    expect(full.events[2]!.notes[0]!.attack).toBe(false);

    // Starting mid-chain at beat 1: it must become a fresh pick that still
    // slurs into beat 2 — not a stale attack:false that would go silent.
    const mid = scheduleScore(score, 120, { fromBar: 0, fromBeat: 1 });
    expect(mid.events).toHaveLength(2);
    const first = mid.events[0]!.notes[0]!;
    expect(first.attack).toBe(true); // re-picked
    expect(mid.events[1]!.notes[0]!.attack).toBe(false); // still slurred
    expect(first.pitch).toBeDefined(); // carries the step up to fret 9
    expect(first.sustainSec).toBeCloseTo(1); // rings through both remaining beats
  });

  it('the default (legato) slide does not re-pick the target', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [slide('legato')] })]),
          createBeat(QUARTER, [createNote(0, 10)]),
        ]),
      ]),
    );
    const { events } = scheduleScore(score, 120);
    expect(events[1]!.notes[0]!.attack).toBe(false); // no second pick at fret 10
    const anchors = events[0]!.notes[0]!.pitch!;
    // reaches the target pitch (+5 semitones) via a fret-by-fret staircase
    expect(anchors[anchors.length - 1]!.ratio).toBeCloseTo(2 ** (5 / 12));
    expect(anchors.length).toBeGreaterThanOrEqual(10);
  });

  it('a chain broken by a rest or another string leaves the target picked', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(QUARTER, [createNote(0, 5, { articulations: [plainArticulation('hammerOn')] })]),
          createRest(QUARTER),
          createBeat(QUARTER, [createNote(0, 7)]),
        ]),
      ]),
    );
    const { events } = scheduleScore(score, 120);
    expect(events[2]!.notes[0]!.attack).toBe(true);
    expect(events[0]!.notes[0]!.sustainSec).toBeCloseTo(0.5); // no chain
  });

  it('bend bakes pitch automation over ~60% of the note', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [createVoice([createBeat(HALF, [createNote(0, 5, { articulations: [bend(1)] })])])]),
    );
    const note = scheduleScore(score, 120).events[0]!.notes[0]!;
    expect(note.pitch).toEqual([
      { atSec: 0, ratio: 1 },
      { atSec: expect.closeTo(0.6, 5) as number, ratio: expect.closeTo(2 ** (2 / 12), 5) as number },
    ]);
  });

  it('from rebases times and re-picks the first event', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [
        createVoice([
          createBeat(HALF, [createNote(0, 5, { articulations: [plainArticulation('hammerOn')] })]),
          createBeat(HALF, [createNote(0, 7)]),
        ]),
      ]),
      createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 3)])])]),
    );
    const full = scheduleScore(score, 120);
    expect(full.events[1]!.notes[0]!.attack).toBe(false); // legato target

    const fromSecond = scheduleScore(score, 120, { fromBar: 0, fromBeat: 1 });
    expect(fromSecond.events[0]!.startSec).toBe(0);
    expect(fromSecond.events[0]!.notes[0]!.attack).toBe(true); // re-picked
    expect(fromSecond.events[1]!.startSec).toBeCloseTo(1); // bar 1 rebased
    expect(fromSecond.totalSec).toBeCloseTo(3);

    const fromBar1 = scheduleScore(score, 120, { fromBar: 1 });
    expect(fromBar1.events).toHaveLength(1);
    expect(fromBar1.totalSec).toBeCloseTo(2);
  });

  it('from past the end yields an empty schedule', () => {
    const score = scoreOf(createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 0)])])]));
    const result = scheduleScore(score, 120, { fromBar: 5, fromBeat: 0 });
    expect(result.events).toHaveLength(0);
  });
});

describe('beatStartSeconds', () => {
  it('accumulates bar advances and in-bar beat durations', () => {
    const score = scoreOf(
      createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 0)])])]),
      createBar(FOUR_FOUR, [createVoice([createBeat(EIGHTH, []), createBeat(EIGHTH, [createNote(0, 1)])])]),
    );
    expect(beatStartSeconds(score, 120, 0, 0)).toBe(0);
    expect(beatStartSeconds(score, 120, 1, 0)).toBeCloseTo(2);
    expect(beatStartSeconds(score, 120, 1, 1)).toBeCloseTo(2.25);
    // append slot: content end of the bar
    expect(beatStartSeconds(score, 120, 1, 2)).toBeCloseTo(2.5);
    // out of range clamps safely
    expect(beatStartSeconds(score, 120, 99, 0)).toBeCloseTo(4);
  });
});
