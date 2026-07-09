import {
  createDuration,
  durationEquals,
  EIGHTH,
  HALF,
  QUARTER,
  SIXTEENTH,
  SIXTY_FOURTH,
  THIRTY_SECOND,
  WHOLE,
  type Duration,
} from '@tabkit/core';

/** The note-value ladder, longest first. */
export const BRUSH_LADDER: readonly Duration[] = [
  WHOLE,
  HALF,
  QUARTER,
  EIGHTH,
  SIXTEENTH,
  THIRTY_SECOND,
  SIXTY_FOURTH,
];

function ladderIndex(d: Duration): number {
  const i = BRUSH_LADDER.findIndex((x) => x.value === d.value);
  return i === -1 ? 2 : i; // fall back to a quarter
}

/** Step toward longer values (whole-ward), preserving dots/tuplets is not needed for the brush. */
export function longerBrush(d: Duration): Duration {
  return BRUSH_LADDER[Math.max(0, ladderIndex(d) - 1)]!;
}

export function shorterBrush(d: Duration): Duration {
  return BRUSH_LADDER[Math.min(BRUSH_LADDER.length - 1, ladderIndex(d) + 1)]!;
}

const GLYPHS: Record<number, string> = {
  1: '𝅝',
  2: '𝅗𝅥',
  4: '♩',
  8: '♪',
  16: '♬',
  32: '𝅘𝅥𝅰',
  64: '𝅘𝅥𝅱',
};

const NAMES: Record<number, string> = {
  1: 'Whole',
  2: 'Half',
  4: 'Quarter',
  8: '8th',
  16: '16th',
  32: '32nd',
  64: '64th',
};

export function brushGlyph(d: Duration): string {
  return GLYPHS[d.value] ?? '♩';
}

export function brushLabel(d: Duration): string {
  const dots = d.dots > 0 ? ` ${'·'.repeat(d.dots)}` : '';
  return `${NAMES[d.value] ?? '?'}${dots}`;
}

export function sameBrush(a: Duration, b: Duration): boolean {
  return durationEquals(a, b);
}

/** Nudge an existing duration (dots preserved) one value longer/shorter. */
export function nudgeDuration(d: Duration, direction: 'longer' | 'shorter'): Duration {
  const next = direction === 'longer' ? longerBrush(d) : shorterBrush(d);
  if (next.value === d.value) return d;
  return createDuration(next.value, { dots: d.dots, tuplet: d.tuplet });
}
