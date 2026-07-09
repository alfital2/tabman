export type LineRole = 'staff' | 'barline' | 'stem' | 'beam' | 'slide';
export type TextRole = 'fret' | 'measureNumber' | 'clef' | 'timeSignature' | 'articulation';
export type RectRole = 'fretBackground';
export type PathRole = 'bend' | 'vibrato' | 'rest';

export interface LinePrimitive {
  readonly kind: 'line';
  readonly role: LineRole;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface TextPrimitive {
  readonly kind: 'text';
  readonly role: TextRole;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontSize: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly baseline: 'auto' | 'middle' | 'hanging';
}

export interface RectPrimitive {
  readonly kind: 'rect';
  readonly role: RectRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EllipsePrimitive {
  readonly kind: 'ellipse';
  readonly role: 'dot';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly filled: boolean;
}

export interface PathPrimitive {
  readonly kind: 'path';
  readonly role: PathRole;
  readonly d: string;
  readonly filled?: boolean;
}

export type Primitive = LinePrimitive | TextPrimitive | RectPrimitive | EllipsePrimitive | PathPrimitive;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BeatPath {
  readonly track: number;
  readonly bar: number;
  readonly voice: number;
  readonly beat: number;
}

export interface BeatBox {
  readonly path: BeatPath;
  readonly rect: Rect;
}

export interface TrackSystem {
  readonly track: number;
  readonly top: number;
  readonly stringYs: readonly number[];
}
