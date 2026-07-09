import { useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { beatAt, isRest, type Duration, type EditorState, type TimeSignature } from '@tabkit/core';
import type { HitCell } from '@tabkit/render';
import { BRUSH_LADDER, brushGlyph, brushLabel } from '../lib/durationBrush';
import { BAR_TIME_SIGNATURE_PRESETS, timeSignatureLabel } from '../lib/timeSignatures';
import type { ClipboardContent } from '../lib/clipboard';

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
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && menuRef.current?.contains(event.target as Node)) return;
      props.onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('wheel', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
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
      {showDurations && (
        <>
          <div className="menu-separator" />
          <div className="menu-row-label">Note duration</div>
          <div className="menu-row">
            {DURATION_ROW.map((duration) => (
              <button
                key={duration.value}
                type="button"
                className="menu-chip"
                title={brushLabel(duration)}
                onClick={() => {
                  props.onSetDuration(cell, duration);
                  props.onClose();
                }}
              >
                {brushGlyph(duration)}
              </button>
            ))}
          </div>
        </>
      )}
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
