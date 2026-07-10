import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import {
  beatAt,
  beatsForCells,
  clearAtCursor,
  createDefaultScore,
  createEditor,
  deleteBar,
  deleteCells,
  duplicateBar,
  insertBar,
  insertBarValue,
  MAX_HISTORY,
  midiToName,
  moveCursor,
  moveNotesByStringDelta,
  moveNotesToSlot,
  moveNoteToString,
  pasteBeatsAtCursor,
  placeCursor,
  redo,
  replaceBarValue,
  setBarTimeSignature,
  setBeatsDuration,
  setDurationAtCursor,
  setFretAtCursor,
  setScoreMeta,
  setScoreTimeSignature,
  toggleArticulation,
  undo,
  QUARTER,
  type Articulation,
  type Cell,
  type Direction,
  type Duration,
  type EditorState,
  type Score,
  type ScoreMetaPatch,
  type TimeSignature,
} from '@tabkit/core';
import type { HitCell } from '@tabkit/render';
import type { Tone } from '@tabkit/playback';
import { ContextMenu } from './components/ContextMenu';
import { SheetHeader } from './components/SheetHeader';
import { MenuBar } from './components/MenuBar';
import { ToolPanel } from './components/ToolPanel';
import { TabSheet } from './components/TabSheet';
import { useTabKeyboard } from './hooks/useTabKeyboard';
import { useTabPlayer } from './hooks/useTabPlayer';
import { clipboardBar, clipboardBeats, type ClipboardContent } from './lib/clipboard';
import { demoScore, nothingElseMatters, showcaseScore } from './lib/demoScore';
import { brushLabel, longerBrush, nudgeDuration, shorterBrush } from './lib/durationBrush';
import { combineTypedFret, type TypedFretState } from './lib/fretEntry';
import {
  loadStoredScore,
  saveStoredScore,
  scoreFromFileJson,
  scoreToFileJson,
  suggestedFileName,
} from './lib/persistence';

interface MenuState {
  x: number;
  y: number;
  cell: HitCell;
}

function initialEditor(): EditorState {
  const stored = typeof localStorage === 'undefined' ? null : loadStoredScore(localStorage);
  return createEditor(stored ?? createDefaultScore());
}

export function App(): JSX.Element {
  const [state, setState] = useState<EditorState>(initialEditor);
  const [selection, setSelection] = useState<readonly Cell[]>([]);
  const [brush, setBrush] = useState<Duration>(QUARTER);
  const [tone, setTone] = useState<Tone>('clean');
  const [speed, setSpeed] = useState(1);
  const [metronome, setMetronome] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardContent | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const player = useTabPlayer();

  // Handlers read the latest state through refs so the global keyboard
  // listener (bound once) never sees stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const typedRef = useRef<TypedFretState | null>(null);

  const apply = useCallback((next: EditorState) => {
    setState(next);
    stateRef.current = next;
  }, []);

  // Persist the document (debounced) whenever the score changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      saveStoredScore(typeof localStorage === 'undefined' ? null : localStorage, state.score);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [state.score]);

  // Flush the pending save when the tab is hidden or closed, so the last few
  // edits within the debounce window aren't lost.
  useEffect(() => {
    const flush = () => {
      saveStoredScore(typeof localStorage === 'undefined' ? null : localStorage, stateRef.current.score);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (statusMessage === null) return;
    const timer = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [statusMessage]);

  const clearSelection = useCallback(() => {
    setSelection((prev) => (prev.length === 0 ? prev : []));
  }, []);

  /** Replace the document, keeping the old one reachable via undo. */
  const loadScore = useCallback(
    (score: Score) => {
      const prev = stateRef.current;
      const fresh = createEditor(score);
      apply({ ...fresh, past: [...prev.past, prev.score].slice(-MAX_HISTORY), canUndo: true });
      clearSelection();
      typedRef.current = null;
      player.stop();
    },
    [apply, clearSelection, player],
  );

  const togglePlay = useCallback(() => {
    if (player.isPlaying) {
      player.stop();
      return;
    }
    const current = stateRef.current;
    player.play(current.score, {
      bpm: current.score.tempo * speed,
      metronome,
      tone,
      from: { fromBar: current.cursor.bar, fromBeat: current.cursor.beat },
    });
  }, [player, speed, metronome, tone]);

  useTabKeyboard({
    onDigit: (digit) => {
      const current = stateRef.current;
      const key = `${String(current.cursor.bar)}:${String(current.cursor.beat)}:${String(current.cursor.string)}`;
      const { fret, next } = combineTypedFret(typedRef.current, digit, key, Date.now());
      typedRef.current = next;
      apply(setFretAtCursor(current, fret, brushRef.current));
      clearSelection();
    },
    onMove: (direction: Direction) => {
      typedRef.current = null;
      apply(moveCursor(stateRef.current, direction));
      clearSelection();
    },
    onBrushStep: (direction) => {
      setBrush((prev) => (direction === 'longer' ? longerBrush(prev) : shorterBrush(prev)));
    },
    onNudgeDuration: (direction) => {
      const current = stateRef.current;
      const beat = beatAt(current.score, current.cursor.bar, current.cursor.beat);
      if (!beat) return;
      const next = nudgeDuration(beat.duration, direction);
      setBrush(next);
      apply(setDurationAtCursor(current, next));
    },
    onDelete: () => {
      const current = stateRef.current;
      const selected = selectionRef.current;
      if (selected.length > 0) {
        apply(deleteCells(current, selected));
        clearSelection();
      } else {
        apply(clearAtCursor(current));
      }
      typedRef.current = null;
    },
    onEscape: () => {
      setMenu(null);
      clearSelection();
    },
    onTogglePlay: togglePlay,
    onUndo: () => {
      apply(undo(stateRef.current));
      clearSelection();
    },
    onRedo: () => {
      apply(redo(stateRef.current));
      clearSelection();
    },
    onCopy: () => {
      const current = stateRef.current;
      const selected = selectionRef.current;
      if (selected.length > 0) {
        setClipboard(clipboardBeats(beatsForCells(current.score, selected)));
        return;
      }
      const beat = beatAt(current.score, current.cursor.bar, current.cursor.beat);
      if (beat && beat.notes.length > 0) {
        const cells = beat.notes.map((n) => ({ bar: current.cursor.bar, beat: current.cursor.beat, string: n.string }));
        setClipboard(clipboardBeats(beatsForCells(current.score, cells)));
      }
    },
    onPaste: () => {
      const current = stateRef.current;
      if (!clipboard) return;
      if (clipboard.kind === 'beats') {
        apply(pasteBeatsAtCursor(current, clipboard.beats));
      } else {
        apply(insertBarValue(current, current.cursor.bar + 1, clipboard.bar));
      }
      clearSelection();
    },
    onDuplicate: () => {
      apply(duplicateBar(stateRef.current, stateRef.current.cursor.bar));
      clearSelection();
    },
  });

  const onToggleArticulation = useCallback(
    (articulation: Articulation) => {
      const current = stateRef.current;
      const cells = selectionRef.current.length > 0 ? selectionRef.current : [current.cursor];
      apply(toggleArticulation(current, cells, articulation));
    },
    [apply],
  );

  const onBrushPick = useCallback(
    (duration: Duration) => {
      setBrush(duration);
      const current = stateRef.current;
      const selected = selectionRef.current;
      if (selected.length > 0) {
        apply(setBeatsDuration(current, selected, duration));
      } else if (beatAt(current.score, current.cursor.bar, current.cursor.beat)) {
        apply(setDurationAtCursor(current, duration));
      }
    },
    [apply],
  );

  const onExport = useCallback(() => {
    const score = stateRef.current.score;
    const blob = new Blob([scoreToFileJson(score)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedFileName(score);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
    setStatusMessage('Exported.');
  }, []);

  const onImport = useCallback(
    (file: File) => {
      file
        .text()
        .then((text) => {
          const score = scoreFromFileJson(text);
          if (score) {
            loadScore(score);
            setStatusMessage(`Imported “${score.title || file.name}”.`);
          } else {
            setStatusMessage('Import failed: not a TabKit file.');
          }
        })
        .catch(() => {
          setStatusMessage('Import failed: could not read the file.');
        });
    },
    [loadScore],
  );

  const track = state.score.tracks[0];
  const cursorStringName = track?.tuning[state.cursor.string] !== undefined
    ? midiToName(track.tuning[state.cursor.string]!)
    : '';

  const menuNode = useMemo(() => {
    if (!menu) return null;
    return (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        cell={menu.cell}
        state={state}
        clipboard={clipboard}
        onDuplicateBar={(index) => {
          apply(duplicateBar(stateRef.current, index));
          clearSelection();
        }}
        onCopyBar={(index) => {
          const bar = stateRef.current.score.tracks[0]?.bars[index];
          if (bar) setClipboard(clipboardBar(bar));
        }}
        onPasteBar={(index) => {
          if (clipboard?.kind === 'bar') apply(replaceBarValue(stateRef.current, index, clipboard.bar));
          clearSelection();
        }}
        onInsertBarBefore={(index) => {
          apply(insertBar(stateRef.current, index));
          clearSelection();
        }}
        onInsertBarAfter={(index) => {
          apply(insertBar(stateRef.current, index + 1));
          clearSelection();
        }}
        onDeleteBar={(index) => {
          apply(deleteBar(stateRef.current, index));
          clearSelection();
        }}
        onSetDuration={(cell, duration) => {
          const selected = selectionRef.current;
          const targets = selected.length > 0 ? selected : [cell];
          apply(setBeatsDuration(stateRef.current, targets, duration));
        }}
        onSetBarTimeSignature={(index, ts: TimeSignature) => {
          apply(setBarTimeSignature(stateRef.current, index, ts));
        }}
        onClose={() => {
          setMenu(null);
        }}
      />
    );
  }, [menu, state, clipboard, apply, clearSelection]);

  return (
    <div className="app">
      <MenuBar
        state={state}
        tone={tone}
        speed={speed}
        metronome={metronome}
        isPlaying={player.isPlaying}
        statusMessage={statusMessage}
        onTogglePlay={togglePlay}
        onTempo={(bpm) => {
          apply(setScoreMeta(stateRef.current, { tempo: bpm }));
        }}
        onSpeed={setSpeed}
        onTone={setTone}
        onMetronome={setMetronome}
        onNew={() => {
          loadScore(createDefaultScore());
        }}
        onLoadDemo={() => {
          loadScore(demoScore());
        }}
        onLoadShowcase={() => {
          loadScore(showcaseScore());
        }}
        onLoadNothingElse={() => {
          loadScore(nothingElseMatters());
        }}
        onUndo={() => {
          apply(undo(stateRef.current));
          clearSelection();
        }}
        onRedo={() => {
          apply(redo(stateRef.current));
          clearSelection();
        }}
        onExport={onExport}
        onImport={onImport}
      />
      <div className="workspace">
        <div className="sheet-area">
          <div className="tab-sheet">
            <SheetHeader
              score={state.score}
              onMeta={(patch: ScoreMetaPatch) => {
                apply(setScoreMeta(stateRef.current, patch));
              }}
            />
            <TabSheet
              state={state}
              selection={selection}
              playhead={player.playhead}
              onPick={(cell) => {
                typedRef.current = null;
                apply(placeCursor(stateRef.current, cell));
                clearSelection();
              }}
              onSelect={(cells) => {
                setSelection(cells);
                if (cells.length > 0) {
                  apply(placeCursor(stateRef.current, cells[0]!));
                }
              }}
              onMoveNote={(from, toString) => {
                apply(moveNoteToString(stateRef.current, from, toString));
              }}
              onMoveSelection={(delta) => {
                const moved = moveNotesByStringDelta(stateRef.current, selectionRef.current, delta);
                if (moved !== stateRef.current) {
                  setSelection(selectionRef.current.map((c) => ({ ...c, string: c.string + delta })));
                }
                apply(moved);
              }}
              onMoveToSlot={(cells, target, isGroup) => {
                const next = moveNotesToSlot(stateRef.current, cells, target);
                if (next !== stateRef.current) {
                  if (isGroup) {
                    // Keep the moved selection selected at its new positions.
                    const sourceOrder = [...new Map(cells.map((c) => [`${String(c.bar)}:${String(c.beat)}`, c])).entries()]
                      .sort(([, a], [, b]) => a.bar - b.bar || a.beat - b.beat)
                      .map(([key]) => key);
                    const indexByBeat = new Map(sourceOrder.map((key, i) => [key, i]));
                    setSelection(
                      cells.map((c) => ({
                        bar: target.bar,
                        beat: target.beat + (indexByBeat.get(`${String(c.bar)}:${String(c.beat)}`) ?? 0),
                        string: c.string,
                      })),
                    );
                  } else {
                    // A single-note drag doesn't hijack an unrelated selection.
                    clearSelection();
                  }
                }
                apply(next);
              }}
              onClearSelection={clearSelection}
              onContextMenu={(x, y, cell) => {
                apply(placeCursor(stateRef.current, cell));
                setMenu({ x, y, cell });
              }}
            />
          </div>
        </div>
        <ToolPanel
          state={state}
          selection={selection}
          brush={brush}
          onBrush={onBrushPick}
          onScoreTimeSignature={(ts) => {
            apply(setScoreTimeSignature(stateRef.current, ts));
            clearSelection();
          }}
          onToggleArticulation={onToggleArticulation}
        />
      </div>
      <footer className="statusbar">
        <span>
          Bar {state.cursor.bar + 1} · Beat {state.cursor.beat + 1} · String {state.cursor.string + 1}
          {cursorStringName !== '' ? ` (${cursorStringName})` : ''}
          {selection.length > 0 ? ` · ${String(selection.length)} selected` : ''}
        </span>
        <span className="hints">
          0–9 fret · ←→↑↓ move · ⌫ delete · [ ] brush ({brushLabel(brush)}) · + − retime · Space play · ⌘Z undo · ⌘C/V
          copy/paste · right-click bars
        </span>
      </footer>
      {menuNode}
    </div>
  );
}
