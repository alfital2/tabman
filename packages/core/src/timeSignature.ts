import { fraction, type Fraction } from './fraction';

export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: number;
}

const VALID_DENOMINATORS = new Set([1, 2, 4, 8, 16, 32, 64]);

export function createTimeSignature(numerator: number, denominator: number): TimeSignature {
  if (!Number.isSafeInteger(numerator) || numerator < 1 || numerator > 64) {
    throw new RangeError(`time signature numerator must be an integer 1..64, got ${String(numerator)}`);
  }
  if (!VALID_DENOMINATORS.has(denominator)) {
    throw new RangeError(`time signature denominator must be a power of two 1..64, got ${String(denominator)}`);
  }
  return Object.freeze({ numerator, denominator });
}

export const FOUR_FOUR = createTimeSignature(4, 4);

export function barCapacityInWholes(ts: TimeSignature): Fraction {
  return fraction(ts.numerator, ts.denominator);
}

export function timeSignatureEquals(a: TimeSignature, b: TimeSignature): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}
