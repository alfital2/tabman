/** Layout units — the SVG is scaled by the consumer. */
export interface Metrics {
  readonly marginX: number;
  readonly marginTop: number;
  readonly clefWidth: number;
  readonly staffLineGap: number;
  readonly systemGap: number;
  readonly beatWidth: number;
  readonly barStartPad: number;
  readonly barEndPad: number;
  readonly fretFontSize: number;
  readonly measureNumberFontSize: number;
}

export const DEFAULT_METRICS: Metrics = Object.freeze({
  marginX: 12,
  marginTop: 18,
  clefWidth: 24,
  staffLineGap: 11,
  systemGap: 52,
  beatWidth: 28,
  barStartPad: 10,
  barEndPad: 6,
  fretFontSize: 9,
  measureNumberFontSize: 9,
});

// Derived constants shared by the layout passes.
export const TIME_SIGNATURE_WIDTH = 16;
export const STEM_DROP = 16;
export const BEAM_SPACING = 3;
export const ARTICULATION_FONT_SIZE = 8;
export const MARGIN_BOTTOM = 24;
