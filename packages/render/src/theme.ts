import type { LineRole, PathRole, TextRole } from './primitives';

export interface Theme {
  readonly background: string;
  readonly staff: string;
  readonly barline: string;
  readonly stem: string;
  readonly beam: string;
  readonly slide: string;
  readonly fret: string;
  readonly fretBackground: string;
  readonly measureNumber: string;
  readonly chordName: string;
  readonly clef: string;
  readonly timeSignature: string;
  readonly articulation: string;
  readonly dot: string;
  readonly monoFontFamily: string;
  readonly serifFontFamily: string;
  readonly chordNameFontFamily: string;
}

export const DEFAULT_THEME: Theme = Object.freeze({
  background: '#ffffff',
  staff: '#565b66',
  barline: '#3c414c',
  stem: '#464b56',
  beam: '#464b56',
  slide: '#2f6bff',
  fret: '#15171c',
  fretBackground: '#ffffff',
  measureNumber: '#c0392b',
  chordName: '#1f4bd8',
  clef: '#9095a0',
  timeSignature: '#2b2f38',
  articulation: '#2f6bff',
  dot: '#464b56',
  monoFontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
  serifFontFamily: "'Georgia', 'Times New Roman', serif",
  // Elegant humanist letterforms for chord symbols, with graceful fallbacks.
  chordNameFontFamily: "'Optima', 'Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Segoe UI', sans-serif",
});

export interface LineStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface TextStyle {
  readonly fill: string;
  readonly fontFamily: string;
  readonly fontWeight: 'normal' | 'bold';
}

export interface FillStrokeStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** Single source of truth: the DOM renderer and the SVG exporter share these. */
export function lineStyle(theme: Theme, role: LineRole): LineStyle {
  switch (role) {
    case 'staff':
      return { stroke: theme.staff, strokeWidth: 0.6 };
    case 'barline':
      return { stroke: theme.barline, strokeWidth: 1 };
    case 'stem':
      return { stroke: theme.stem, strokeWidth: 0.8 };
    case 'beam':
      return { stroke: theme.beam, strokeWidth: 1.8 };
    case 'slide':
      return { stroke: theme.slide, strokeWidth: 1 };
  }
}

export function textStyle(theme: Theme, role: TextRole): TextStyle {
  switch (role) {
    case 'fret':
      return { fill: theme.fret, fontFamily: theme.monoFontFamily, fontWeight: 'normal' };
    case 'measureNumber':
      return { fill: theme.measureNumber, fontFamily: theme.monoFontFamily, fontWeight: 'normal' };
    case 'chordName':
      return { fill: theme.chordName, fontFamily: theme.chordNameFontFamily, fontWeight: 'bold' };
    case 'clef':
      return { fill: theme.clef, fontFamily: theme.serifFontFamily, fontWeight: 'bold' };
    case 'timeSignature':
      return { fill: theme.timeSignature, fontFamily: theme.serifFontFamily, fontWeight: 'bold' };
    case 'articulation':
      return { fill: theme.articulation, fontFamily: theme.monoFontFamily, fontWeight: 'normal' };
  }
}

export function ellipseStyle(theme: Theme, filled: boolean): FillStrokeStyle {
  return filled
    ? { fill: theme.dot, stroke: 'none', strokeWidth: 0 }
    : { fill: 'none', stroke: theme.dot, strokeWidth: 0.8 };
}

export function pathStyle(theme: Theme, role: PathRole, filled: boolean | undefined): FillStrokeStyle {
  if (role === 'rest') {
    return filled
      ? { fill: theme.clef, stroke: 'none', strokeWidth: 0 }
      : { fill: 'none', stroke: theme.clef, strokeWidth: 1.3 };
  }
  const color = theme.articulation;
  if (role === 'bend' && filled) {
    return { fill: color, stroke: 'none', strokeWidth: 0 };
  }
  return { fill: 'none', stroke: color, strokeWidth: role === 'bend' ? 1 : 0.9 };
}
