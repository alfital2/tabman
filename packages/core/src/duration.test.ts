import { describe, expect, it } from 'vitest';
import { createDuration, durationEquals, durationToWholes, EIGHTH, QUARTER, SIXTY_FOURTH, WHOLE } from './duration';
import { fraction, fractionEquals } from './fraction';

describe('duration', () => {
  it('converts plain values to wholes', () => {
    expect(fractionEquals(durationToWholes(WHOLE), fraction(1))).toBe(true);
    expect(fractionEquals(durationToWholes(QUARTER), fraction(1, 4))).toBe(true);
    expect(fractionEquals(durationToWholes(SIXTY_FOURTH), fraction(1, 64))).toBe(true);
  });

  it('applies dots', () => {
    expect(fractionEquals(durationToWholes(createDuration(4, { dots: 1 })), fraction(3, 8))).toBe(true);
    expect(fractionEquals(durationToWholes(createDuration(4, { dots: 2 })), fraction(7, 16))).toBe(true);
  });

  it('applies tuplets', () => {
    const tripletEighth = createDuration(8, { tuplet: { actual: 3, normal: 2 } });
    expect(fractionEquals(durationToWholes(tripletEighth), fraction(1, 12))).toBe(true);
  });

  it('applies dots and tuplets together', () => {
    const d = createDuration(8, { dots: 1, tuplet: { actual: 3, normal: 2 } });
    // 1/8 × 3/2 × 2/3 = 1/8
    expect(fractionEquals(durationToWholes(d), fraction(1, 8))).toBe(true);
  });

  it('rejects invalid values, dots, tuplets', () => {
    expect(() => createDuration(3 as never)).toThrow(RangeError);
    expect(() => createDuration(4, { dots: 3 })).toThrow(RangeError);
    expect(() => createDuration(4, { dots: -1 })).toThrow(RangeError);
    expect(() => createDuration(4, { tuplet: { actual: 0, normal: 2 } })).toThrow(RangeError);
    expect(() => createDuration(4, { tuplet: { actual: 1.5, normal: 2 } })).toThrow(RangeError);
  });

  it('compares durations structurally', () => {
    expect(durationEquals(QUARTER, createDuration(4))).toBe(true);
    expect(durationEquals(QUARTER, EIGHTH)).toBe(false);
    expect(durationEquals(createDuration(4, { dots: 1 }), createDuration(4))).toBe(false);
    expect(
      durationEquals(
        createDuration(4, { tuplet: { actual: 3, normal: 2 } }),
        createDuration(4, { tuplet: { actual: 3, normal: 2 } }),
      ),
    ).toBe(true);
  });
});
