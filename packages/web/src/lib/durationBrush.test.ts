import { describe, expect, it } from 'vitest';
import { createDuration, EIGHTH, QUARTER, SIXTY_FOURTH, WHOLE } from '@tabkit/core';
import { brushGlyph, brushLabel, longerBrush, nudgeDuration, shorterBrush } from './durationBrush';

describe('duration brush', () => {
  it('steps along the ladder and clamps at the ends', () => {
    expect(longerBrush(QUARTER).value).toBe(2);
    expect(shorterBrush(QUARTER).value).toBe(8);
    expect(longerBrush(WHOLE).value).toBe(1);
    expect(shorterBrush(SIXTY_FOURTH).value).toBe(64);
  });

  it('nudge preserves dots and clamps', () => {
    const dotted = createDuration(4, { dots: 1 });
    const longer = nudgeDuration(dotted, 'longer');
    expect(longer.value).toBe(2);
    expect(longer.dots).toBe(1);
    expect(nudgeDuration(WHOLE, 'longer')).toBe(WHOLE);
  });

  it('labels and glyphs', () => {
    expect(brushLabel(QUARTER)).toBe('Quarter');
    expect(brushLabel(createDuration(8, { dots: 1 }))).toBe('8th ·');
    expect(brushGlyph(EIGHTH)).toBe('♪');
  });
});
