import { articulationsEqual, getArticulation, withArticulation, withoutArticulationType, type Articulation } from './articulation';
import { durationEquals, durationToWholes, QUARTER, type Duration } from './duration';
import { addFractions, compareFractions, subtractFractions, ZERO, type Fraction } from './fraction';
import { restringFret, MAX_FRET } from './pitch';
import { barCapacityInWholes, timeSignatureEquals, FOUR_FOUR, type TimeSignature } from './timeSignature';
import {
  barFilledInWholes,
  beatDurationInWholes,
  createBar,
  createBeat,
  createNote,
  createVoice,
  isBarOverfull,
  isRest,
  withScoreMeta,
  withTrackBars,
  withTracks,
  type Bar,
  type Beat,
  type Note,
  type Score,
  type ScoreMetaPatch,
  type Track,
} from './model';

/** `beat === beats.length` addresses the bar's append slot. */
export interface Cursor {
  readonly bar: number;
  readonly beat: number;
  readonly string: number;
}

/** A note cell — same shape as the cursor. */
export interface Cell {
  readonly bar: number;
  readonly beat: number;
  readonly string: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface EditorState {
  readonly score: Score;
  readonly cursor: Cursor;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** @internal history stacks */
  readonly past: readonly Score[];
  /** @internal */
  readonly future: readonly Score[];
}

export const MAX_HISTORY = 200;

// v1: all editing targets track 0, voice 0. The model supports more.
const TRACK = 0;
const VOICE = 0;

function track0(score: Score): Track {
  return score.tracks[TRACK]!;
}

function voiceBeats(bar: Bar): readonly Beat[] {
  return bar.voices[VOICE]!.beats;
}

function withVoiceBeats(bar: Bar, beats: readonly Beat[]): Bar {
  const voices = bar.voices.map((v, i) => (i === VOICE ? createVoice(beats) : v));
  return createBar(bar.timeSignature, voices);
}

function withBars(score: Score, bars: readonly Bar[]): Score {
  const tracks = score.tracks.map((t, i) => (i === TRACK ? withTrackBars(t, bars) : t));
  return withTracks(score, tracks);
}

function clampInt(value: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(value) ? value : min);
  return Math.min(max, Math.max(min, v));
}

/** Does this bar still accept a cursor "append" position? */
function hasOpenAppendSlot(bar: Bar): boolean {
  return compareFractions(barFilledInWholes(bar), barCapacityInWholes(bar.timeSignature)) < 0;
}

/** Highest legal cursor beat index in a bar (append slot when the bar has room). */
export function maxCursorBeat(bar: Bar): number {
  const len = voiceBeats(bar).length;
  return hasOpenAppendSlot(bar) ? len : Math.max(0, len - 1);
}

export function clampCursor(score: Score, cursor: Cursor): Cursor {
  const track = track0(score);
  const barIndex = clampInt(cursor.bar, 0, track.bars.length - 1);
  const bar = track.bars[barIndex]!;
  return {
    bar: barIndex,
    beat: clampInt(cursor.beat, 0, maxCursorBeat(bar)),
    string: clampInt(cursor.string, 0, track.tuning.length - 1),
  };
}

export function createEditor(score: Score): EditorState {
  return {
    score,
    cursor: clampCursor(score, { bar: 0, beat: 0, string: 0 }),
    canUndo: false,
    canRedo: false,
    past: [],
    future: [],
  };
}

function commit(state: EditorState, score: Score, cursor: Cursor = state.cursor): EditorState {
  if (score === state.score) {
    return state;
  }
  const past = [...state.past, state.score].slice(-MAX_HISTORY);
  return { score, cursor: clampCursor(score, cursor), canUndo: true, canRedo: false, past, future: [] };
}

export function beatAt(score: Score, barIndex: number, beatIndex: number): Beat | undefined {
  const bar = track0(score).bars[barIndex];
  return bar ? voiceBeats(bar)[beatIndex] : undefined;
}

export function noteAt(score: Score, cell: Cell): Note | undefined {
  return beatAt(score, cell.bar, cell.beat)?.notes.find((n) => n.string === cell.string);
}

// ---------------------------------------------------------------------------
// Note entry

/**
 * Write (or replace) a fret at the cursor. A new beat is created at the append
 * slot using the brush duration and auto-flows into (or creates) the next bar
 * when the current bar has no room. A note bigger than an empty bar's capacity
 * is still placed (the bar goes overfull) so entry can never dead-end.
 */
export function setFretAtCursor(state: EditorState, fret: number, brush: Duration = QUARTER): EditorState {
  const clampedFret = clampInt(fret, 0, MAX_FRET);
  const cursor = clampCursor(state.score, state.cursor);
  const bars = track0(state.score).bars;
  const bar = bars[cursor.bar]!;
  const beats = voiceBeats(bar);

  const existing = beats[cursor.beat];
  if (existing) {
    const prevNote = existing.notes.find((n) => n.string === cursor.string);
    if (prevNote && prevNote.fret === clampedFret) {
      return { ...state, cursor };
    }
    const note = createNote(cursor.string, clampedFret, {
      articulations: prevNote ? prevNote.articulations : [],
    });
    const newBeat = createBeat(existing.duration, [...existing.notes.filter((n) => n.string !== cursor.string), note]);
    const newBars = bars.map((b, i) =>
      i === cursor.bar ? withVoiceBeats(b, beats.map((bt, j) => (j === cursor.beat ? newBeat : bt))) : b,
    );
    return commit(state, withBars(state.score, newBars), cursor);
  }

  // Append slot: find the bar the new beat lands in (auto-flow).
  const wholes = durationToWholes(brush);
  const newBeat = createBeat(brush, [createNote(cursor.string, clampedFret)]);
  const newBars = [...bars];
  let target = cursor.bar;
  for (;;) {
    const candidate = newBars[target];
    if (candidate === undefined) {
      const ts = newBars[newBars.length - 1]?.timeSignature ?? FOUR_FOUR;
      newBars.push(createBar(ts));
      continue;
    }
    if (barHasRoom(candidate, wholes) || voiceBeats(candidate).length === 0) {
      break;
    }
    target += 1;
  }
  const targetBar = newBars[target]!;
  const targetBeatIndex = voiceBeats(targetBar).length;
  newBars[target] = withVoiceBeats(targetBar, [...voiceBeats(targetBar), newBeat]);
  return commit(state, withBars(state.score, newBars), { bar: target, beat: targetBeatIndex, string: cursor.string });
}

function barHasRoom(bar: Bar, addedWholes: Fraction): boolean {
  const after = addFractions(barFilledInWholes(bar), addedWholes);
  return compareFractions(after, barCapacityInWholes(bar.timeSignature)) <= 0;
}

/**
 * Write a whole chord voicing at the cursor: one note per non-null string,
 * replacing whatever the beat held. Uses the cursor beat if present, else
 * appends a new beat at the brush duration (auto-flowing into the next bar).
 */
export function setChordAtCursor(state: EditorState, frets: readonly (number | null)[], brush: Duration = QUARTER): EditorState {
  const cursor = clampCursor(state.score, state.cursor);
  const stringCount = track0(state.score).tuning.length;
  const notes: Note[] = [];
  frets.forEach((fret, string) => {
    if (fret === null || string >= stringCount) return;
    notes.push(createNote(string, clampInt(fret, 0, MAX_FRET)));
  });
  if (notes.length === 0) return state;

  const bars = track0(state.score).bars;
  const bar = bars[cursor.bar]!;
  const beats = voiceBeats(bar);
  const existing = beats[cursor.beat];

  if (existing) {
    const newBeat = createBeat(existing.duration, notes);
    const newBars = bars.map((b, i) =>
      i === cursor.bar ? withVoiceBeats(b, beats.map((bt, j) => (j === cursor.beat ? newBeat : bt))) : b,
    );
    return commit(state, withBars(state.score, newBars), cursor);
  }

  const wholes = durationToWholes(brush);
  const newBeat = createBeat(brush, notes);
  const newBars = [...bars];
  let target = cursor.bar;
  for (;;) {
    const candidate = newBars[target];
    if (candidate === undefined) {
      const ts = newBars[newBars.length - 1]?.timeSignature ?? FOUR_FOUR;
      newBars.push(createBar(ts));
      continue;
    }
    if (barHasRoom(candidate, wholes) || voiceBeats(candidate).length === 0) break;
    target += 1;
  }
  const targetBar = newBars[target]!;
  const targetBeatIndex = voiceBeats(targetBar).length;
  newBars[target] = withVoiceBeats(targetBar, [...voiceBeats(targetBar), newBeat]);
  return commit(state, withBars(state.score, newBars), { bar: target, beat: targetBeatIndex, string: cursor.string });
}

export function setDurationAtCursor(state: EditorState, duration: Duration): EditorState {
  const cursor = clampCursor(state.score, state.cursor);
  return setBeatsDuration(state, [cursor], duration);
}

/** Set the duration on every (bar, beat) referenced by the cells. */
export function setBeatsDuration(state: EditorState, cells: readonly Cell[], duration: Duration): EditorState {
  return updateBeatsDuration(state, cells, () => duration);
}

/** Rewrite each targeted beat's duration through `update` (notes preserved). */
export function updateBeatsDuration(
  state: EditorState,
  cells: readonly Cell[],
  update: (duration: Duration) => Duration,
): EditorState {
  const targets = uniqueBeatRefs(cells);
  const bars = track0(state.score).bars;
  let changed = false;
  const newBars = [...bars];
  for (const { bar: barIndex, beat: beatIndex } of targets) {
    const bar = newBars[barIndex];
    if (!bar) continue;
    const beats = voiceBeats(bar);
    const beat = beats[beatIndex];
    if (!beat) continue;
    const duration = update(beat.duration);
    if (durationEquals(beat.duration, duration)) continue;
    changed = true;
    newBars[barIndex] = withVoiceBeats(
      bar,
      voiceBeats(newBars[barIndex]!).map((bt, j) => (j === beatIndex ? createBeat(duration, bt.notes) : bt)),
    );
  }
  if (!changed) return state;
  return commit(state, withBars(state.score, newBars));
}

/**
 * Remove the note under the cursor. Clearing an already-empty beat (a rest)
 * removes the beat itself, so repeated Backspace tightens the bar.
 */
export function clearAtCursor(state: EditorState): EditorState {
  const cursor = clampCursor(state.score, state.cursor);
  const bars = track0(state.score).bars;
  const bar = bars[cursor.bar]!;
  const beats = voiceBeats(bar);
  const beat = beats[cursor.beat];
  if (!beat) return state;

  if (beat.notes.some((n) => n.string === cursor.string)) {
    const newBeat = createBeat(beat.duration, beat.notes.filter((n) => n.string !== cursor.string));
    const newBars = bars.map((b, i) =>
      i === cursor.bar ? withVoiceBeats(b, beats.map((bt, j) => (j === cursor.beat ? newBeat : bt))) : b,
    );
    return commit(state, withBars(state.score, newBars), cursor);
  }
  if (isRest(beat)) {
    const newBars = bars.map((b, i) =>
      i === cursor.bar ? withVoiceBeats(b, beats.filter((_, j) => j !== cursor.beat)) : b,
    );
    return commit(state, withBars(state.score, newBars), cursor);
  }
  return state;
}

/**
 * Toggle an articulation across the targeted notes. When every targeted note
 * already carries this exact variant it is removed everywhere; otherwise it is
 * set everywhere (replacing any other variant of the same type).
 */
export function toggleArticulation(state: EditorState, cells: readonly Cell[], articulation: Articulation): EditorState {
  const targets = cells.filter((cell) => noteAt(state.score, cell) !== undefined);
  if (targets.length === 0) return state;

  const everyHasExact = targets.every((cell) => {
    const existing = getArticulation(noteAt(state.score, cell)!.articulations, articulation.type);
    return existing !== undefined && articulationsEqual(existing, articulation);
  });

  const bars = track0(state.score).bars;
  const newBars = [...bars];
  for (const cell of targets) {
    const bar = newBars[cell.bar];
    if (!bar) continue;
    const beats = voiceBeats(bar);
    const beat = beats[cell.beat];
    if (!beat) continue;
    const note = beat.notes.find((n) => n.string === cell.string);
    if (!note) continue;
    const arts = everyHasExact
      ? withoutArticulationType(note.articulations, articulation.type)
      : withArticulation(note.articulations, articulation);
    const newNote = createNote(note.string, note.fret, { articulations: arts });
    const newBeat = createBeat(beat.duration, [...beat.notes.filter((n) => n.string !== cell.string), newNote]);
    newBars[cell.bar] = withVoiceBeats(bar, beats.map((bt, j) => (j === cell.beat ? newBeat : bt)));
  }
  return commit(state, withBars(state.score, newBars));
}

// ---------------------------------------------------------------------------
// Cursor movement

export function placeCursor(state: EditorState, cursor: Cursor): EditorState {
  const clamped = clampCursor(state.score, cursor);
  if (
    clamped.bar === state.cursor.bar &&
    clamped.beat === state.cursor.beat &&
    clamped.string === state.cursor.string
  ) {
    return state;
  }
  return { ...state, cursor: clamped };
}

export function moveCursor(state: EditorState, direction: Direction): EditorState {
  const cursor = clampCursor(state.score, state.cursor);
  const bars = track0(state.score).bars;
  let { bar, beat, string } = cursor;
  switch (direction) {
    case 'up':
      string = Math.max(0, string - 1);
      break;
    case 'down':
      string = Math.min(track0(state.score).tuning.length - 1, string + 1);
      break;
    case 'left':
      if (beat > 0) {
        beat -= 1;
      } else if (bar > 0) {
        bar -= 1;
        beat = maxCursorBeat(bars[bar]!);
      }
      break;
    case 'right':
      if (beat < maxCursorBeat(bars[bar]!)) {
        beat += 1;
      } else if (bar < bars.length - 1) {
        bar += 1;
        beat = 0;
      } else {
        // At the very end of the score: grow the page with a fresh bar so
        // entry never dead-ends. Undoable like any other bar edit.
        const grown = appendBar(state);
        return placeCursor(grown, { bar: bars.length, beat: 0, string });
      }
      break;
  }
  return placeCursor(state, { bar, beat, string });
}

// ---------------------------------------------------------------------------
// Moving notes between strings / bars

export function canMoveNoteToString(score: Score, from: Cell, toString: number): boolean {
  const track = track0(score);
  if (toString < 0 || toString >= track.tuning.length || toString === from.string) return false;
  const note = noteAt(score, from);
  if (!note) return false;
  if (restringFret(track.tuning, from.string, note.fret, toString) === null) return false;
  const beat = beatAt(score, from.bar, from.beat)!;
  return !beat.notes.some((n) => n.string === toString);
}

/** Drag a note to another string, recomputing the fret so the pitch is unchanged. */
export function moveNoteToString(state: EditorState, from: Cell, toString: number): EditorState {
  if (!canMoveNoteToString(state.score, from, toString)) return state;
  const track = track0(state.score);
  const note = noteAt(state.score, from)!;
  const newFret = restringFret(track.tuning, from.string, note.fret, toString)!;
  const bars = track.bars;
  const bar = bars[from.bar]!;
  const beats = voiceBeats(bar);
  const beat = beats[from.beat]!;
  const moved = createNote(toString, newFret, { articulations: note.articulations });
  const newBeat = createBeat(beat.duration, [...beat.notes.filter((n) => n.string !== from.string), moved]);
  const newBars = bars.map((b, i) =>
    i === from.bar ? withVoiceBeats(b, beats.map((bt, j) => (j === from.beat ? newBeat : bt))) : b,
  );
  return commit(state, withBars(state.score, newBars), { bar: from.bar, beat: from.beat, string: toString });
}

interface PlannedMove {
  cell: Cell;
  note: Note;
  toString: number;
  toFret: number;
}

function planStringDelta(score: Score, cells: readonly Cell[], delta: number): PlannedMove[] | null {
  const track = track0(score);
  const moves: PlannedMove[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${String(cell.bar)}:${String(cell.beat)}:${String(cell.string)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = noteAt(score, cell);
    if (!note) continue;
    const toString = cell.string + delta;
    if (toString < 0 || toString >= track.tuning.length) return null;
    const toFret = restringFret(track.tuning, cell.string, note.fret, toString);
    if (toFret === null) return null;
    moves.push({ cell, note, toString, toFret });
  }
  if (moves.length === 0) return null;
  // A move is blocked when a destination string is already held by a note
  // that is not itself moving out of the way.
  const movingByBeat = new Map<string, Set<number>>();
  for (const m of moves) {
    const key = `${String(m.cell.bar)}:${String(m.cell.beat)}`;
    let set = movingByBeat.get(key);
    if (!set) movingByBeat.set(key, (set = new Set()));
    set.add(m.cell.string);
  }
  for (const m of moves) {
    const beat = beatAt(score, m.cell.bar, m.cell.beat)!;
    const movingStrings = movingByBeat.get(`${String(m.cell.bar)}:${String(m.cell.beat)}`)!;
    const occupant = beat.notes.find((n) => n.string === m.toString);
    if (occupant && !movingStrings.has(occupant.string)) return null;
  }
  return moves;
}

export function canMoveNotesByStringDelta(score: Score, cells: readonly Cell[], delta: number): boolean {
  if (delta === 0) return false;
  return planStringDelta(score, cells, delta) !== null;
}

/** Shift a selection of notes by ±N strings, pitch-preserving, all-or-nothing. */
export function moveNotesByStringDelta(state: EditorState, cells: readonly Cell[], delta: number): EditorState {
  if (delta === 0) return state;
  const moves = planStringDelta(state.score, cells, delta);
  if (!moves) return state;

  const byBeat = new Map<string, PlannedMove[]>();
  for (const m of moves) {
    const key = `${String(m.cell.bar)}:${String(m.cell.beat)}`;
    const list = byBeat.get(key) ?? [];
    list.push(m);
    byBeat.set(key, list);
  }

  const bars = track0(state.score).bars;
  const newBars = [...bars];
  for (const [key, beatMoves] of byBeat) {
    const [barIndex, beatIndex] = key.split(':').map(Number) as [number, number];
    const bar = newBars[barIndex]!;
    const beats = voiceBeats(bar);
    const beat = beats[beatIndex]!;
    const movingStrings = new Set(beatMoves.map((m) => m.cell.string));
    const kept = beat.notes.filter((n) => !movingStrings.has(n.string));
    const movedNotes = beatMoves.map((m) => createNote(m.toString, m.toFret, { articulations: m.note.articulations }));
    const newBeat = createBeat(beat.duration, [...kept, ...movedNotes]);
    newBars[barIndex] = withVoiceBeats(bar, beats.map((bt, j) => (j === beatIndex ? newBeat : bt)));
  }
  const cursor = { ...state.cursor, string: clampInt(state.cursor.string + delta, 0, track0(state.score).tuning.length - 1) };
  return commit(state, withBars(state.score, newBars), cursor);
}

function uniqueBeatRefs(cells: readonly Cell[]): Array<{ bar: number; beat: number }> {
  const seen = new Set<string>();
  const refs: Array<{ bar: number; beat: number }> = [];
  for (const cell of cells) {
    const key = `${String(cell.bar)}:${String(cell.beat)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ bar: cell.bar, beat: cell.beat });
  }
  refs.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  return refs;
}

function planBeatsToBar(
  score: Score,
  cells: readonly Cell[],
  targetBar: number,
): { sources: Array<{ bar: number; beat: number }>; moved: Beat[] } | null {
  const bars = track0(score).bars;
  if (targetBar < 0 || targetBar >= bars.length) return null;
  const sources = uniqueBeatRefs(cells).filter((ref) => beatAt(score, ref.bar, ref.beat) !== undefined);
  if (sources.length === 0) return null;
  if (sources.every((ref) => ref.bar === targetBar)) return null; // nothing would change position meaningfully
  const moved = sources.map((ref) => beatAt(score, ref.bar, ref.beat)!);
  const movedWholes = moved.reduce((sum, b) => addFractions(sum, beatDurationInWholes(b)), ZERO);
  // Room in the target bar after the sources leave it.
  const target = bars[targetBar]!;
  const removedFromTarget = sources
    .filter((ref) => ref.bar === targetBar)
    .reduce((sum, ref) => addFractions(sum, beatDurationInWholes(beatAt(score, ref.bar, ref.beat)!)), ZERO);
  const filledAfter = subtractFractions(barFilledInWholes(target), removedFromTarget);
  const room = subtractFractions(barCapacityInWholes(target.timeSignature), filledAfter);
  if (compareFractions(movedWholes, room) > 0) return null;
  return { sources, moved };
}

export function canMoveBeatsToBar(score: Score, cells: readonly Cell[], targetBar: number): boolean {
  return planBeatsToBar(score, cells, targetBar) !== null;
}

/** Move the selected beats to the end of another bar (capacity-checked, all-or-nothing). */
export function moveBeatsToBar(state: EditorState, cells: readonly Cell[], targetBar: number): EditorState {
  const plan = planBeatsToBar(state.score, cells, targetBar);
  if (!plan) return state;
  const bars = track0(state.score).bars;
  const removeByBar = new Map<number, Set<number>>();
  for (const ref of plan.sources) {
    let set = removeByBar.get(ref.bar);
    if (!set) removeByBar.set(ref.bar, (set = new Set()));
    set.add(ref.beat);
  }
  let newBars = bars.map((bar, i) => {
    const remove = removeByBar.get(i);
    if (!remove) return bar;
    return withVoiceBeats(bar, voiceBeats(bar).filter((_, j) => !remove.has(j)));
  });
  const target = newBars[targetBar]!;
  const firstMovedIndex = voiceBeats(target).length;
  newBars = newBars.map((bar, i) => (i === targetBar ? withVoiceBeats(bar, [...voiceBeats(bar), ...plan.moved]) : bar));
  return commit(state, withBars(state.score, newBars), {
    bar: targetBar,
    beat: firstMovedIndex,
    string: state.cursor.string,
  });
}

export interface SlotTarget {
  readonly bar: number;
  readonly beat: number;
}

interface SlotPlan {
  bars: Bar[];
  /** Beat index each moved source landed on (in the target bar), in source order. */
  targetPositions: number[];
}

/**
 * Reposition notes in time: the selected notes leave their beats (which stay
 * behind as rests, so nothing else shifts) and land on consecutive slots
 * starting at `target` — merging into existing beats (target duration wins,
 * same-string notes are replaced) or appending new beats, padding any gap
 * with rests. Blocked when the target bar would overflow.
 */
function planNotesToSlot(score: Score, cells: readonly Cell[], target: SlotTarget): SlotPlan | null {
  const allBars = track0(score).bars;
  if (target.bar < 0 || target.bar >= allBars.length || target.beat < 0) return null;

  const byBeat = new Map<string, { bar: number; beat: number; strings: Set<number> }>();
  for (const cell of cells) {
    if (!noteAt(score, cell)) continue;
    const key = `${String(cell.bar)}:${String(cell.beat)}`;
    let entry = byBeat.get(key);
    if (!entry) byBeat.set(key, (entry = { bar: cell.bar, beat: cell.beat, strings: new Set() }));
    entry.strings.add(cell.string);
  }
  const sources = [...byBeat.values()].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  if (sources.length === 0) return null;
  if (sources.length === 1 && sources[0]!.bar === target.bar && sources[0]!.beat === target.beat) return null;

  const beatsByBar = allBars.map((bar) => [...voiceBeats(bar)]);

  const moved: Array<{ notes: Note[]; duration: Beat['duration'] }> = [];
  for (const src of sources) {
    const beat = beatsByBar[src.bar]?.[src.beat];
    if (!beat) continue;
    const movingNotes = beat.notes.filter((n) => src.strings.has(n.string));
    if (movingNotes.length === 0) continue;
    moved.push({ notes: [...movingNotes], duration: beat.duration });
    beatsByBar[src.bar]![src.beat] = createBeat(beat.duration, beat.notes.filter((n) => !src.strings.has(n.string)));
  }
  if (moved.length === 0) return null;

  const targetBeats = beatsByBar[target.bar]!;
  const targetPositions: number[] = [];
  moved.forEach((piece, k) => {
    const pos = target.beat + k;
    if (pos < targetBeats.length) {
      const existing = targetBeats[pos]!;
      const movingStrings = new Set(piece.notes.map((n) => n.string));
      targetBeats[pos] = createBeat(existing.duration, [
        ...existing.notes.filter((n) => !movingStrings.has(n.string)),
        ...piece.notes,
      ]);
    } else {
      while (targetBeats.length < pos) targetBeats.push(createBeat(piece.duration, []));
      targetBeats.push(createBeat(piece.duration, piece.notes));
    }
    targetPositions.push(pos);
  });

  const bars = allBars.map((bar, i) => withVoiceBeats(bar, beatsByBar[i]!));
  if (isBarOverfull(bars[target.bar]!)) return null;
  return { bars, targetPositions };
}

export function canMoveNotesToSlot(score: Score, cells: readonly Cell[], target: SlotTarget): boolean {
  return planNotesToSlot(score, cells, target) !== null;
}

/** Drag notes to another beat position (same or another bar). */
export function moveNotesToSlot(state: EditorState, cells: readonly Cell[], target: SlotTarget): EditorState {
  const plan = planNotesToSlot(state.score, cells, target);
  if (!plan) return state;
  return commit(state, withBars(state.score, plan.bars), {
    bar: target.bar,
    beat: plan.targetPositions[0] ?? target.beat,
    string: state.cursor.string,
  });
}

/** Delete the notes at the given cells; emptied beats become rests. */
export function deleteCells(state: EditorState, cells: readonly Cell[]): EditorState {
  const bars = track0(state.score).bars;
  const newBars = [...bars];
  let changed = false;
  const byBeat = new Map<string, Set<number>>();
  for (const cell of cells) {
    const key = `${String(cell.bar)}:${String(cell.beat)}`;
    let set = byBeat.get(key);
    if (!set) byBeat.set(key, (set = new Set()));
    set.add(cell.string);
  }
  for (const [key, strings] of byBeat) {
    const [barIndex, beatIndex] = key.split(':').map(Number) as [number, number];
    const bar = newBars[barIndex];
    if (!bar) continue;
    const beats = voiceBeats(bar);
    const beat = beats[beatIndex];
    if (!beat) continue;
    const remaining = beat.notes.filter((n) => !strings.has(n.string));
    if (remaining.length === beat.notes.length) continue;
    changed = true;
    newBars[barIndex] = withVoiceBeats(
      bar,
      beats.map((bt, j) => (j === beatIndex ? createBeat(bt.duration, remaining) : bt)),
    );
  }
  if (!changed) return state;
  return commit(state, withBars(state.score, newBars));
}

// ---------------------------------------------------------------------------
// Score metadata (not undoable)

export function setScoreMeta(state: EditorState, patch: ScoreMetaPatch): EditorState {
  return { ...state, score: withScoreMeta(state.score, patch) };
}

// ---------------------------------------------------------------------------
// Bar operations

export function appendBar(state: EditorState): EditorState {
  const bars = track0(state.score).bars;
  const ts = bars[bars.length - 1]?.timeSignature ?? FOUR_FOUR;
  return commit(state, withBars(state.score, [...bars, createBar(ts)]));
}

export function insertBar(state: EditorState, atIndex: number): EditorState {
  const bars = track0(state.score).bars;
  const index = clampInt(atIndex, 0, bars.length);
  const ts = (bars[index] ?? bars[bars.length - 1])?.timeSignature ?? FOUR_FOUR;
  return insertBarValue(state, index, createBar(ts));
}

export function insertBarValue(state: EditorState, atIndex: number, bar: Bar): EditorState {
  const bars = track0(state.score).bars;
  const index = clampInt(atIndex, 0, bars.length);
  const newBars = [...bars.slice(0, index), bar, ...bars.slice(index)];
  const cursor =
    state.cursor.bar >= index ? { ...state.cursor, bar: state.cursor.bar + 1 } : state.cursor;
  return commit(state, withBars(state.score, newBars), cursor);
}

export function duplicateBar(state: EditorState, atIndex: number): EditorState {
  const bars = track0(state.score).bars;
  const bar = bars[atIndex];
  if (!bar) return state;
  const newBars = [...bars.slice(0, atIndex + 1), bar, ...bars.slice(atIndex + 1)];
  return commit(state, withBars(state.score, newBars));
}

/** Remove a bar. Deleting the only bar leaves a fresh empty one (never zero bars). */
export function deleteBar(state: EditorState, atIndex: number): EditorState {
  const bars = track0(state.score).bars;
  if (atIndex < 0 || atIndex >= bars.length) return state;
  const newBars =
    bars.length === 1 ? [createBar(bars[0]!.timeSignature)] : bars.filter((_, i) => i !== atIndex);
  const cursorBar = state.cursor.bar > atIndex ? state.cursor.bar - 1 : state.cursor.bar;
  return commit(state, withBars(state.score, newBars), { ...state.cursor, bar: cursorBar, beat: 0 });
}

export function replaceBarValue(state: EditorState, index: number, bar: Bar): EditorState {
  const bars = track0(state.score).bars;
  if (index < 0 || index >= bars.length) return state;
  return commit(state, withBars(state.score, bars.map((b, i) => (i === index ? bar : b))));
}

export function setBarTimeSignature(state: EditorState, index: number, ts: TimeSignature): EditorState {
  const bars = track0(state.score).bars;
  const bar = bars[index];
  if (!bar || timeSignatureEquals(bar.timeSignature, ts)) return state;
  return replaceBarValue(state, index, createBar(ts, bar.voices));
}

/**
 * Apply one time signature across the whole score, re-flowing every beat into
 * bars of the new capacity. A beat longer than a whole bar gets its own
 * (overfull) bar. The score keeps at least its previous bar count so trailing
 * empty "paper" is preserved.
 */
export function setScoreTimeSignature(state: EditorState, ts: TimeSignature): EditorState {
  const bars = track0(state.score).bars;
  if (bars.every((b) => timeSignatureEquals(b.timeSignature, ts))) return state;
  const allBeats = bars.flatMap((b) => voiceBeats(b));
  const capacity = barCapacityInWholes(ts);

  const newBars: Bar[] = [];
  let current: Beat[] = [];
  let filled: Fraction = ZERO;
  for (const beat of allBeats) {
    const w = beatDurationInWholes(beat);
    if (current.length > 0 && compareFractions(addFractions(filled, w), capacity) > 0) {
      newBars.push(createBar(ts, [createVoice(current)]));
      current = [];
      filled = ZERO;
    }
    current.push(beat);
    filled = addFractions(filled, w);
  }
  if (current.length > 0) newBars.push(createBar(ts, [createVoice(current)]));
  while (newBars.length < Math.max(1, bars.length)) newBars.push(createBar(ts));
  return commit(state, withBars(state.score, newBars));
}

// ---------------------------------------------------------------------------
// Copy / paste

/** Extract Beats for the selected cells (notes filtered to the selected strings). */
export function beatsForCells(score: Score, cells: readonly Cell[]): Beat[] {
  const byBeat = new Map<string, { bar: number; beat: number; strings: Set<number> }>();
  for (const cell of cells) {
    const key = `${String(cell.bar)}:${String(cell.beat)}`;
    let entry = byBeat.get(key);
    if (!entry) byBeat.set(key, (entry = { bar: cell.bar, beat: cell.beat, strings: new Set() }));
    entry.strings.add(cell.string);
  }
  const refs = [...byBeat.values()].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const out: Beat[] = [];
  for (const ref of refs) {
    const beat = beatAt(score, ref.bar, ref.beat);
    if (!beat) continue;
    out.push(createBeat(beat.duration, beat.notes.filter((n) => ref.strings.has(n.string))));
  }
  return out;
}

/**
 * Insert copied beats at the cursor position. Later beats shift right; any
 * overflow cascades bar-by-bar into the following bars (creating bars at the
 * end as needed) so nothing is lost.
 */
export function pasteBeatsAtCursor(state: EditorState, beats: readonly Beat[]): EditorState {
  if (beats.length === 0) return state;
  const cursor = clampCursor(state.score, state.cursor);
  const bars = track0(state.score).bars;
  const newBars = [...bars];
  const bar = newBars[cursor.bar]!;
  const barBeats = voiceBeats(bar);
  const insertAt = Math.min(cursor.beat, barBeats.length);
  newBars[cursor.bar] = withVoiceBeats(bar, [
    ...barBeats.slice(0, insertAt),
    ...beats,
    ...barBeats.slice(insertAt),
  ]);

  // Cascade overflow forward: while a bar is overfull and has more than one
  // beat, its tail beats spill into the start of the next bar.
  for (let i = cursor.bar; i < newBars.length; i++) {
    const current = newBars[i]!;
    let currentBeats = [...voiceBeats(current)];
    const capacity = barCapacityInWholes(current.timeSignature);
    const spill: Beat[] = [];
    let filled = currentBeats.reduce((sum, b) => addFractions(sum, beatDurationInWholes(b)), ZERO);
    while (currentBeats.length > 1 && compareFractions(filled, capacity) > 0) {
      const tail = currentBeats.pop()!;
      spill.unshift(tail);
      filled = subtractFractions(filled, beatDurationInWholes(tail));
    }
    if (spill.length === 0) break;
    newBars[i] = withVoiceBeats(current, currentBeats);
    const next = newBars[i + 1];
    if (next) {
      newBars[i + 1] = withVoiceBeats(next, [...spill, ...voiceBeats(next)]);
    } else {
      newBars.push(createBar(current.timeSignature, [createVoice(spill)]));
    }
  }

  const lastPastedIndex = insertAt + beats.length - 1;
  // The pasted region may itself have spilled; clampCursor keeps this legal.
  return commit(state, withBars(state.score, newBars), { ...cursor, beat: lastPastedIndex });
}

// ---------------------------------------------------------------------------
// History

/**
 * Undo restores the previous score snapshot but keeps the current metadata
 * (title/subtitle/composer/tempo) — metadata edits are deliberately not
 * undoable, so they must not be reverted by unrelated undos.
 */
export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  const restored = withScoreMeta(previous, {
    title: state.score.title,
    subtitle: state.score.subtitle,
    composer: state.score.composer,
    tempo: state.score.tempo,
  });
  const past = state.past.slice(0, -1);
  const future = [state.score, ...state.future];
  return {
    score: restored,
    cursor: clampCursor(restored, state.cursor),
    canUndo: past.length > 0,
    canRedo: true,
    past,
    future,
  };
}

export function redo(state: EditorState): EditorState {
  const next = state.future[0];
  if (!next) return state;
  const restored = withScoreMeta(next, {
    title: state.score.title,
    subtitle: state.score.subtitle,
    composer: state.score.composer,
    tempo: state.score.tempo,
  });
  const past = [...state.past, state.score].slice(-MAX_HISTORY);
  const future = state.future.slice(1);
  return {
    score: restored,
    cursor: clampCursor(restored, state.cursor),
    canUndo: true,
    canRedo: future.length > 0,
    past,
    future,
  };
}
