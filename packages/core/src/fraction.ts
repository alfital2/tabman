/**
 * Exact rational arithmetic. Every Fraction is stored reduced with a positive
 * denominator, so structural equality works and repeated sums never drift.
 */
export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function fraction(numerator: number, denominator = 1): Fraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new TypeError(`fraction expects integers, got ${numerator}/${denominator}`);
  }
  if (denominator === 0) {
    throw new RangeError('fraction denominator must not be zero');
  }
  if (denominator < 0) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0) {
    return Object.freeze({ numerator: 0, denominator: 1 });
  }
  const d = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / d, denominator: denominator / d });
}

export const ZERO: Fraction = fraction(0, 1);

export function addFractions(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

export function subtractFractions(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
}

export function multiplyFractions(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compareFractions(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const diff = a.numerator * b.denominator - b.numerator * a.denominator;
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function fractionEquals(a: Fraction, b: Fraction): boolean {
  return compareFractions(a, b) === 0;
}

export function fractionToNumber(f: Fraction): number {
  return f.numerator / f.denominator;
}
