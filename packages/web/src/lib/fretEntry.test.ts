import { describe, expect, it } from 'vitest';
import { combineTypedFret, DIGIT_COMBINE_MS } from './fretEntry';

describe('combineTypedFret', () => {
  it('a first digit is the fret', () => {
    const result = combineTypedFret(null, 7, 'a', 1000);
    expect(result.fret).toBe(7);
  });

  it('two digits on the same cell inside the window combine', () => {
    const first = combineTypedFret(null, 1, 'a', 1000);
    const second = combineTypedFret(first.next, 2, 'a', 1000 + DIGIT_COMBINE_MS);
    expect(second.fret).toBe(12);
  });

  it('combining stops past 24', () => {
    const first = combineTypedFret(null, 9, 'a', 1000);
    const second = combineTypedFret(first.next, 9, 'a', 1100);
    expect(second.fret).toBe(9); // 99 > 24 → start over with 9
  });

  it('24 is reachable, 25 is not', () => {
    const a = combineTypedFret(null, 2, 'a', 0);
    expect(combineTypedFret(a.next, 4, 'a', 100).fret).toBe(24);
    const b = combineTypedFret(null, 2, 'a', 0);
    expect(combineTypedFret(b.next, 5, 'a', 100).fret).toBe(5);
  });

  it('a third digit starts a new fret', () => {
    const a = combineTypedFret(null, 1, 'a', 0);
    const b = combineTypedFret(a.next, 2, 'a', 100);
    const c = combineTypedFret(b.next, 1, 'a', 200);
    expect(c.fret).toBe(1);
  });

  it('the window expiring or the cell changing resets the combine', () => {
    const a = combineTypedFret(null, 1, 'a', 0);
    expect(combineTypedFret(a.next, 2, 'a', DIGIT_COMBINE_MS + 1).fret).toBe(2);
    const b = combineTypedFret(null, 1, 'a', 0);
    expect(combineTypedFret(b.next, 2, 'other-cell', 100).fret).toBe(2);
  });
});
