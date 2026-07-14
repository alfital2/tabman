import { describe, expect, it } from 'vitest';
import { bend, plainArticulation } from './articulation';
import { createBeat, createNote, createVoice } from './model';
import { createDuration, EIGHTH, HALF, QUARTER, WHOLE } from './duration';
import {
  appendBar,
  beatAt,
  beatsForCells,
  canMoveBeatsToBar,
  canMoveNotesToSlot,
  canMoveNoteToString,
  clearAtCursor,
  createEditor,
  deleteBar,
  deleteCells,
  duplicateBar,
  insertBar,
  moveBeatsToBar,
  moveCursor,
  moveNotesByStringDelta,
  moveNotesToSlot,
  moveNoteToString,
  noteAt,
  pasteBeatsAtCursor,
  pasteSegmentsAtCursor,
  placeCursor,
  redo,
  setBarPickup,
  setBarTimeSignature,
  setChordAtCursor,
  setFretAtCursor,
  setDurationAtCursor,
  setScoreMeta,
  setScoreTimeSignature,
  segmentsForCells,
  removeTupletAtBeats,
  splitBeatToTuplet,
  toggleArticulation,
  undo,
  updateBeatsDuration,
  type EditorState,
} from './editor';
import { barFilledInWholes, createDefaultScore, createScore, createTrack, createBar, isRest } from './model';
import { createTimeSignature, FOUR_FOUR } from './timeSignature';
import { fractionEquals } from './fraction';

function emptyEditor(): EditorState {
  return createEditor(createDefaultScore());
}

/** Editor whose score has a single empty 4/4 bar. */
function oneBarEditor(): EditorState {
  return createEditor(createScore({ tracks: [createTrack({ bars: [createBar(FOUR_FOUR)] })] }));
}

describe('createEditor', () => {
  it('starts at bar 0, beat 0, string 0 with empty history', () => {
    const state = emptyEditor();
    expect(state.cursor).toEqual({ bar: 0, beat: 0, string: 0 });
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });
});

describe('setFretAtCursor', () => {
  it('writes a note at the append slot using the brush duration', () => {
    const state = setFretAtCursor(emptyEditor(), 5, QUARTER);
    const beat = beatAt(state.score, 0, 0)!;
    expect(beat.duration).toBe(QUARTER);
    expect(beat.notes).toEqual([expect.objectContaining({ string: 0, fret: 5 })]);
    expect(state.cursor).toEqual({ bar: 0, beat: 0, string: 0 });
    expect(state.canUndo).toBe(true);
  });

  it('replaces the fret on an existing beat, keeping duration and articulations', () => {
    let state = setFretAtCursor(emptyEditor(), 5, HALF);
    state = toggleArticulation(state, [state.cursor], bend(1));
    state = setFretAtCursor(state, 7);
    const note = noteAt(state.score, { bar: 0, beat: 0, string: 0 })!;
    expect(note.fret).toBe(7);
    expect(note.articulations).toEqual([{ type: 'bend', amount: 1 }]);
    expect(beatAt(state.score, 0, 0)!.duration).toBe(HALF);
  });

  it('builds chords: another string on the same beat', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = placeCursor(state, { bar: 0, beat: 0, string: 2 });
    state = setFretAtCursor(state, 7);
    expect(beatAt(state.score, 0, 0)!.notes).toHaveLength(2);
  });

  it('auto-flows into the next bar when the brush does not fit the room left', () => {
    let state = emptyEditor();
    for (let i = 0; i < 3; i++) {
      state = setFretAtCursor(state, i, QUARTER);
      state = moveCursor(state, 'right');
    }
    // bar 0 holds three quarters; cursor is on its append slot. A half note
    // does not fit the remaining quarter of room, so it flows into bar 1.
    expect(state.cursor).toEqual({ bar: 0, beat: 3, string: 0 });
    state = setFretAtCursor(state, 9, HALF);
    expect(beatAt(state.score, 1, 0)!.notes[0]!.fret).toBe(9);
    expect(state.cursor).toEqual({ bar: 1, beat: 0, string: 0 });
  });

  it('creates a new bar when flowing past the last one', () => {
    let state = oneBarEditor();
    for (let i = 0; i < 3; i++) {
      state = setFretAtCursor(state, i, QUARTER);
      state = moveCursor(state, 'right');
    }
    state = setFretAtCursor(state, 3, HALF); // no room; must create bar 1
    expect(state.score.tracks[0]!.bars).toHaveLength(2);
    expect(beatAt(state.score, 1, 0)!.notes[0]!.fret).toBe(3);
  });

  it('places an oversized note into an empty bar (overfull) instead of dead-ending', () => {
    const small = createEditor(
      createScore({ tracks: [createTrack({ bars: [createBar(createTimeSignature(2, 4))] })] }),
    );
    const state = setFretAtCursor(small, 0, WHOLE);
    expect(beatAt(state.score, 0, 0)).toBeDefined();
    expect(state.score.tracks[0]!.bars).toHaveLength(1);
  });

  it('clamps frets into 0..24', () => {
    const state = setFretAtCursor(emptyEditor(), 99);
    expect(noteAt(state.score, { bar: 0, beat: 0, string: 0 })!.fret).toBe(24);
  });
});

describe('durations', () => {
  it('setDurationAtCursor retimes the beat under the cursor', () => {
    let state = setFretAtCursor(emptyEditor(), 5, QUARTER);
    state = setDurationAtCursor(state, EIGHTH);
    expect(beatAt(state.score, 0, 0)!.duration).toBe(EIGHTH);
  });

  it('is a no-op on the append slot and on identical durations', () => {
    const state = emptyEditor();
    expect(setDurationAtCursor(state, EIGHTH)).toBe(state);
    const withNote = setFretAtCursor(state, 5, QUARTER);
    expect(setDurationAtCursor(withNote, QUARTER)).toBe(withNote);
  });
});

describe('clearAtCursor', () => {
  it('removes the note, leaving a rest, then removes the rest beat', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = clearAtCursor(state);
    expect(isRest(beatAt(state.score, 0, 0)!)).toBe(true);
    state = clearAtCursor(state);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
  });

  it('only removes the note on the cursor string', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = placeCursor(state, { bar: 0, beat: 0, string: 2 });
    state = setFretAtCursor(state, 7);
    state = clearAtCursor(state); // cursor on string 2
    const beat = beatAt(state.score, 0, 0)!;
    expect(beat.notes).toHaveLength(1);
    expect(beat.notes[0]!.string).toBe(0);
  });
});

describe('toggleArticulation', () => {
  it('adds, replaces variant, and toggles off the exact variant', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    const cell = { bar: 0, beat: 0, string: 0 };
    state = toggleArticulation(state, [cell], bend(1));
    expect(noteAt(state.score, cell)!.articulations).toEqual([{ type: 'bend', amount: 1 }]);
    state = toggleArticulation(state, [cell], bend(2)); // different variant replaces
    expect(noteAt(state.score, cell)!.articulations).toEqual([{ type: 'bend', amount: 2 }]);
    state = toggleArticulation(state, [cell], bend(2)); // exact variant removes
    expect(noteAt(state.score, cell)!.articulations).toEqual([]);
  });

  it('mixed selection: sets on all when any lacks the variant', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = moveCursor(state, 'right');
    state = setFretAtCursor(state, 7);
    const cells = [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ];
    state = toggleArticulation(state, [cells[0]!], plainArticulation('palmMute'));
    state = toggleArticulation(state, cells, plainArticulation('palmMute'));
    expect(noteAt(state.score, cells[0]!)!.articulations).toEqual([{ type: 'palmMute' }]);
    expect(noteAt(state.score, cells[1]!)!.articulations).toEqual([{ type: 'palmMute' }]);
  });

  it('ignores cells without notes', () => {
    const state = emptyEditor();
    expect(toggleArticulation(state, [{ bar: 0, beat: 0, string: 0 }], bend(1))).toBe(state);
  });
});

describe('cursor movement', () => {
  it('right steps onto the append slot, then into the next bar', () => {
    let state = setFretAtCursor(emptyEditor(), 5); // cursor at 0,0
    state = moveCursor(state, 'right');
    expect(state.cursor).toEqual({ bar: 0, beat: 1, string: 0 }); // append slot
    state = moveCursor(state, 'right');
    expect(state.cursor).toEqual({ bar: 1, beat: 0, string: 0 });
  });

  it('left walks back through the previous bar', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = placeCursor(state, { bar: 1, beat: 0, string: 3 });
    state = moveCursor(state, 'left');
    expect(state.cursor).toEqual({ bar: 0, beat: 1, string: 3 }); // bar 0 append slot
    state = moveCursor(state, 'left');
    expect(state.cursor).toEqual({ bar: 0, beat: 0, string: 3 });
    state = moveCursor(state, 'left');
    expect(state.cursor).toEqual({ bar: 0, beat: 0, string: 3 }); // clamped
  });

  it('up/down clamp to the string range', () => {
    let state = emptyEditor();
    state = moveCursor(state, 'up');
    expect(state.cursor.string).toBe(0);
    for (let i = 0; i < 10; i++) state = moveCursor(state, 'down');
    expect(state.cursor.string).toBe(5);
  });

  it('right at the very end of the score appends a new bar (undoable)', () => {
    let state = oneBarEditor();
    for (let i = 0; i < 4; i++) {
      state = setFretAtCursor(state, i, QUARTER);
      state = moveCursor(state, 'right');
    }
    // four quarters filled the only bar; the last right grew the score
    expect(state.score.tracks[0]!.bars).toHaveLength(2);
    expect(state.cursor).toEqual({ bar: 1, beat: 0, string: 0 });
    // entry continues seamlessly in the new bar
    state = setFretAtCursor(state, 7, QUARTER);
    expect(beatAt(state.score, 1, 0)!.notes[0]!.fret).toBe(7);
    // and the growth is a normal undoable edit
    state = undo(state); // the note
    state = undo(state); // the appended bar
    expect(state.score.tracks[0]!.bars).toHaveLength(1);
    expect(state.cursor.bar).toBe(0);
  });

  it('right through empty bars grows the score past the last one', () => {
    let state = emptyEditor(); // 4 empty bars
    for (let i = 0; i < 4; i++) state = moveCursor(state, 'right');
    expect(state.score.tracks[0]!.bars).toHaveLength(5);
    expect(state.cursor).toEqual({ bar: 4, beat: 0, string: 0 });
  });

  it('a full bar has no append slot', () => {
    let state = oneBarEditor();
    state = setFretAtCursor(state, 0, WHOLE);
    state = placeCursor(state, { bar: 0, beat: 99, string: 0 });
    expect(state.cursor.beat).toBe(0); // clamped to the only beat
  });
});

describe('re-string moves', () => {
  it('moves a note pitch-preserving', () => {
    let state = setFretAtCursor(emptyEditor(), 0); // open high E
    state = moveNoteToString(state, { bar: 0, beat: 0, string: 0 }, 1);
    const note = noteAt(state.score, { bar: 0, beat: 0, string: 1 })!;
    expect(note.fret).toBe(5); // E4 on the B string
    expect(noteAt(state.score, { bar: 0, beat: 0, string: 0 })).toBeUndefined();
  });

  it('blocks impossible or occupied targets', () => {
    let state = setFretAtCursor(emptyEditor(), 0);
    // occupied target
    state = placeCursor(state, { bar: 0, beat: 0, string: 1 });
    state = setFretAtCursor(state, 3);
    expect(canMoveNoteToString(state.score, { bar: 0, beat: 0, string: 0 }, 1)).toBe(false);
    expect(moveNoteToString(state, { bar: 0, beat: 0, string: 0 }, 1)).toBe(state);
    // off the neck: low E open cannot live on the A string
    let low = setFretAtCursor(placeCursor(emptyEditor(), { bar: 0, beat: 0, string: 5 }), 0);
    expect(canMoveNoteToString(low.score, { bar: 0, beat: 0, string: 5 }, 4)).toBe(false);
    expect(moveNoteToString(low, { bar: 0, beat: 0, string: 5 }, 4)).toBe(low);
  });

  it('shifts a selection by string delta, all-or-nothing', () => {
    let state = setFretAtCursor(emptyEditor(), 10); // string 0 fret 10
    state = placeCursor(state, { bar: 0, beat: 0, string: 1 });
    state = setFretAtCursor(state, 10);
    const cells = [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 0, string: 1 },
    ];
    const moved = moveNotesByStringDelta(state, cells, 1);
    // string0 fret10 (D5) -> string1 fret15; string1 fret10 (A4) -> string2 fret14
    expect(noteAt(moved.score, { bar: 0, beat: 0, string: 1 })!.fret).toBe(15);
    expect(noteAt(moved.score, { bar: 0, beat: 0, string: 2 })!.fret).toBe(14);
    // blocked as a whole when any note falls off the neck
    const blocked = moveNotesByStringDelta(moved, cells.map((c) => ({ ...c, string: c.string + 1 })), -1);
    expect(blocked.score).not.toBe(undefined);
  });
});

describe('moveBeatsToBar', () => {
  it('moves beats to the end of the target bar when they fit', () => {
    let state = setFretAtCursor(emptyEditor(), 5, QUARTER);
    state = moveBeatsToBar(state, [{ bar: 0, beat: 0, string: 0 }], 2);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
    expect(beatAt(state.score, 2, 0)!.notes[0]!.fret).toBe(5);
    expect(state.cursor.bar).toBe(2);
  });

  it('blocks when the target bar lacks room', () => {
    let state = emptyEditor();
    state = placeCursor(state, { bar: 1, beat: 0, string: 0 });
    state = setFretAtCursor(state, 0, WHOLE); // bar 1 full
    state = placeCursor(state, { bar: 0, beat: 0, string: 0 });
    state = setFretAtCursor(state, 5, QUARTER);
    expect(canMoveBeatsToBar(state.score, [{ bar: 0, beat: 0, string: 0 }], 1)).toBe(false);
    expect(moveBeatsToBar(state, [{ bar: 0, beat: 0, string: 0 }], 1)).toBe(state);
  });
});

describe('moveNotesToSlot (drag in time)', () => {
  it('moves two leading quarters to the back of the bar, leaving rests', () => {
    let state = oneBarEditor();
    state = setFretAtCursor(state, 5, QUARTER);
    state = setFretAtCursor(moveCursor(state, 'right'), 7, QUARTER);
    const cells = [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ];
    // drag onto the append slot (index 2) → rests at 1–2, notes at 3–4
    state = moveNotesToSlot(state, cells, { bar: 0, beat: 2 });
    const beats = state.score.tracks[0]!.bars[0]!.voices[0]!.beats;
    expect(beats.map((b) => b.notes.length)).toEqual([0, 0, 1, 1]);
    expect(beats[2]!.notes[0]!.fret).toBe(5);
    expect(beats[3]!.notes[0]!.fret).toBe(7);
    expect(state.cursor).toEqual({ bar: 0, beat: 2, string: 0 });
  });

  it('moves notes backward by merging into existing rests', () => {
    let state = oneBarEditor();
    state = setFretAtCursor(state, 5, QUARTER);
    state = setFretAtCursor(moveCursor(state, 'right'), 7, QUARTER);
    state = moveNotesToSlot(
      state,
      [
        { bar: 0, beat: 0, string: 0 },
        { bar: 0, beat: 1, string: 0 },
      ],
      { bar: 0, beat: 2 },
    );
    // now bring them back to the front
    state = moveNotesToSlot(
      state,
      [
        { bar: 0, beat: 2, string: 0 },
        { bar: 0, beat: 3, string: 0 },
      ],
      { bar: 0, beat: 0 },
    );
    const beats = state.score.tracks[0]!.bars[0]!.voices[0]!.beats;
    expect(beats.map((b) => b.notes.length)).toEqual([1, 1, 0, 0]);
    expect(beats[0]!.notes[0]!.fret).toBe(5);
  });

  it('moves notes into another bar', () => {
    let state = setFretAtCursor(emptyEditor(), 5, QUARTER);
    state = moveNotesToSlot(state, [{ bar: 0, beat: 0, string: 0 }], { bar: 2, beat: 0 });
    expect(beatAt(state.score, 2, 0)!.notes[0]!.fret).toBe(5);
    expect(isRest(beatAt(state.score, 0, 0)!)).toBe(true);
  });

  it('merging replaces same-string notes but keeps other strings', () => {
    let state = setFretAtCursor(emptyEditor(), 5); // beat 0 string 0
    state = placeCursor(state, { bar: 0, beat: 1, string: 0 });
    state = setFretAtCursor(state, 7);
    state = placeCursor(state, { bar: 0, beat: 1, string: 2 });
    state = setFretAtCursor(state, 9);
    // drag beat 0's note onto beat 1: replaces the string-0 note, keeps string-2
    state = moveNotesToSlot(state, [{ bar: 0, beat: 0, string: 0 }], { bar: 0, beat: 1 });
    const beat = beatAt(state.score, 0, 1)!;
    expect(beat.notes.map((n) => [n.string, n.fret])).toEqual([
      [0, 5],
      [2, 9],
    ]);
  });

  it('blocks when the target bar would overflow, and no-ops onto itself', () => {
    const small = createEditor(
      createScore({ tracks: [createTrack({ bars: [createBar(createTimeSignature(2, 4)), createBar(createTimeSignature(2, 4))] })] }),
    );
    let state = setFretAtCursor(small, 5, HALF); // fills bar 0
    expect(canMoveNotesToSlot(state.score, [{ bar: 0, beat: 0, string: 0 }], { bar: 0, beat: 1 })).toBe(false);
    expect(canMoveNotesToSlot(state.score, [{ bar: 0, beat: 0, string: 0 }], { bar: 0, beat: 0 })).toBe(false);
    expect(canMoveNotesToSlot(state.score, [{ bar: 0, beat: 0, string: 0 }], { bar: 1, beat: 0 })).toBe(true);
    expect(moveNotesToSlot(state, [{ bar: 0, beat: 0, string: 0 }], { bar: 0, beat: 1 })).toBe(state);
  });
});

describe('setChordAtCursor', () => {
  it('writes a whole voicing as notes at the cursor beat', () => {
    // open C in our string order: [e0, B1, G0, D2, A3, low-E muted]
    const state = setChordAtCursor(emptyEditor(), [0, 1, 0, 2, 3, null], QUARTER);
    const beat = beatAt(state.score, 0, 0)!;
    expect(beat.notes.map((n) => [n.string, n.fret])).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 2],
      [4, 3],
    ]);
    expect(state.canUndo).toBe(true);
  });

  it('replaces whatever the beat held', () => {
    let state = setFretAtCursor(emptyEditor(), 9); // string0 fret9
    state = setChordAtCursor(state, [0, 1, 0, 2, 3, null]);
    const beat = beatAt(state.score, 0, 0)!;
    expect(beat.notes.find((n) => n.string === 0)!.fret).toBe(0); // replaced, not 9
    expect(beat.notes).toHaveLength(5);
  });

  it('ignores an all-muted voicing', () => {
    const state = emptyEditor();
    expect(setChordAtCursor(state, [null, null, null, null, null, null])).toBe(state);
  });
});

describe('deleteCells', () => {
  it('removes notes, leaving rests in place', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = moveCursor(state, 'right');
    state = setFretAtCursor(state, 7);
    state = deleteCells(state, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ]);
    expect(isRest(beatAt(state.score, 0, 0)!)).toBe(true);
    expect(isRest(beatAt(state.score, 0, 1)!)).toBe(true);
  });
});

describe('bar operations', () => {
  it('append/insert/duplicate/delete', () => {
    let state = emptyEditor(); // 4 bars
    state = appendBar(state);
    expect(state.score.tracks[0]!.bars).toHaveLength(5);
    state = insertBar(state, 0);
    expect(state.score.tracks[0]!.bars).toHaveLength(6);
    state = deleteBar(state, 0);
    expect(state.score.tracks[0]!.bars).toHaveLength(5);
    state = setFretAtCursor(state, 5);
    state = duplicateBar(state, 0);
    expect(beatAt(state.score, 1, 0)!.notes[0]!.fret).toBe(5);
  });

  it('inserting before the cursor keeps the cursor on its content', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = insertBar(state, 0);
    expect(state.cursor.bar).toBe(1);
    expect(noteAt(state.score, { ...state.cursor })).toBeDefined();
  });

  it('deleting the only bar leaves one fresh empty bar', () => {
    let state = oneBarEditor();
    state = setFretAtCursor(state, 5);
    state = deleteBar(state, 0);
    expect(state.score.tracks[0]!.bars).toHaveLength(1);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
  });

  it('per-bar time signature changes only that bar', () => {
    let state = emptyEditor();
    state = setBarTimeSignature(state, 1, createTimeSignature(3, 4));
    expect(state.score.tracks[0]!.bars[1]!.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(state.score.tracks[0]!.bars[0]!.timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });
});

describe('setScoreTimeSignature', () => {
  it('re-flows beats into bars of the new capacity', () => {
    let state = emptyEditor();
    for (let i = 0; i < 4; i++) {
      state = setFretAtCursor(state, i, QUARTER);
      state = moveCursor(state, 'right');
    }
    state = setScoreTimeSignature(state, createTimeSignature(2, 4));
    const bars = state.score.tracks[0]!.bars;
    expect(bars[0]!.voices[0]!.beats).toHaveLength(2);
    expect(bars[1]!.voices[0]!.beats).toHaveLength(2);
    expect(bars.every((b) => b.timeSignature.numerator === 2)).toBe(true);
  });

  it('keeps at least the previous bar count (trailing paper preserved)', () => {
    let state = emptyEditor(); // 4 empty bars
    state = setScoreTimeSignature(state, createTimeSignature(3, 4));
    expect(state.score.tracks[0]!.bars).toHaveLength(4);
  });
});

describe('copy / paste', () => {
  it('extracts beats for cells and pastes them at the cursor', () => {
    let state = setFretAtCursor(emptyEditor(), 5, QUARTER);
    const copied = beatsForCells(state.score, [{ bar: 0, beat: 0, string: 0 }]);
    expect(copied).toHaveLength(1);
    state = placeCursor(state, { bar: 1, beat: 0, string: 0 });
    state = pasteBeatsAtCursor(state, copied);
    expect(beatAt(state.score, 1, 0)!.notes[0]!.fret).toBe(5);
  });

  it('copy filters chord notes to the selected strings', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = placeCursor(state, { bar: 0, beat: 0, string: 2 });
    state = setFretAtCursor(state, 7);
    const copied = beatsForCells(state.score, [{ bar: 0, beat: 0, string: 2 }]);
    expect(copied[0]!.notes).toEqual([expect.objectContaining({ string: 2, fret: 7 })]);
  });

  it('paste overflow cascades into following bars without losing beats', () => {
    let state = oneBarEditor();
    for (let i = 0; i < 4; i++) state = setFretAtCursor(placeCursor(state, { bar: 0, beat: 99, string: 0 }), i, QUARTER);
    // bar full with frets 0..3; paste two more quarters at the start
    const copied = beatsForCells(state.score, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ]);
    state = placeCursor(state, { bar: 0, beat: 0, string: 0 });
    state = pasteBeatsAtCursor(state, copied);
    const bars = state.score.tracks[0]!.bars;
    expect(bars.length).toBe(2);
    const frets = bars.flatMap((b) => b.voices[0]!.beats.map((bt) => bt.notes[0]!.fret));
    expect(frets).toEqual([0, 1, 0, 1, 2, 3]);
  });
});

describe('history', () => {
  it('undo/redo round-trips edits', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = setFretAtCursor(moveCursor(state, 'right'), 7);
    const twoNotes = state.score;
    state = undo(state);
    expect(beatAt(state.score, 0, 1)).toBeUndefined();
    state = undo(state);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
    expect(state.canUndo).toBe(false);
    state = redo(state);
    state = redo(state);
    expect(state.score.tracks[0]!.bars[0]!.voices[0]!.beats).toHaveLength(2);
    expect(state.canRedo).toBe(false);
    expect(state.score.tracks[0]!.bars).toEqual(twoNotes.tracks[0]!.bars);
  });

  it('a new edit clears the redo stack', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = undo(state);
    state = setFretAtCursor(state, 9);
    expect(state.canRedo).toBe(false);
  });

  it('metadata edits are not undoable and survive undo', () => {
    let state = setFretAtCursor(emptyEditor(), 5);
    state = setScoreMeta(state, { title: 'Kept', tempo: 90 });
    expect(state.canUndo).toBe(true); // from the note, not the meta
    state = undo(state);
    expect(state.score.title).toBe('Kept');
    expect(state.score.tempo).toBe(90);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
    state = redo(state);
    expect(state.score.title).toBe('Kept');
  });

  it('undo clamps a cursor stranded past the restored score', () => {
    let state = oneBarEditor();
    state = appendBar(state);
    state = placeCursor(state, { bar: 1, beat: 0, string: 0 });
    state = undo(state); // back to one bar
    expect(state.cursor.bar).toBe(0);
  });

  it('no-op operations do not pollute history', () => {
    const state = emptyEditor();
    expect(clearAtCursor(state)).toBe(state);
    expect(deleteCells(state, [{ bar: 0, beat: 0, string: 0 }])).toBe(state);
    expect(setScoreTimeSignature(state, FOUR_FOUR)).toBe(state);
    expect(deleteBar(state, 99)).toBe(state);
    expect(pasteBeatsAtCursor(state, [])).toBe(state);
  });
});

describe('updateBeatsDuration', () => {
  function twoNoteEditor(): EditorState {
    let state = emptyEditor();
    state = setFretAtCursor(state, 3, createDuration(4, { dots: 1 }));
    state = placeCursor(state, { bar: 0, beat: 1, string: 0 });
    state = setFretAtCursor(state, 5, EIGHTH);
    return state;
  }

  it('maps each targeted beat duration, preserving notes', () => {
    let state = twoNoteEditor();
    const cells = [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ];
    state = updateBeatsDuration(state, cells, (d) => createDuration(16, { dots: d.dots, tuplet: d.tuplet }));
    const first = beatAt(state.score, 0, 0)!;
    const second = beatAt(state.score, 0, 1)!;
    expect(first.duration.value).toBe(16);
    expect(first.duration.dots).toBe(1); // dot preserved through the value change
    expect(second.duration.value).toBe(16);
    expect(second.duration.dots).toBe(0);
    expect(noteAt(state.score, cells[0]!)?.fret).toBe(3);
    expect(noteAt(state.score, cells[1]!)?.fret).toBe(5);
  });

  it('returns the same state when the update changes nothing', () => {
    const state = twoNoteEditor();
    expect(updateBeatsDuration(state, [{ bar: 0, beat: 0, string: 0 }], (d) => d)).toBe(state);
  });

  it('ignores cells pointing at missing beats', () => {
    const state = twoNoteEditor();
    expect(updateBeatsDuration(state, [{ bar: 0, beat: 99, string: 0 }], () => WHOLE)).toBe(state);
  });

  it('is undoable', () => {
    let state = twoNoteEditor();
    state = updateBeatsDuration(state, [{ bar: 0, beat: 0, string: 0 }], () => WHOLE);
    state = undo(state);
    expect(beatAt(state.score, 0, 0)!.duration.value).toBe(4);
  });
});

describe('splitBeatToTuplet', () => {
  function editorWithQuarterNote(): EditorState {
    let state = emptyEditor();
    state = setFretAtCursor(state, 5, QUARTER);
    return state;
  }

  it('splits a quarter into a triplet of tuplet-8ths, notes on the first slot', () => {
    let state = editorWithQuarterNote();
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 3);
    const beats = [0, 1, 2].map((i) => beatAt(state.score, 0, i)!);
    for (const b of beats) {
      expect(b.duration.value).toBe(8);
      expect(b.duration.tuplet).toEqual({ actual: 3, normal: 2 });
    }
    expect(beats[0]!.notes.map((n) => n.fret)).toEqual([5]);
    expect(isRest(beats[1]!)).toBe(true);
    expect(isRest(beats[2]!)).toBe(true);
  });

  it('keeps the bar total unchanged', () => {
    let state = editorWithQuarterNote();
    const before = barFilledInWholes(state.score.tracks[0]!.bars[0]!);
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 5);
    const after = barFilledInWholes(state.score.tracks[0]!.bars[0]!);
    expect(fractionEquals(before, after)).toBe(true);
  });

  it('splits a quintuplet into 16ths at 5:4', () => {
    let state = editorWithQuarterNote();
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 5);
    const first = beatAt(state.score, 0, 0)!;
    expect(first.duration.value).toBe(16);
    expect(first.duration.tuplet).toEqual({ actual: 5, normal: 4 });
    expect(beatAt(state.score, 0, 4)).toBeDefined();
  });

  it('splits a dotted quarter into a duplet of plain 8ths at 2:3', () => {
    let state = emptyEditor();
    state = setFretAtCursor(state, 5, createDuration(4, { dots: 1 }));
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 2);
    const first = beatAt(state.score, 0, 0)!;
    expect(first.duration.value).toBe(8);
    expect(first.duration.dots).toBe(0);
    expect(first.duration.tuplet).toEqual({ actual: 2, normal: 3 });
  });

  it('splits a dotted quarter quadruplet into plain 8ths at 4:3', () => {
    let state = emptyEditor();
    state = setFretAtCursor(state, 5, createDuration(4, { dots: 1 }));
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 4);
    const first = beatAt(state.score, 0, 0)!;
    expect(first.duration.value).toBe(8);
    expect(first.duration.tuplet).toEqual({ actual: 4, normal: 3 });
  });

  it('is a no-op on a beat already inside a tuplet', () => {
    let state = editorWithQuarterNote();
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 3);
    expect(splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 3)).toBe(state);
  });

  it('is a no-op for unsupported counts', () => {
    const state = editorWithQuarterNote();
    expect(splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 8)).toBe(state);
    expect(splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 1)).toBe(state);
  });

  it('is undoable in one step', () => {
    let state = editorWithQuarterNote();
    state = splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 3);
    state = undo(state);
    expect(beatAt(state.score, 0, 0)!.duration.value).toBe(4);
    expect(beatAt(state.score, 0, 1)).toBeUndefined();
  });
});

describe('removeTupletAtBeats', () => {
  function tripletEditor(): EditorState {
    let state = emptyEditor();
    state = setFretAtCursor(state, 5, QUARTER);
    return splitBeatToTuplet(state, [{ bar: 0, beat: 0, string: 0 }], 3);
  }

  it('collapses a complete group back to the base value, keeping first-slot notes', () => {
    let state = tripletEditor();
    state = removeTupletAtBeats(state, [{ bar: 0, beat: 1, string: 0 }]);
    const first = beatAt(state.score, 0, 0)!;
    expect(first.duration.value).toBe(4);
    expect(first.duration.tuplet).toBeNull();
    expect(first.notes.map((n) => n.fret)).toEqual([5]);
    expect(beatAt(state.score, 0, 1)).toBeUndefined();
  });

  it('strips tuplet flags from an incomplete group', () => {
    let state = tripletEditor();
    // Delete the middle slot (a rest) so only 2 of 3 remain.
    state = placeCursor(state, { bar: 0, beat: 1, string: 0 });
    state = clearAtCursor(state);
    state = removeTupletAtBeats(state, [{ bar: 0, beat: 0, string: 0 }]);
    const first = beatAt(state.score, 0, 0)!;
    const second = beatAt(state.score, 0, 1)!;
    expect(first.duration.tuplet).toBeNull();
    expect(first.duration.value).toBe(8);
    expect(second.duration.tuplet).toBeNull();
  });

  it('is a no-op on a non-tuplet beat', () => {
    let state = emptyEditor();
    state = setFretAtCursor(state, 5, QUARTER);
    expect(removeTupletAtBeats(state, [{ bar: 0, beat: 0, string: 0 }])).toBe(state);
  });
});

describe('bar segments copy/paste', () => {
  /** 2 bars: bar0 = frets 1,2 (quarters), bar1 = frets 3,4 (quarters, 3/4 time). */
  function twoBarEditor(): EditorState {
    let state = createEditor(
      createScore({
        tracks: [
          createTrack({
            bars: [
              createBar(FOUR_FOUR, [
                createVoice([
                  createBeat(QUARTER, [createNote(0, 1)]),
                  createBeat(QUARTER, [createNote(1, 2)]),
                ]),
              ]),
              createBar(createTimeSignature(3, 4), [
                createVoice([
                  createBeat(QUARTER, [createNote(0, 3)]),
                  createBeat(QUARTER, [createNote(0, 4)]),
                ]),
              ]),
            ],
          }),
        ],
      }),
    );
    return state;
  }

  it('segmentsForCells groups selected cells per bar, keeping each bar time signature', () => {
    const state = twoBarEditor();
    const segments = segmentsForCells(state.score, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 1 },
      { bar: 1, beat: 0, string: 0 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(segments[0]!.beats).toHaveLength(2);
    expect(segments[1]!.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(segments[1]!.beats).toHaveLength(1);
    expect(segments[1]!.beats[0]!.notes[0]!.fret).toBe(3);
  });

  it('segmentsForCells filters notes to the selected strings', () => {
    const state = twoBarEditor();
    const segments = segmentsForCells(state.score, [{ bar: 0, beat: 0, string: 5 }]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.beats[0]!.notes).toHaveLength(0); // string 5 has no note
  });

  it('paste keeps bar boundaries: later segments become their own bars after the cursor bar', () => {
    let state = twoBarEditor();
    const segments = segmentsForCells(state.score, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 1 },
      { bar: 1, beat: 0, string: 0 },
      { bar: 1, beat: 1, string: 0 },
    ]);
    // Paste at the append slot of the last bar.
    state = placeCursor(state, { bar: 1, beat: 2, string: 0 });
    state = pasteSegmentsAtCursor(state, segments);
    const bars = state.score.tracks[0]!.bars;
    expect(bars).toHaveLength(3);
    // Bar 1 (3/4, already 2/4 full) takes what fits of segment 0…
    expect(beatAt(state.score, 1, 2)!.notes[0]!.fret).toBe(1);
    // …and the overflow cascades into the head of the next (segment) bar,
    // which keeps its copied 3/4 time signature.
    expect(bars[2]!.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(beatAt(state.score, 2, 0)!.notes[0]!.fret).toBe(2);
    expect(beatAt(state.score, 2, 1)!.notes[0]!.fret).toBe(3);
    expect(beatAt(state.score, 2, 2)!.notes[0]!.fret).toBe(4);
  });

  it('paste lands the cursor at the end of the pasted region', () => {
    let state = twoBarEditor();
    const segments = segmentsForCells(state.score, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 1, beat: 0, string: 0 },
    ]);
    state = placeCursor(state, { bar: 1, beat: 2, string: 0 });
    state = pasteSegmentsAtCursor(state, segments);
    expect(state.cursor.bar).toBe(2);
  });

  it('single-segment paste inserts beats like a plain beat paste', () => {
    let state = twoBarEditor();
    const segments = segmentsForCells(state.score, [{ bar: 1, beat: 0, string: 0 }]);
    state = placeCursor(state, { bar: 0, beat: 0, string: 0 });
    state = pasteSegmentsAtCursor(state, segments);
    expect(beatAt(state.score, 0, 0)!.notes[0]!.fret).toBe(3); // inserted in front
    expect(beatAt(state.score, 0, 1)!.notes[0]!.fret).toBe(1); // old content pushed right
    expect(state.score.tracks[0]!.bars).toHaveLength(2);
  });

  it('multi-segment paste is one undo step', () => {
    let state = twoBarEditor();
    const segments = segmentsForCells(state.score, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 1, beat: 0, string: 0 },
    ]);
    state = placeCursor(state, { bar: 1, beat: 2, string: 0 });
    state = pasteSegmentsAtCursor(state, segments);
    state = undo(state);
    expect(state.score.tracks[0]!.bars).toHaveLength(2);
    expect(beatAt(state.score, 1, 2)).toBeUndefined();
  });

  it('empty segment list is a no-op', () => {
    const state = twoBarEditor();
    expect(pasteSegmentsAtCursor(state, [])).toBe(state);
  });
});

describe('deleteCells rest collapsing', () => {
  function twoNoteBar(): EditorState {
    let state = emptyEditor();
    state = setFretAtCursor(state, 1, QUARTER);
    state = placeCursor(state, { bar: 0, beat: 1, string: 0 });
    state = setFretAtCursor(state, 2, QUARTER);
    return state;
  }

  it('first delete strips notes to rests, second delete removes the rest slots', () => {
    let state = twoNoteBar();
    const cells = [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ];
    state = deleteCells(state, cells);
    expect(isRest(beatAt(state.score, 0, 0)!)).toBe(true);
    expect(isRest(beatAt(state.score, 0, 1)!)).toBe(true);
    state = deleteCells(state, cells);
    expect(beatAt(state.score, 0, 0)).toBeUndefined();
  });

  it('mixed selection only strips notes, keeps all slots', () => {
    let state = twoNoteBar();
    state = deleteCells(state, [{ bar: 0, beat: 0, string: 0 }]); // beat 0 now a rest
    state = deleteCells(state, [
      { bar: 0, beat: 0, string: 0 },
      { bar: 0, beat: 1, string: 0 },
    ]);
    // beat 1 had a note: this pass strips it, and both slots survive as rests.
    expect(isRest(beatAt(state.score, 0, 0)!)).toBe(true);
    expect(isRest(beatAt(state.score, 0, 1)!)).toBe(true);
  });
});

describe('setBarPickup', () => {
  it('toggles the flag, undoably', () => {
    let state = emptyEditor();
    state = setBarPickup(state, 0, true);
    expect(state.score.tracks[0]!.bars[0]!.pickup).toBe(true);
    state = undo(state);
    expect(state.score.tracks[0]!.bars[0]!.pickup).toBe(false);
  });

  it('is a no-op when unchanged or out of range', () => {
    const state = emptyEditor();
    expect(setBarPickup(state, 0, false)).toBe(state);
    expect(setBarPickup(state, 99, true)).toBe(state);
  });

  it('editing inside a pickup bar keeps the flag', () => {
    let state = emptyEditor();
    state = setBarPickup(state, 0, true);
    state = setFretAtCursor(state, 5, QUARTER);
    expect(state.score.tracks[0]!.bars[0]!.pickup).toBe(true);
  });

  it('changing a bar time signature keeps the flag', () => {
    let state = emptyEditor();
    state = setBarPickup(state, 0, true);
    state = setBarTimeSignature(state, 0, createTimeSignature(3, 4));
    expect(state.score.tracks[0]!.bars[0]!.pickup).toBe(true);
  });
});
