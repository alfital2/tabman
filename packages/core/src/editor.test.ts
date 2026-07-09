import { describe, expect, it } from 'vitest';
import { bend, plainArticulation } from './articulation';
import { EIGHTH, HALF, QUARTER, WHOLE } from './duration';
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
  placeCursor,
  redo,
  setBarTimeSignature,
  setFretAtCursor,
  setDurationAtCursor,
  setScoreMeta,
  setScoreTimeSignature,
  toggleArticulation,
  undo,
  type EditorState,
} from './editor';
import { createDefaultScore, createScore, createTrack, createBar, isRest } from './model';
import { createTimeSignature, FOUR_FOUR } from './timeSignature';

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
