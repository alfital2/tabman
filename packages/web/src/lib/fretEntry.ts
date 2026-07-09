export const DIGIT_COMBINE_MS = 900;
export const MAX_TYPED_FRET = 24;

export interface TypedFretState {
  readonly cellKey: string;
  readonly lastDigit: number;
  readonly at: number;
  /** Two digits already combined — a third starts over. */
  readonly combined: boolean;
}

export interface TypedFretResult {
  readonly fret: number;
  readonly next: TypedFretState;
}

/**
 * Combine consecutive typed digits into one fret: `1` then `2` on the same
 * cell within DIGIT_COMBINE_MS becomes 12. Pure so React StrictMode's
 * double-invoke can't double-apply the combine.
 */
export function combineTypedFret(
  prev: TypedFretState | null,
  digit: number,
  cellKey: string,
  now: number,
): TypedFretResult {
  if (prev && prev.cellKey === cellKey && !prev.combined && now - prev.at <= DIGIT_COMBINE_MS) {
    const candidate = prev.lastDigit * 10 + digit;
    if (candidate <= MAX_TYPED_FRET) {
      return { fret: candidate, next: { cellKey, lastDigit: digit, at: now, combined: true } };
    }
  }
  return { fret: digit, next: { cellKey, lastDigit: digit, at: now, combined: false } };
}
