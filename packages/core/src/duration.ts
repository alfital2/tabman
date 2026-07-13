import { fraction, multiplyFractions, type Fraction } from './fraction';

/** 1 = whole, 2 = half, … 64 = sixty-fourth. */
export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export const NOTE_VALUES: readonly NoteValue[] = Object.freeze([1, 2, 4, 8, 16, 32, 64]);

export interface Tuplet {
  /** e.g. a triplet is { actual: 3, normal: 2 }: 3 notes in the time of 2. */
  readonly actual: number;
  readonly normal: number;
}

export interface Duration {
  readonly value: NoteValue;
  readonly dots: 0 | 1 | 2;
  readonly tuplet: Tuplet | null;
}

export interface DurationOptions {
  dots?: number;
  tuplet?: Tuplet | null;
}

export function createDuration(value: NoteValue, options: DurationOptions = {}): Duration {
  const { dots = 0, tuplet = null } = options;
  if (!NOTE_VALUES.includes(value)) {
    throw new RangeError(`invalid note value ${String(value)}`);
  }
  if (dots !== 0 && dots !== 1 && dots !== 2) {
    throw new RangeError(`dots must be 0, 1 or 2, got ${String(dots)}`);
  }
  let frozenTuplet: Tuplet | null = null;
  if (tuplet !== null) {
    if (
      !Number.isSafeInteger(tuplet.actual) ||
      !Number.isSafeInteger(tuplet.normal) ||
      tuplet.actual < 1 ||
      tuplet.normal < 1
    ) {
      throw new RangeError(`invalid tuplet ${JSON.stringify(tuplet)}`);
    }
    frozenTuplet = Object.freeze({ actual: tuplet.actual, normal: tuplet.normal });
  }
  return Object.freeze({ value, dots, tuplet: frozenTuplet });
}

export const WHOLE = createDuration(1);
export const HALF = createDuration(2);
export const QUARTER = createDuration(4);
export const EIGHTH = createDuration(8);
export const SIXTEENTH = createDuration(16);
export const THIRTY_SECOND = createDuration(32);
export const SIXTY_FOURTH = createDuration(64);

/** Fraction of a whole note this duration occupies, dots and tuplet applied. */
export function durationToWholes(d: Duration): Fraction {
  let wholes = fraction(1, d.value);
  if (d.dots > 0) {
    // dotted: base × (2^(dots+1) − 1) / 2^dots
    wholes = multiplyFractions(wholes, fraction(2 ** (d.dots + 1) - 1, 2 ** d.dots));
  }
  if (d.tuplet) {
    wholes = multiplyFractions(wholes, fraction(d.tuplet.normal, d.tuplet.actual));
  }
  return wholes;
}

/**
 * Spell a whole-note fraction as a plain value + dots (no tuplet), or null
 * when no such spelling exists. Reduced fractions make this a lookup: a
 * numerator of 1/3/7 maps to 0/1/2 dots.
 */
export function durationFromWholes(wholes: Fraction): Duration | null {
  const dots = wholes.numerator === 1 ? 0 : wholes.numerator === 3 ? 1 : wholes.numerator === 7 ? 2 : null;
  if (dots === null) return null;
  const value = wholes.denominator / 2 ** dots;
  if (!NOTE_VALUES.includes(value as NoteValue)) return null;
  return createDuration(value as NoteValue, { dots });
}

export function durationEquals(a: Duration, b: Duration): boolean {
  return (
    a.value === b.value &&
    a.dots === b.dots &&
    (a.tuplet === null) === (b.tuplet === null) &&
    (a.tuplet === null || (a.tuplet.actual === b.tuplet!.actual && a.tuplet.normal === b.tuplet!.normal))
  );
}
