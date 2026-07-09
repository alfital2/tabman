import type { Layout } from './layout';

export interface HitCell {
  readonly bar: number;
  readonly beat: number;
  readonly string: number;
}

/**
 * Map a point (in layout units) to the cursor cell it lands on, or null when
 * it misses every slot. The string is the nearest staff line of the system the
 * point falls in.
 */
export function hitTest(layout: Layout, x: number, y: number): HitCell | null {
  const slot = layout.slots.find(
    (box) => x >= box.rect.x && x <= box.rect.x + box.rect.width && y >= box.rect.y && y <= box.rect.y + box.rect.height,
  );
  if (!slot) return null;

  // Find the system this slot belongs to by vertical containment.
  const pad = layout.stringGap;
  const system = layout.systems.find((sys) => {
    const first = sys.stringYs[0] ?? sys.top;
    const last = sys.stringYs[sys.stringYs.length - 1] ?? sys.top;
    return y >= first - pad && y <= last + pad;
  });
  if (!system || system.stringYs.length === 0) return null;

  let best = 0;
  let bestDist = Infinity;
  system.stringYs.forEach((sy, i) => {
    const d = Math.abs(sy - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return { bar: slot.path.bar, beat: slot.path.beat, string: best };
}
