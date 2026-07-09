import { normalizeArticulation, type Articulation } from './articulation';
import { durationToWholes, type Duration } from './duration';
import { addFractions, compareFractions, ZERO, type Fraction } from './fraction';
import { MAX_FRET, STANDARD_GUITAR_TUNING, type Tuning } from './pitch';
import { barCapacityInWholes, FOUR_FOUR, type TimeSignature } from './timeSignature';

export interface Note {
  /** 0 = highest-sounding string. */
  readonly string: number;
  readonly fret: number;
  readonly articulations: readonly Articulation[];
}

export interface Beat {
  readonly duration: Duration;
  /** Empty = this beat is a rest. At most one note per string. */
  readonly notes: readonly Note[];
}

export interface Voice {
  readonly beats: readonly Beat[];
}

export interface Bar {
  readonly timeSignature: TimeSignature;
  readonly voices: readonly Voice[];
}

export interface Track {
  readonly name: string;
  readonly tuning: Tuning;
  readonly bars: readonly Bar[];
}

export interface Score {
  readonly title: string;
  readonly subtitle: string;
  readonly composer: string;
  /** BPM, clamped to MIN_TEMPO..MAX_TEMPO. */
  readonly tempo: number;
  readonly tracks: readonly Track[];
}

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;
export const DEFAULT_TEMPO = 120;

export interface NoteOptions {
  articulations?: readonly Articulation[];
}

export function createNote(string: number, fret: number, options: NoteOptions = {}): Note {
  if (!Number.isSafeInteger(string) || string < 0) {
    throw new RangeError(`string must be a non-negative integer, got ${String(string)}`);
  }
  if (!Number.isSafeInteger(fret) || fret < 0 || fret > MAX_FRET) {
    throw new RangeError(`fret must be an integer 0..${String(MAX_FRET)}, got ${String(fret)}`);
  }
  const { articulations = [] } = options;
  // Normalize each, dedupe by type — last wins.
  const byType = new Map<string, Articulation>();
  for (const raw of articulations) {
    const art = normalizeArticulation(raw);
    byType.set(art.type, art);
  }
  return Object.freeze({ string, fret, articulations: Object.freeze([...byType.values()]) });
}

export function withNoteArticulations(note: Note, articulations: readonly Articulation[]): Note {
  return createNote(note.string, note.fret, { articulations });
}

export function createBeat(duration: Duration, notes: readonly Note[] = []): Beat {
  // At most one note per string — last wins. Kept sorted by string for stable rendering.
  const byString = new Map<number, Note>();
  for (const note of notes) byString.set(note.string, note);
  const sorted = [...byString.values()].sort((a, b) => a.string - b.string);
  return Object.freeze({ duration, notes: Object.freeze(sorted) });
}

export function createRest(duration: Duration): Beat {
  return createBeat(duration, []);
}

export function isRest(beat: Beat): boolean {
  return beat.notes.length === 0;
}

export function beatDurationInWholes(beat: Beat): Fraction {
  return durationToWholes(beat.duration);
}

export function createVoice(beats: readonly Beat[] = []): Voice {
  return Object.freeze({ beats: Object.freeze([...beats]) });
}

export function voiceDurationInWholes(voice: Voice): Fraction {
  return voice.beats.reduce((sum, beat) => addFractions(sum, beatDurationInWholes(beat)), ZERO);
}

export function createBar(timeSignature: TimeSignature, voices: readonly Voice[] = [createVoice()]): Bar {
  if (voices.length === 0) {
    throw new RangeError('a bar needs at least one voice');
  }
  return Object.freeze({ timeSignature, voices: Object.freeze([...voices]) });
}

/** Longest voice's content, in whole notes. */
export function barFilledInWholes(bar: Bar): Fraction {
  return bar.voices.reduce((max, voice) => {
    const len = voiceDurationInWholes(voice);
    return compareFractions(len, max) > 0 ? len : max;
  }, ZERO);
}

export function isBarComplete(bar: Bar): boolean {
  return compareFractions(barFilledInWholes(bar), barCapacityInWholes(bar.timeSignature)) === 0;
}

export function isBarOverfull(bar: Bar): boolean {
  return compareFractions(barFilledInWholes(bar), barCapacityInWholes(bar.timeSignature)) > 0;
}

export function barHasRoomFor(bar: Bar, addedWholes: Fraction): boolean {
  const after = addFractions(barFilledInWholes(bar), addedWholes);
  return compareFractions(after, barCapacityInWholes(bar.timeSignature)) <= 0;
}

export interface TrackOptions {
  name?: string;
  tuning?: Tuning;
  bars?: readonly Bar[];
}

export function createTrack(options: TrackOptions = {}): Track {
  const { name = 'Guitar', tuning = STANDARD_GUITAR_TUNING, bars = [createBar(FOUR_FOUR)] } = options;
  if (tuning.length === 0) {
    throw new RangeError('a tuning needs at least one string');
  }
  if (bars.length === 0) {
    throw new RangeError('a track needs at least one bar');
  }
  return Object.freeze({ name, tuning: Object.freeze([...tuning]), bars: Object.freeze([...bars]) });
}

export function withTrackBars(track: Track, bars: readonly Bar[]): Track {
  return createTrack({ name: track.name, tuning: track.tuning, bars });
}

export interface ScoreOptions {
  title?: string;
  subtitle?: string;
  composer?: string;
  tempo?: number;
  tracks?: readonly Track[];
}

export interface ScoreMetaPatch {
  title?: string;
  subtitle?: string;
  composer?: string;
  tempo?: number;
}

export function clampTempo(tempo: number): number {
  if (!Number.isFinite(tempo)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
}

export function createScore(options: ScoreOptions = {}): Score {
  const { title = '', subtitle = '', composer = '', tempo = DEFAULT_TEMPO, tracks = [createTrack()] } = options;
  if (tracks.length === 0) {
    throw new RangeError('a score needs at least one track');
  }
  return Object.freeze({
    title,
    subtitle,
    composer,
    tempo: clampTempo(tempo),
    tracks: Object.freeze([...tracks]),
  });
}

export function withScoreMeta(score: Score, patch: ScoreMetaPatch): Score {
  return createScore({
    title: patch.title ?? score.title,
    subtitle: patch.subtitle ?? score.subtitle,
    composer: patch.composer ?? score.composer,
    tempo: patch.tempo ?? score.tempo,
    tracks: score.tracks,
  });
}

export function withTracks(score: Score, tracks: readonly Track[]): Score {
  return createScore({
    title: score.title,
    subtitle: score.subtitle,
    composer: score.composer,
    tempo: score.tempo,
    tracks,
  });
}

/** A blank one-track score: 4 empty 4/4 bars, standard tuning, 120 BPM. */
export function createDefaultScore(): Score {
  return createScore({
    title: 'Untitled',
    tracks: [createTrack({ bars: [createBar(FOUR_FOUR), createBar(FOUR_FOUR), createBar(FOUR_FOUR), createBar(FOUR_FOUR)] })],
  });
}
