import type { HitCell } from '@tabkit/render';

/** Layout units a pointer may travel and still count as a click. */
export const CLICK_SLOP = 3;

export type GestureMode = 'marquee' | 'single' | 'group';

export interface GestureInput {
  readonly mode: GestureMode;
  readonly startCell: HitCell | null;
  readonly endCell: HitCell | null;
  readonly start: { x: number; y: number };
  readonly end: { x: number; y: number };
}

export interface SelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type GestureResult =
  | { kind: 'pick'; cell: HitCell }
  | { kind: 'select'; rect: SelectionRect }
  | { kind: 'moveNote'; from: HitCell; toString: number }
  | { kind: 'moveSelection'; delta: number }
  | { kind: 'moveToSlot'; from: HitCell; target: HitCell }
  | { kind: 'none' };

export function normalizedRect(a: { x: number; y: number }, b: { x: number; y: number }): SelectionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Decide what a completed pointer gesture means. Pure so every branch is
 * testable without a DOM:
 * - marquee (down on empty space): drag = selection box, near-stationary = pick
 * - single (down on an unselected note): vertical drag = re-string, horizontal
 *   drag = move the note in time to the slot under the pointer, click = pick
 * - group (down on a selected note): vertical drag = shift selection by strings,
 *   horizontal drag = move the selection to the slot under the pointer
 */
export function resolveGesture(input: GestureInput): GestureResult {
  const dx = input.end.x - input.start.x;
  const dy = input.end.y - input.start.y;
  const isClick = Math.abs(dx) <= CLICK_SLOP && Math.abs(dy) <= CLICK_SLOP;

  if (isClick) {
    const cell = input.endCell ?? input.startCell;
    return cell ? { kind: 'pick', cell } : { kind: 'none' };
  }

  if (input.mode === 'marquee') {
    return { kind: 'select', rect: normalizedRect(input.start, input.end) };
  }

  if (!input.startCell || !input.endCell) return { kind: 'none' };

  if (Math.abs(dy) >= Math.abs(dx)) {
    // Vertical: re-string.
    if (input.mode === 'single') {
      if (input.endCell.string === input.startCell.string) return { kind: 'pick', cell: input.startCell };
      return { kind: 'moveNote', from: input.startCell, toString: input.endCell.string };
    }
    const delta = input.endCell.string - input.startCell.string;
    return delta === 0 ? { kind: 'none' } : { kind: 'moveSelection', delta };
  }

  // Horizontal: reposition in time onto the slot under the pointer. A drag that
  // ends on the note's own slot is just a pick, not a silent no-op.
  if (input.endCell.bar === input.startCell.bar && input.endCell.beat === input.startCell.beat) {
    return { kind: 'pick', cell: input.startCell };
  }
  return { kind: 'moveToSlot', from: input.startCell, target: input.endCell };
}
