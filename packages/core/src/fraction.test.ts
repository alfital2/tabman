import { describe, expect, it } from 'vitest';
import {
  addFractions,
  compareFractions,
  fraction,
  fractionEquals,
  fractionToNumber,
  multiplyFractions,
  subtractFractions,
} from './fraction';

describe('fraction', () => {
  it('reduces to lowest terms', () => {
    expect(fraction(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(fraction(6, 8)).toEqual({ numerator: 3, denominator: 4 });
  });

  it('normalizes sign into the numerator', () => {
    expect(fraction(1, -2)).toEqual({ numerator: -1, denominator: 2 });
    expect(fraction(-1, -2)).toEqual({ numerator: 1, denominator: 2 });
  });

  it('normalizes zero', () => {
    expect(fraction(0, 7)).toEqual({ numerator: 0, denominator: 1 });
  });

  it('rejects zero denominators and non-integers', () => {
    expect(() => fraction(1, 0)).toThrow(RangeError);
    expect(() => fraction(0.5, 1)).toThrow(TypeError);
  });

  it('adds and subtracts exactly', () => {
    // 1/4 + 1/8 + 1/8 + 1/2 = 1 — no float drift
    let sum = fraction(1, 4);
    sum = addFractions(sum, fraction(1, 8));
    sum = addFractions(sum, fraction(1, 8));
    sum = addFractions(sum, fraction(1, 2));
    expect(sum).toEqual({ numerator: 1, denominator: 1 });
    expect(subtractFractions(sum, fraction(1, 1))).toEqual({ numerator: 0, denominator: 1 });
  });

  it('sums repeating triplets exactly', () => {
    // 12 triplet-eighths (1/12 each) = exactly one whole
    let sum = fraction(0);
    for (let i = 0; i < 12; i++) sum = addFractions(sum, fraction(1, 12));
    expect(fractionEquals(sum, fraction(1))).toBe(true);
  });

  it('multiplies and compares', () => {
    expect(multiplyFractions(fraction(3, 4), fraction(2, 3))).toEqual({ numerator: 1, denominator: 2 });
    expect(compareFractions(fraction(1, 3), fraction(1, 2))).toBe(-1);
    expect(compareFractions(fraction(2, 4), fraction(1, 2))).toBe(0);
    expect(compareFractions(fraction(3, 4), fraction(1, 2))).toBe(1);
    expect(fractionToNumber(fraction(1, 4))).toBe(0.25);
  });
});
