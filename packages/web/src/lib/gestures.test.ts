import { describe, expect, it } from 'vitest';
import { CLICK_SLOP, resolveGesture, type GestureInput } from './gestures';

const cell = (bar: number, beat: number, string: number) => ({ bar, beat, string });

function input(partial: Partial<GestureInput>): GestureInput {
  return {
    mode: 'marquee',
    startCell: null,
    endCell: null,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    ...partial,
  };
}

describe('resolveGesture', () => {
  it('a near-stationary pointer is a pick regardless of mode', () => {
    for (const mode of ['marquee', 'single', 'group'] as const) {
      const result = resolveGesture(
        input({ mode, startCell: cell(0, 1, 2), endCell: cell(0, 1, 2), end: { x: CLICK_SLOP, y: CLICK_SLOP } }),
      );
      expect(result).toEqual({ kind: 'pick', cell: cell(0, 1, 2) });
    }
  });

  it('a click on empty space is none', () => {
    expect(resolveGesture(input({}))).toEqual({ kind: 'none' });
  });

  it('marquee drag produces a normalized selection rect', () => {
    const result = resolveGesture(input({ start: { x: 50, y: 40 }, end: { x: 10, y: 90 } }));
    expect(result).toEqual({ kind: 'select', rect: { x: 10, y: 40, width: 40, height: 50 } });
  });

  it('single-note vertical drag re-strings; horizontal drag repositions in time', () => {
    const vertical = resolveGesture(
      input({
        mode: 'single',
        startCell: cell(0, 0, 1),
        endCell: cell(0, 0, 3),
        end: { x: 1, y: 25 },
      }),
    );
    expect(vertical).toEqual({ kind: 'moveNote', from: cell(0, 0, 1), toString: 3 });

    const horizontal = resolveGesture(
      input({ mode: 'single', startCell: cell(0, 0, 1), endCell: cell(1, 0, 1), end: { x: 60, y: 2 } }),
    );
    expect(horizontal).toEqual({ kind: 'moveToSlot', from: cell(0, 0, 1), target: cell(1, 0, 1) });

    // a horizontal drag that ends on the note's own slot is a pick, not a no-op
    const samePlace = resolveGesture(
      input({ mode: 'single', startCell: cell(0, 0, 1), endCell: cell(0, 0, 1), end: { x: 8, y: 1 } }),
    );
    expect(samePlace).toEqual({ kind: 'pick', cell: cell(0, 0, 1) });
  });

  it('single drag back to the same string is a pick', () => {
    const result = resolveGesture(
      input({ mode: 'single', startCell: cell(0, 0, 1), endCell: cell(0, 1, 1), end: { x: 2, y: 30 } }),
    );
    expect(result).toEqual({ kind: 'pick', cell: cell(0, 0, 1) });
  });

  it('group vertical drag shifts the selection by strings', () => {
    const result = resolveGesture(
      input({ mode: 'group', startCell: cell(0, 0, 1), endCell: cell(0, 0, 4), end: { x: 0, y: 33 } }),
    );
    expect(result).toEqual({ kind: 'moveSelection', delta: 3 });
  });

  it('group horizontal drag moves the selection to the slot under the pointer', () => {
    const result = resolveGesture(
      input({ mode: 'group', startCell: cell(0, 0, 1), endCell: cell(2, 1, 1), end: { x: 120, y: 4 } }),
    );
    expect(result).toEqual({ kind: 'moveToSlot', from: cell(0, 0, 1), target: cell(2, 1, 1) });
    // within the same bar too
    const withinBar = resolveGesture(
      input({ mode: 'group', startCell: cell(0, 0, 1), endCell: cell(0, 2, 1), end: { x: 60, y: 4 } }),
    );
    expect(withinBar).toEqual({ kind: 'moveToSlot', from: cell(0, 0, 1), target: cell(0, 2, 1) });
  });

  it('a cross-bar drag is a move-in-time even when mostly vertical (another wrapped row)', () => {
    // selection in bar 5, dragged UP to bar 0 on the row above: dy >> dx, but
    // it must move the notes to bar 0, not try to re-string them in place.
    const group = resolveGesture(
      input({ mode: 'group', startCell: cell(5, 2, 4), endCell: cell(0, 1, 2), end: { x: 5, y: -120 } }),
    );
    expect(group).toEqual({ kind: 'moveToSlot', from: cell(5, 2, 4), target: cell(0, 1, 2) });
    const single = resolveGesture(
      input({ mode: 'single', startCell: cell(5, 0, 0), endCell: cell(0, 0, 0), end: { x: 2, y: -140 } }),
    );
    expect(single).toEqual({ kind: 'moveToSlot', from: cell(5, 0, 0), target: cell(0, 0, 0) });
  });

  it('drags ending off the sheet resolve to none (except marquee)', () => {
    expect(
      resolveGesture(input({ mode: 'single', startCell: cell(0, 0, 0), endCell: null, end: { x: 0, y: 50 } })),
    ).toEqual({ kind: 'none' });
    expect(
      resolveGesture(input({ mode: 'group', startCell: cell(0, 0, 0), endCell: null, end: { x: 50, y: 0 } })),
    ).toEqual({ kind: 'none' });
  });
});
