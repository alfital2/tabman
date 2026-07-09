import { describe, expect, it } from 'vitest';
import {
  createBar,
  createBeat,
  createNote,
  createScore,
  createTrack,
  createVoice,
  FOUR_FOUR,
  QUARTER,
} from '@tabkit/core';
import { hitTest } from './hitTest';
import { layoutScore } from './layout';

const score = createScore({
  tracks: [
    createTrack({
      bars: [
        createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 5)]), createBeat(QUARTER, [createNote(3, 7)])])]),
        createBar(FOUR_FOUR),
      ],
    }),
  ],
});

describe('hitTest', () => {
  it('maps a beat box center to its cell with the nearest string', () => {
    const layout = layoutScore(score);
    const first = layout.beats[0]!;
    const cx = first.rect.x + first.rect.width / 2;
    const stringYs = layout.systems[0]!.stringYs;
    expect(hitTest(layout, cx, stringYs[0]!)).toEqual({ bar: 0, beat: 0, string: 0 });
    expect(hitTest(layout, cx, stringYs[4]! + 2)).toEqual({ bar: 0, beat: 0, string: 4 });
  });

  it('hits the append slot of an unfilled bar', () => {
    const layout = layoutScore(score);
    const appendSlot = layout.slots.find((s) => s.path.bar === 0 && s.path.beat === 2)!;
    const cx = appendSlot.rect.x + appendSlot.rect.width / 2;
    const cy = layout.systems[0]!.stringYs[2]!;
    expect(hitTest(layout, cx, cy)).toEqual({ bar: 0, beat: 2, string: 2 });
  });

  it('hits an empty bar at its only slot', () => {
    const layout = layoutScore(score);
    const slot = layout.slots.find((s) => s.path.bar === 1)!;
    const cx = slot.rect.x + slot.rect.width / 2;
    const cy = layout.systems[0]!.stringYs[5]!;
    expect(hitTest(layout, cx, cy)).toEqual({ bar: 1, beat: 0, string: 5 });
  });

  it('returns null off the sheet', () => {
    const layout = layoutScore(score);
    expect(hitTest(layout, -50, -50)).toBeNull();
    expect(hitTest(layout, layout.width + 100, 10)).toBeNull();
    expect(hitTest(layout, 1, layout.height + 100)).toBeNull();
  });
});
