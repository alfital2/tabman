import type { Bar, Beat } from '@tabkit/core';

export type ClipboardContent =
  | { readonly kind: 'beats'; readonly beats: readonly Beat[] }
  | { readonly kind: 'bar'; readonly bar: Bar };

export function clipboardBeats(beats: readonly Beat[]): ClipboardContent | null {
  return beats.length === 0 ? null : { kind: 'beats', beats };
}

export function clipboardBar(bar: Bar): ClipboardContent {
  return { kind: 'bar', bar };
}
