import { barAdvanceWholes, fraction, fractionToNumber, compareFractions, unrollBars, type Score } from '@tabkit/core';
import { beatStartSeconds, secondsPerWhole, type PlayFrom } from './schedule';

export interface MetronomeClick {
  readonly timeSec: number;
  /** Downbeats are accented. */
  readonly accent: boolean;
}

const TRACK = 0;

/**
 * One click per time-signature beat, downbeat accented, continuous across
 * bars. Clicks stay on the capacity grid even under underfilled bars.
 */
export function metronomeClicks(score: Score, bpm: number, from?: PlayFrom): MetronomeClick[] {
  const spw = secondsPerWhole(bpm);
  const track = score.tracks[TRACK];
  if (!track) return [];

  const clicks: MetronomeClick[] = [];
  let barStart = 0;
  for (const { barIndex } of unrollBars(track.bars)) {
    const bar = track.bars[barIndex]!;
    const ts = bar.timeSignature;
    const beatSec = spw / ts.denominator;
    const advance = barAdvanceWholes(bar);
    for (let i = 0; i < ts.numerator; i++) {
      // A short bar (pickup) only clicks inside its actual length.
      if (compareFractions(fraction(i, ts.denominator), advance) >= 0) break;
      clicks.push({ timeSec: barStart + i * beatSec, accent: i === 0 });
    }
    barStart += fractionToNumber(advance) * spw;
  }

  if (!from || (from.fromBar === undefined && from.fromBeat === undefined)) {
    return clicks;
  }
  const t0 = beatStartSeconds(score, bpm, from.fromBar ?? 0, from.fromBeat ?? 0);
  const EPS = 1e-9;
  return clicks.filter((c) => c.timeSec >= t0 - EPS).map((c) => ({ ...c, timeSec: c.timeSec - t0 }));
}
