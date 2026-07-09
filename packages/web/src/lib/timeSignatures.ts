import { createTimeSignature, type TimeSignature } from '@tabkit/core';

export interface TimeSignaturePreset {
  readonly label: string;
  readonly value: TimeSignature;
}

export const TIME_SIGNATURE_PRESETS: readonly TimeSignaturePreset[] = [
  { label: '4/4', value: createTimeSignature(4, 4) },
  { label: '3/4', value: createTimeSignature(3, 4) },
  { label: '2/4', value: createTimeSignature(2, 4) },
  { label: '6/8', value: createTimeSignature(6, 8) },
  { label: '5/4', value: createTimeSignature(5, 4) },
  { label: '7/8', value: createTimeSignature(7, 8) },
  { label: '12/8', value: createTimeSignature(12, 8) },
];

/** The shorter list offered in the per-bar context menu. */
export const BAR_TIME_SIGNATURE_PRESETS = TIME_SIGNATURE_PRESETS.slice(0, 5);

export function timeSignatureLabel(ts: TimeSignature): string {
  return `${String(ts.numerator)}/${String(ts.denominator)}`;
}
