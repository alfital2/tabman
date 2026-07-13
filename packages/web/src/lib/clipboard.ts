import type { Bar, BarSegment, Beat } from '@tabkit/core';

export type ClipboardContent =
  | { readonly kind: 'beats'; readonly beats: readonly Beat[] }
  | { readonly kind: 'bar'; readonly bar: Bar }
  | { readonly kind: 'segments'; readonly segments: readonly BarSegment[] };

export function clipboardBeats(beats: readonly Beat[]): ClipboardContent | null {
  return beats.length === 0 ? null : { kind: 'beats', beats };
}

export function clipboardBar(bar: Bar): ClipboardContent {
  return { kind: 'bar', bar };
}

export function clipboardSegments(segments: readonly BarSegment[]): ClipboardContent | null {
  if (segments.length === 0) return null;
  if (segments.length === 1) return clipboardBeats(segments[0]!.beats);
  return { kind: 'segments', segments };
}
