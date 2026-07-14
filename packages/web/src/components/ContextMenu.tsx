import { useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { beatAt, isRest, type Duration, type EditorState, type TimeSignature } from '@tabkit/core';
import type { HitCell } from '@tabkit/render';
import { BRUSH_LADDER, brushLabel } from '../lib/durationBrush';
import { BAR_TIME_SIGNATURE_PRESETS, timeSignatureLabel } from '../lib/timeSignatures';
import type { ClipboardContent } from '../lib/clipboard';
import { NoteValueIcon } from './icons';

export interface ContextMenuProps {
  x: number;
  y: number;
  cell: HitCell;
  state: EditorState;
  clipboard: ClipboardContent | null;
  onDuplicateBar(index: number): void;
  onCopyBar(index: number): void;
  onPasteBar(index: number): void;
  onInsertBarBefore(index: number): void;
  onInsertBarAfter(index: number): void;
  onDeleteBar(index: number): void;
  onSetDuration(cell: HitCell, duration: Duration): void;
  onSetBarTimeSignature(index: number, ts: TimeSignature): void;
  /** Toggle the anacrusis flag (offered on the first bar only). */
  onTogglePickup(index: number, pickup: boolean): void;
  /** Patch repeat flags on a bar (start / end count / endings). */
  onSetRepeat(index: number, patch: { repeatStart?: boolean; repeatEnd?: number | null; endings?: number[] }): void;
  onAddChord(cell: HitCell): void;
  onClose(): void;
}

const DURATION_ROW = BRUSH_LADDER.slice(0, 5); // whole … 16th

export function ContextMenu(props: ContextMenuProps): JSX.Element {
  const { x, y, cell, state, clipboard } = props;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { innerWidth, innerHeight } = window;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, innerWidth - rect.width - 8)),
      top: Math.max(4, Math.min(y, innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useLayoutEffect(() => {
    const close = (event: Event) => {
      if (event instanceof PointerEvent && menuRef.current?.contains(event.target as Node)) return;
      props.onClose();
    };
    // The menu owns the keyboard while open: swallow every key (capture +
    // stopPropagation) so global shortcuts don't edit the document behind it,
    // and Escape closes the menu without falling through to clear the selection.
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('resize', close);
    };
  });

  const barNumber = cell.bar + 1;
  const beat = beatAt(state.score, cell.bar, cell.beat);
  const showDurations = beat !== undefined && !isRest(beat);

  const item = (label: string, action: () => void, disabled = false) => (
    <button
      type="button"
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        action();
        props.onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="context-menu" ref={menuRef} style={{ left: position.left, top: position.top }} role="menu">
      {item('♪ Add chord…', () => {
        props.onAddChord(cell);
      })}
      <div className="menu-separator" />
      {item(`Duplicate bar ${String(barNumber)}`, () => {
        props.onDuplicateBar(cell.bar);
      })}
      {item(`Copy bar ${String(barNumber)}`, () => {
        props.onCopyBar(cell.bar);
      })}
      {clipboard?.kind === 'bar' &&
        item(`Paste bar ${String(barNumber)}`, () => {
          props.onPasteBar(cell.bar);
        })}
      <div className="menu-separator" />
      {item('Insert bar before', () => {
        props.onInsertBarBefore(cell.bar);
      })}
      {item('Insert bar after', () => {
        props.onInsertBarAfter(cell.bar);
      })}
      {item(`Delete bar ${String(barNumber)}`, () => {
        props.onDeleteBar(cell.bar);
      })}
      {cell.bar === 0 &&
        item(state.score.tracks[0]?.bars[0]?.pickup ? '✓ Pickup bar (anacrusis)' : 'Pickup bar (anacrusis)', () => {
          props.onTogglePickup(0, !state.score.tracks[0]?.bars[0]?.pickup);
        })}
      {showDurations && (
        <>
          <div className="menu-separator" />
          <div className="menu-row-label">Note duration</div>
          <div className="menu-row">
            {DURATION_ROW.map((duration) => (
              <button
                key={duration.value}
                type="button"
                className="menu-chip glyph"
                title={brushLabel(duration)}
                onClick={() => {
                  props.onSetDuration(cell, duration);
                  props.onClose();
                }}
              >
                <NoteValueIcon value={duration.value} size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="menu-separator" />
      <div className="menu-row-label">Repeats &amp; endings</div>
      <div className="menu-row">
        {(() => {
          const bar = state.score.tracks[0]?.bars[cell.bar];
          const chip = (label: string, active: boolean, action: () => void, title?: string) => (
            <button
              key={label}
              type="button"
              className={`menu-chip${active ? ' active' : ''}`}
              title={title ?? label}
              onClick={() => {
                action();
                props.onClose();
              }}
            >
              {label}
            </button>
          );
          const endingsEqual = (a: readonly number[] | undefined, b: number[]) =>
            a !== undefined && a.length === b.length && b.every((n, i) => a[i] === n);
          return [
            chip('𝄆', bar?.repeatStart === true, () => {
              props.onSetRepeat(cell.bar, { repeatStart: bar?.repeatStart !== true });
            }, 'Repeat start (toggle)'),
            chip('𝄇×2', bar?.repeatEnd === 2, () => {
              props.onSetRepeat(cell.bar, { repeatEnd: bar?.repeatEnd === 2 ? null : 2 });
            }, 'Repeat end, play twice (toggle)'),
            chip('𝄇×3', bar?.repeatEnd === 3, () => {
              props.onSetRepeat(cell.bar, { repeatEnd: bar?.repeatEnd === 3 ? null : 3 });
            }, 'Repeat end, play 3× (toggle)'),
            chip('𝄇×4', bar?.repeatEnd === 4, () => {
              props.onSetRepeat(cell.bar, { repeatEnd: bar?.repeatEnd === 4 ? null : 4 });
            }, 'Repeat end, play 4× (toggle)'),
            chip('1.', endingsEqual(bar?.endings, [1]), () => {
              props.onSetRepeat(cell.bar, { endings: endingsEqual(bar?.endings, [1]) ? [] : [1] });
            }, '1st ending (toggle)'),
            chip('2.', endingsEqual(bar?.endings, [2]), () => {
              props.onSetRepeat(cell.bar, { endings: endingsEqual(bar?.endings, [2]) ? [] : [2] });
            }, '2nd ending (toggle)'),
            chip('1.2.', endingsEqual(bar?.endings, [1, 2]), () => {
              props.onSetRepeat(cell.bar, { endings: endingsEqual(bar?.endings, [1, 2]) ? [] : [1, 2] });
            }, '1st & 2nd ending (toggle)'),
            chip('✕', false, () => {
              props.onSetRepeat(cell.bar, { repeatStart: false, repeatEnd: null, endings: [] });
            }, 'Clear repeats & endings on this bar'),
          ];
        })()}
      </div>
      <div className="menu-separator" />
      <div className="menu-row-label">Time signature of bar {String(barNumber)}</div>
      <div className="menu-row">
        {BAR_TIME_SIGNATURE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="menu-chip"
            onClick={() => {
              props.onSetBarTimeSignature(cell.bar, preset.value);
              props.onClose();
            }}
          >
            {timeSignatureLabel(preset.value)}
          </button>
        ))}
      </div>
    </div>
  );
}
