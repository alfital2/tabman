import type { Bar } from './model';

/** One playthrough step: play `barIndex` on repeat pass `pass` (1-based). */
export interface UnrolledBar {
  readonly barIndex: number;
  readonly pass: number;
}

/**
 * Flatten repeat signs and volta brackets into the literal playing order.
 *
 * Rules (graceful on malformed input):
 * - `|:` anchors the region; `:|` with count N jumps back N−1 times.
 * - An unmatched `:|` anchors at the score start / after the previous `:|`.
 * - A bar with endings plays only on the passes it lists — except that
 *   endings with no `:|` anywhere ahead (nothing will ever jump) always play.
 * - Entering a `|:` sequentially (not via jump-back) resets the pass counter.
 * - Output is capped, so pathological flag combinations cannot explode.
 */
export function unrollBars(bars: readonly Bar[]): UnrolledBar[] {
  // Is there a `:|` at-or-after i within the current region (before an
  // unrelated later `|:` takes over)? Used to keep repeat-less endings audible.
  const repeatEndAhead = new Array<boolean>(bars.length).fill(false);
  let seen = false;
  for (let k = bars.length - 1; k >= 0; k--) {
    if (bars[k]!.repeatEnd !== null) seen = true;
    repeatEndAhead[k] = seen;
    if (bars[k]!.repeatStart) seen = false;
  }

  const out: UnrolledBar[] = [];
  const cap = bars.length * 8 + 64;
  let anchor = 0;
  let pass = 1;
  let i = 0;
  let jumped = false;
  while (i < bars.length && out.length < cap) {
    const bar = bars[i]!;
    if (bar.repeatStart) {
      if (!jumped) {
        anchor = i;
        pass = 1;
      }
    }
    jumped = false;

    const skipped = bar.endings.length > 0 && !bar.endings.includes(pass) && (pass > 1 || repeatEndAhead[i] === true);
    if (!skipped) {
      out.push({ barIndex: i, pass });
      if (bar.repeatEnd !== null && pass < bar.repeatEnd) {
        pass += 1;
        i = anchor;
        jumped = true;
        continue;
      }
      if (bar.repeatEnd !== null) {
        pass = 1;
        anchor = i + 1;
      }
    }
    i += 1;
  }
  return out;
}
