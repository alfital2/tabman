import { describe, expect, it } from 'vitest';
import { createBar, type BarOptions } from './model';
import { FOUR_FOUR } from './timeSignature';
import { unrollBars } from './repeats';

function bars(...options: BarOptions[]) {
  return options.map((o) => createBar(FOUR_FOUR, undefined, o));
}

function indices(sequence: readonly { barIndex: number }[]): number[] {
  return sequence.map((e) => e.barIndex);
}

describe('unrollBars', () => {
  it('no repeats → identity, all pass 1', () => {
    const seq = unrollBars(bars({}, {}, {}));
    expect(indices(seq)).toEqual([0, 1, 2]);
    expect(seq.every((e) => e.pass === 1)).toBe(true);
  });

  it('|: A B :| ×2 → A B A B', () => {
    const seq = unrollBars(bars({ repeatStart: true }, { repeatEnd: 2 }, {}));
    expect(indices(seq)).toEqual([0, 1, 0, 1, 2]);
    expect(seq.map((e) => e.pass)).toEqual([1, 1, 2, 2, 1]);
  });

  it('×3 plays three times', () => {
    const seq = unrollBars(bars({ repeatStart: true, repeatEnd: 3 }));
    expect(indices(seq)).toEqual([0, 0, 0]);
  });

  it('unmatched :| anchors at the score start', () => {
    const seq = unrollBars(bars({}, { repeatEnd: 2 }));
    expect(indices(seq)).toEqual([0, 1, 0, 1]);
  });

  it('a second region anchors after the previous repeat end', () => {
    // A :| B :|  → A A B B (second :| repeats only B)
    const seq = unrollBars(bars({ repeatEnd: 2 }, { repeatEnd: 2 }));
    expect(indices(seq)).toEqual([0, 0, 1, 1]);
  });

  it('voltas: |: A B(1. :|) C(2.) D → A B A C D', () => {
    const seq = unrollBars(
      bars({ repeatStart: true }, { repeatEnd: 2, endings: [1] }, { endings: [2] }, {}),
    );
    expect(indices(seq)).toEqual([0, 1, 0, 2, 3]);
    expect(seq[3]!.pass).toBe(2);
  });

  it('an ending shared by two passes plays in both: endings [1,2] with ×3', () => {
    // |: A B(1.2. :|×3) C(3.) → A B A B A C
    const seq = unrollBars(
      bars({ repeatStart: true }, { repeatEnd: 3, endings: [1, 2] }, { endings: [3] }),
    );
    expect(indices(seq)).toEqual([0, 1, 0, 1, 0, 2]);
  });

  it('endings with no repeat anywhere always play', () => {
    const seq = unrollBars(bars({ endings: [2] }, {}));
    expect(indices(seq)).toEqual([0, 1]);
  });

  it('a fresh repeat region after a volta group resets the pass counter', () => {
    // A is |: + ending 1 + :| in one bar: plays pass 1 only, then B (2.),
    // then the C region must still repeat exactly twice.
    const seq = unrollBars(
      bars(
        { repeatStart: true, repeatEnd: 2, endings: [1] },
        { endings: [2] },
        { repeatStart: true, repeatEnd: 2 },
      ),
    );
    expect(indices(seq)).toEqual([0, 1, 2, 2]);
  });

  it('never explodes: pathological flags stay under the safety cap', () => {
    const many = bars(...Array.from({ length: 50 }, () => ({ repeatStart: true, repeatEnd: 8 })));
    const seq = unrollBars(many);
    expect(seq.length).toBeLessThanOrEqual(50 * 8 + 64);
    expect(seq.length).toBeGreaterThan(0);
  });
});
