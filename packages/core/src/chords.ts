import { getArticulation } from './articulation';
import type { Note } from './model';
import { fretToMidi, MAX_FRET, STANDARD_GUITAR_TUNING, type Tuning } from './pitch';

/**
 * A chord voicing: one fret per string in the app's string order
 * (index 0 = highest-sounding string, index 5 = lowest). `null` = muted string.
 */
export interface ChordVoicing {
  readonly frets: readonly (number | null)[];
  /** Lowest fretted (non-open) fret — the diagram window / position label. */
  readonly baseFret: number;
  /** How this voicing is formed: 'open', 'E-shape', 'A-shape'. */
  readonly shape: string;
}

export interface Chord {
  readonly name: string;
  /** Root pitch class 0-11 (C = 0). */
  readonly root: number;
  readonly quality: string;
  readonly voicings: readonly ChordVoicing[];
}

export const ROOT_NAMES: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Low-to-high string tuning (E2 A2 D3 G3 B3 E4) — the order chord charts use.
const TUNING_LOW_TO_HIGH: readonly number[] = [...STANDARD_GUITAR_TUNING].reverse();

interface Quality {
  readonly key: string;
  readonly label: string;
  /** Semitones from the root — for validation and display. */
  readonly intervals: readonly number[];
}

/** Supported qualities, in the order they appear in menus. */
export const CHORD_QUALITIES: readonly Quality[] = [
  { key: 'maj', label: '', intervals: [0, 4, 7] },
  { key: 'm', label: 'm', intervals: [0, 3, 7] },
  { key: '7', label: '7', intervals: [0, 4, 7, 10] },
  { key: 'maj7', label: 'maj7', intervals: [0, 4, 7, 11] },
  { key: 'm7', label: 'm7', intervals: [0, 3, 7, 10] },
  { key: 'sus4', label: 'sus4', intervals: [0, 5, 7] },
  { key: 'sus2', label: 'sus2', intervals: [0, 2, 7] },
  { key: '5', label: '5', intervals: [0, 7] },
  { key: '6', label: '6', intervals: [0, 4, 7, 9] },
  { key: 'm6', label: 'm6', intervals: [0, 3, 7, 9] },
];

const QUALITY_BY_KEY = new Map(CHORD_QUALITIES.map((q) => [q.key, q]));

interface Shape {
  readonly shape: 'E' | 'A';
  /** Root string, low-to-high index (0 = low E, 1 = A). */
  readonly rootIdx: number;
  /** Frets low-to-high [E, A, D, G, B, e], relative to the base fret; null = muted. */
  readonly fretsLo: readonly (number | null)[];
}

/** Movable barre/power shapes per quality (generate a voicing for any root). */
const MOVABLE_SHAPES: Readonly<Record<string, readonly Shape[]>> = {
  maj: [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 2, 1, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 2, 0] },
  ],
  m: [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 2, 0, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 1, 0] },
  ],
  '7': [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 0, 1, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 0, 2, 0] },
  ],
  maj7: [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 1, 1, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 1, 2, 0] },
  ],
  m7: [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 0, 0, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 0, 1, 0] },
  ],
  sus4: [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 2, 2, 0, 0] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 3, 0] },
  ],
  sus2: [{ shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 0, 0] }],
  '5': [
    { shape: 'E', rootIdx: 0, fretsLo: [0, 2, 2, null, null, null] },
    { shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, null, null] },
  ],
  '6': [{ shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 2, 2] }],
  m6: [{ shape: 'A', rootIdx: 1, fretsLo: [null, 0, 2, 2, 1, 2] }],
};

/** Familiar open voicings that aren't E/A barre shapes (C/G/D families). */
const CURATED_OPEN: Readonly<Record<string, readonly (number | null)[][]>> = {
  // low-to-high [E, A, D, G, B, e]
  C: [[null, 3, 2, 0, 1, 0]],
  Cmaj7: [[null, 3, 2, 0, 0, 0]],
  C7: [[null, 3, 2, 3, 1, 0]],
  G: [[3, 2, 0, 0, 0, 3]],
  G7: [[3, 2, 0, 0, 0, 1]],
  Gmaj7: [[3, 2, 0, 0, 0, 2]],
  D: [[null, null, 0, 2, 3, 2]],
  Dm: [[null, null, 0, 2, 3, 1]],
  D7: [[null, null, 0, 2, 1, 2]],
  Dmaj7: [[null, null, 0, 2, 2, 2]],
};

function toOurOrder(fretsLo: readonly (number | null)[]): (number | null)[] {
  // our string i (0 = high e) = low-to-high index 5 - i
  return [0, 1, 2, 3, 4, 5].map((i) => fretsLo[5 - i] ?? null);
}

function baseFretOf(frets: readonly (number | null)[]): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length > 0 ? Math.min(...fretted) : 0;
}

function shapeToVoicing(shape: Shape, rootPc: number): ChordVoicing | null {
  const openClass = ((TUNING_LOW_TO_HIGH[shape.rootIdx]! % 12) + 12) % 12;
  const rootFret = ((rootPc - openClass) % 12 + 12) % 12; // 0..11 on the root string
  let base = rootFret - (shape.fretsLo[shape.rootIdx] ?? 0);
  while (base < 0) base += 12;
  const fretsLo = shape.fretsLo.map((o) => (o === null ? null : o + base));
  if (fretsLo.some((f) => f !== null && (f < 0 || f > MAX_FRET))) return null;
  const frets = toOurOrder(fretsLo);
  return { frets, baseFret: baseFretOf(frets), shape: `${shape.shape}-shape` };
}

function voicingKey(frets: readonly (number | null)[]): string {
  return frets.map((f) => (f === null ? 'x' : String(f))).join(',');
}

// ---------------------------------------------------------------------------
// Names & parsing

export function chordName(root: number, qualityKey: string): string {
  const q = QUALITY_BY_KEY.get(qualityKey);
  return `${ROOT_NAMES[((root % 12) + 12) % 12]!}${q ? q.label : ''}`;
}

const FLAT_TO_SHARP: Readonly<Record<string, number>> = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 };

/** Parse "C", "Am", "G7", "F#maj7", "Bbm7", "C5" → root pitch class + quality key. */
export function parseChordName(input: string): { root: number; quality: string } | null {
  const s = input.trim();
  const m = /^([A-Ga-g])([#b♯♭]?)(.*)$/.exec(s);
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  const accidental = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2] ?? '';
  const suffixRaw = (m[3] ?? '').trim();

  const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let root = LETTER_PC[letter]!;
  if (accidental === '#') root = (root + 1) % 12;
  else if (accidental === 'b') {
    const flatName = `${letter}b`;
    root = FLAT_TO_SHARP[flatName] ?? (root + 11) % 12;
  }

  // Normalize common suffix spellings, then match the longest quality label.
  const suffix = suffixRaw
    .replace(/^min/i, 'm')
    .replace(/^major7|^maj7|^M7/, 'maj7')
    .replace(/^major$/i, '')
    .replace(/^dom7$/i, '7')
    .replace(/^sus$/i, 'sus4');

  const byLabel = [...CHORD_QUALITIES].sort((a, b) => b.label.length - a.label.length);
  for (const q of byLabel) {
    if (q.label === '' ? suffix === '' : suffix.toLowerCase() === q.label.toLowerCase()) {
      return { root, quality: q.key };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API

export function getChord(name: string): Chord | null {
  const parsed = parseChordName(name);
  if (!parsed) return null;
  const { root, quality } = parsed;
  const canonical = chordName(root, quality);

  const voicings: ChordVoicing[] = [];
  const seen = new Set<string>();
  const add = (v: ChordVoicing | null) => {
    if (!v) return;
    const key = voicingKey(v.frets);
    if (seen.has(key)) return;
    seen.add(key);
    voicings.push(v);
  };

  for (const raw of CURATED_OPEN[canonical] ?? []) {
    const frets = toOurOrder(raw);
    add({ frets, baseFret: baseFretOf(frets), shape: 'open' });
  }
  for (const shape of MOVABLE_SHAPES[quality] ?? []) {
    add(shapeToVoicing(shape, root));
  }
  if (voicings.length === 0) return null;

  voicings.sort((a, b) => {
    if (a.shape === 'open' && b.shape !== 'open') return -1;
    if (b.shape === 'open' && a.shape !== 'open') return 1;
    return a.baseFret - b.baseFret;
  });
  return { name: canonical, root, quality, voicings };
}

/** Every chord name that has at least one voicing, roots C→B. */
export function listChordNames(): string[] {
  const names: string[] = [];
  for (let root = 0; root < 12; root++) {
    for (const q of CHORD_QUALITIES) {
      const name = chordName(root, q.key);
      if (getChord(name)) names.push(name);
    }
  }
  return names;
}

let cachedNames: string[] | null = null;
function allNames(): string[] {
  return (cachedNames ??= listChordNames());
}

/** Filter chord names by a free-text query ("am", "g7", "fmaj7", "c#"). */
export function searchChords(query: string): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const names = allNames();
  if (q === '') return names;
  const parsed = parseChordName(query);
  const exact = parsed ? chordName(parsed.root, parsed.quality) : null;
  const norm = (n: string) => n.toLowerCase();
  const starts = names.filter((n) => norm(n).startsWith(q));
  const contains = names.filter((n) => !norm(n).startsWith(q) && norm(n).includes(q));
  const ordered = [...starts, ...contains];
  if (exact && ordered.includes(exact)) {
    return [exact, ...ordered.filter((n) => n !== exact)];
  }
  return ordered;
}

/** Pitch classes a voicing actually sounds (for validation / display). */
export function voicingPitchClasses(voicing: ChordVoicing): number[] {
  const out: number[] = [];
  voicing.frets.forEach((fret, string) => {
    if (fret === null) return;
    const open = STANDARD_GUITAR_TUNING[string];
    if (open === undefined) return;
    out.push(((open + fret) % 12 + 12) % 12);
  });
  return out;
}

export function chordIntervals(qualityKey: string): readonly number[] {
  return QUALITY_BY_KEY.get(qualityKey)?.intervals ?? [];
}

// ---------------------------------------------------------------------------
// Recognition (frets → name)

function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

/**
 * Name the chord a beat's notes sound, or `null` when they don't form a
 * supported chord. Derived live from the notes — nothing is stored.
 *
 * The lowest-sounding note is tried as the root first, so root-position
 * voicings name naturally; an inversion falls through to its true root (named
 * without slash notation). Only exact pitch-class-set matches against
 * {@link CHORD_QUALITIES} count — a stack with extra or missing tones is
 * left unnamed. Muted (dead) strings carry no pitch and are ignored.
 */
export function recognizeChord(notes: readonly Note[], tuning: Tuning): string | null {
  const midis: number[] = [];
  for (const note of notes) {
    if (getArticulation(note.articulations, 'dead') !== undefined) continue;
    if (tuning[note.string] === undefined) continue;
    midis.push(fretToMidi(tuning, note.string, note.fret));
  }
  if (midis.length < 2) return null;

  const pc = (n: number) => ((n % 12) + 12) % 12;
  const bass = pc(Math.min(...midis));
  const classes = new Set(midis.map(pc));
  if (classes.size < 2) return null;

  // Bass first (root position), then remaining classes low→high.
  const roots = [bass, ...[...classes].filter((c) => c !== bass).sort((a, b) => a - b)];
  for (const root of roots) {
    const intervals = new Set([...classes].map((c) => pc(c - root)));
    for (const q of CHORD_QUALITIES) {
      if (setsEqual(new Set(q.intervals), intervals)) {
        return chordName(root, q.key);
      }
    }
  }
  return null;
}
