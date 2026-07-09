import { describe, expect, it } from 'vitest';
import {
  bend,
  createBar,
  createBeat,
  createDefaultScore,
  createNote,
  createRest,
  createScore,
  createTimeSignature,
  createTrack,
  createVoice,
  createDuration,
  EIGHTH,
  FOUR_FOUR,
  plainArticulation,
  QUARTER,
  SIXTEENTH,
  slide,
  WHOLE,
} from '@tabkit/core';
import { layoutScore, bendLabel } from './layout';
import type { LinePrimitive, TextPrimitive } from './primitives';

function scoreWithBeats(beats: Parameters<typeof createVoice>[0], ts = FOUR_FOUR) {
  return createScore({ tracks: [createTrack({ bars: [createBar(ts, [createVoice(beats)])] })] });
}

describe('layoutScore', () => {
  it('draws staff lines, clef, barlines and measure numbers for the default score', () => {
    const layout = layoutScore(createDefaultScore());
    const staff = layout.primitives.filter((p) => p.kind === 'line' && p.role === 'staff');
    expect(staff).toHaveLength(6); // one system, six strings
    const clef = layout.primitives.filter((p): p is TextPrimitive => p.kind === 'text' && p.role === 'clef');
    expect(clef.map((c) => c.text)).toEqual(['T', 'A', 'B']);
    const measures = layout.primitives.filter((p): p is TextPrimitive => p.kind === 'text' && p.role === 'measureNumber');
    expect(measures.map((t) => t.text)).toEqual(['1', '2', '3', '4']);
    const barlines = layout.primitives.filter((p) => p.kind === 'line' && p.role === 'barline');
    expect(barlines).toHaveLength(5); // opening + one per bar
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('renders frets with a background rect, dead notes as x', () => {
    const score = scoreWithBeats([
      createBeat(QUARTER, [createNote(0, 12)]),
      createBeat(QUARTER, [createNote(1, 3, { articulations: [plainArticulation('dead')] })]),
    ]);
    const layout = layoutScore(score);
    const frets = layout.primitives.filter((p): p is TextPrimitive => p.kind === 'text' && p.role === 'fret');
    expect(frets.map((f) => f.text)).toEqual(['12', 'x']);
    const bgs = layout.primitives.filter((p) => p.kind === 'rect');
    expect(bgs).toHaveLength(2);
  });

  it('slots include the append slot for unfilled bars but not full ones', () => {
    const empty = layoutScore(scoreWithBeats([]));
    expect(empty.slots).toHaveLength(1);
    expect(empty.slots[0]!.path.beat).toBe(0);
    expect(empty.beats).toHaveLength(0);

    const full = layoutScore(scoreWithBeats([createBeat(WHOLE, [createNote(0, 0)])]));
    expect(full.beats).toHaveLength(1);
    expect(full.slots).toHaveLength(1); // just the beat, no append slot

    const partial = layoutScore(scoreWithBeats([createBeat(QUARTER, [createNote(0, 0)])]));
    expect(partial.slots).toHaveLength(2); // the beat + append slot
    expect(partial.slots[1]!.path.beat).toBe(1);
  });

  it('wraps bars into systems when fillToWidth is small, at least one bar per system', () => {
    const layout = layoutScore(createDefaultScore(), undefined, { fillToWidth: 150 });
    expect(layout.systems.length).toBeGreaterThan(1);
    // no infinite loop even for absurd widths
    const tiny = layoutScore(createDefaultScore(), undefined, { fillToWidth: 10 });
    expect(tiny.systems).toHaveLength(4);
  });

  it('never wraps when fillToWidth is 0, Infinity or unset', () => {
    for (const fillToWidth of [0, Infinity, undefined]) {
      const layout = layoutScore(createDefaultScore(), undefined, { fillToWidth });
      expect(layout.systems).toHaveLength(1);
    }
  });

  it('shows the time signature only where it changes', () => {
    const score = createScore({
      tracks: [
        createTrack({
          bars: [
            createBar(FOUR_FOUR),
            createBar(FOUR_FOUR),
            createBar(createTimeSignature(3, 4)),
            createBar(createTimeSignature(3, 4)),
          ],
        }),
      ],
    });
    const layout = layoutScore(score);
    const ts = layout.primitives.filter((p): p is TextPrimitive => p.kind === 'text' && p.role === 'timeSignature');
    // two texts (numerator + denominator) per shown signature: bar 1 and bar 3
    expect(ts.map((t) => t.text)).toEqual(['4', '4', '3', '4']);
  });

  it('beams consecutive eighths and sixteenths, rests break groups', () => {
    const beamed = layoutScore(
      scoreWithBeats([
        createBeat(EIGHTH, [createNote(0, 1)]),
        createBeat(EIGHTH, [createNote(0, 2)]),
        createBeat(SIXTEENTH, [createNote(0, 3)]),
        createBeat(SIXTEENTH, [createNote(0, 4)]),
      ]),
    );
    const beams = beamed.primitives.filter((p): p is LinePrimitive => p.kind === 'line' && p.role === 'beam');
    // 8th-8th: 1 beam; 8th-16th: 1 shared; 16th-16th: 2 → 4 beam segments
    expect(beams).toHaveLength(4);

    const broken = layoutScore(
      scoreWithBeats([
        createBeat(EIGHTH, [createNote(0, 1)]),
        createRest(EIGHTH), // even a beamable value breaks the group when it is a rest
        createBeat(EIGHTH, [createNote(0, 2)]),
      ]),
    );
    const brokenBeams = broken.primitives.filter((p) => p.kind === 'line' && p.role === 'beam');
    // two isolated eighths → two beamlets, never a beam across the rest
    expect(brokenBeams).toHaveLength(2);
  });

  it('draws duration dots, and rests as stemless vector glyphs', () => {
    const layout = layoutScore(
      scoreWithBeats([createBeat(createDuration(4, { dots: 1 }), [createNote(0, 0)]), createRest(QUARTER)]),
    );
    const dots = layout.primitives.filter((p) => p.kind === 'ellipse');
    expect(dots.some((d) => d.kind === 'ellipse' && d.filled)).toBe(true); // duration dot
    const rests = layout.primitives.filter((p) => p.kind === 'path' && p.role === 'rest');
    expect(rests.length).toBeGreaterThanOrEqual(1);
    // one stem for the note, none for the rest
    const stems = layout.primitives.filter((p) => p.kind === 'line' && p.role === 'stem');
    expect(stems).toHaveLength(1);
  });

  it('every rest value renders a distinct shape', () => {
    for (const value of [1, 2, 4, 8, 16, 32, 64] as const) {
      const layout = layoutScore(scoreWithBeats([createRest(createDuration(value))]));
      expect(layout.primitives.some((p) => p.kind === 'path' && p.role === 'rest')).toBe(true);
    }
  });

  it('emits ornaments: bend arrow with label, slide line, vibrato wave, h label', () => {
    const layout = layoutScore(
      scoreWithBeats([
        createBeat(QUARTER, [createNote(0, 5, { articulations: [bend(1.5)] })]),
        createBeat(QUARTER, [createNote(0, 7, { articulations: [slide('shift')] })]),
        createBeat(QUARTER, [createNote(0, 9, { articulations: [plainArticulation('vibrato')] })]),
        createBeat(QUARTER, [createNote(0, 10, { articulations: [plainArticulation('hammerOn')] })]),
      ]),
    );
    expect(layout.primitives.some((p) => p.kind === 'path' && p.role === 'bend')).toBe(true);
    const labels = layout.primitives.filter((p): p is TextPrimitive => p.kind === 'text' && p.role === 'articulation');
    expect(labels.some((l) => l.text === '1½')).toBe(true);
    expect(labels.some((l) => l.text === 'h')).toBe(true);
    expect(layout.primitives.some((p) => p.kind === 'line' && p.role === 'slide')).toBe(true);
    expect(layout.primitives.some((p) => p.kind === 'path' && p.role === 'vibrato')).toBe(true);
  });

  it('fills to height with blank ruled systems', () => {
    const short = layoutScore(createDefaultScore());
    const filled = layoutScore(createDefaultScore(), undefined, { fillToHeight: short.height + 400 });
    expect(filled.systems.length).toBeGreaterThan(short.systems.length);
    expect(filled.height).toBeGreaterThanOrEqual(short.height + 400);
  });

  it('bend labels', () => {
    expect(bendLabel(0.25)).toBe('¼');
    expect(bendLabel(0.5)).toBe('½');
    expect(bendLabel(1)).toBe('full');
    expect(bendLabel(1.5)).toBe('1½');
    expect(bendLabel(2)).toBe('2');
  });
});
