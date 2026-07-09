import { noteAt, type Cell, type Score } from '@tabkit/core';
import type { Layout } from '@tabkit/render';
import type { SelectionRect } from './gestures';

export function cellKey(cell: Cell): string {
  return `${String(cell.bar)}:${String(cell.beat)}:${String(cell.string)}`;
}

function intersects(a: SelectionRect, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** All note cells inside a marquee rectangle (layout units). */
export function cellsInRect(score: Score, layout: Layout, rect: SelectionRect): Cell[] {
  const cells: Cell[] = [];
  for (const box of layout.beats) {
    if (!intersects(rect, box.rect)) continue;
    const system = layout.systems.find((sys) => {
      const first = sys.stringYs[0] ?? sys.top;
      const last = sys.stringYs[sys.stringYs.length - 1] ?? sys.top;
      return box.rect.y >= first - layout.stringGap * 1.5 && box.rect.y <= last + layout.stringGap * 1.5;
    });
    if (!system) continue;
    system.stringYs.forEach((sy, stringIndex) => {
      const tolerance = layout.stringGap * 0.75;
      if (sy < rect.y - tolerance || sy > rect.y + rect.height + tolerance) return;
      const cell: Cell = { bar: box.path.bar, beat: box.path.beat, string: stringIndex };
      if (noteAt(score, cell)) cells.push(cell);
    });
  }
  return cells;
}
