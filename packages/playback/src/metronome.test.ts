import { describe, expect, it } from 'vitest';
import {
  createBar,
  createBeat,
  createNote,
  createScore,
  createTimeSignature,
  createTrack,
  createVoice,
  FOUR_FOUR,
  QUARTER,
} from '@tabkit/core';
import { metronomeClicks } from './metronome';

describe('metronomeClicks', () => {
  it('clicks every time-signature beat, downbeat accented', () => {
    const score = createScore({
      tracks: [createTrack({ bars: [createBar(FOUR_FOUR), createBar(FOUR_FOUR)] })],
    });
    const clicks = metronomeClicks(score, 120);
    expect(clicks).toHaveLength(8);
    expect(clicks[0]).toEqual({ timeSec: 0, accent: true });
    expect(clicks[1]).toEqual({ timeSec: 0.5, accent: false });
    expect(clicks[4]).toEqual({ timeSec: 2, accent: true }); // bar 2 downbeat
  });

  it('handles compound signatures (6/8)', () => {
    const score = createScore({
      tracks: [createTrack({ bars: [createBar(createTimeSignature(6, 8))] })],
    });
    const clicks = metronomeClicks(score, 120);
    expect(clicks).toHaveLength(6);
    expect(clicks[1]!.timeSec).toBeCloseTo(0.25); // eighth-note grid
  });

  it('stays continuous across underfilled bars', () => {
    const score = createScore({
      tracks: [
        createTrack({
          bars: [
            createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 0)])])]),
            createBar(FOUR_FOUR),
          ],
        }),
      ],
    });
    const clicks = metronomeClicks(score, 120);
    expect(clicks[4]!.timeSec).toBeCloseTo(2); // grid locked despite the short bar
  });

  it('from drops earlier clicks and rebases', () => {
    const score = createScore({
      tracks: [createTrack({ bars: [createBar(FOUR_FOUR), createBar(FOUR_FOUR)] })],
    });
    const clicks = metronomeClicks(score, 120, { fromBar: 1, fromBeat: 0 });
    expect(clicks).toHaveLength(4);
    expect(clicks[0]).toEqual({ timeSec: 0, accent: true });
  });
});
