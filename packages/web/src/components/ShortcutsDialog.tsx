import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  assignKey,
  defaultKeymap,
  KEYMAP_ACTIONS,
  unbindKey,
  type Keymap,
  type KeymapActionId,
} from '../lib/keymap';

export interface ShortcutsDialogProps {
  keymap: Keymap;
  onKeymapChange(keymap: Keymap): void;
  /** Called on close; `dontShowAgain` persists the dismissal. */
  onClose(dontShowAgain: boolean): void;
}

interface Row {
  keys: string[];
  label: string;
}

const EDITING: Row[] = [
  { keys: ['0', '–', '9'], label: 'Type a fret (two digits combine)' },
  { keys: ['←', '→', '↑', '↓'], label: 'Move the cursor' },
  { keys: ['[', ']'], label: 'Note value longer / shorter' },
  { keys: ['+', '−'], label: 'Retime the current note' },
  { keys: ['⌫'], label: 'Delete note / selection' },
  { keys: ['Esc'], label: 'Clear selection' },
];

const PLAYBACK: Row[] = [
  { keys: ['Space'], label: 'Play / Stop (from the cursor)' },
  { keys: ['⌘', 'Z'], label: 'Undo' },
  { keys: ['⌘', '⇧', 'Z'], label: 'Redo' },
  { keys: ['⌘', 'C'], label: 'Copy' },
  { keys: ['⌘', 'V'], label: 'Paste' },
  { keys: ['⌘', 'D'], label: 'Duplicate bar' },
];

function keyList(row: Row): ReactNode {
  return row.keys.map((k, i) => (
    <kbd key={i} className="kbd">
      {k}
    </kbd>
  ));
}

function Section({ title, rows }: { title: string; rows: Row[] }): JSX.Element {
  return (
    <section className="sc-col">
      <h3>{title}</h3>
      <dl>
        {rows.map((row) => (
          <div className="sc-row" key={row.label}>
            <dt>{keyList(row)}</dt>
            <dd>{row.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One rebindable action row: click the key chip, press the new key. */
function BindableRow(props: {
  id: KeymapActionId;
  label: string;
  boundKey: string | null;
  listening: boolean;
  error: string | null;
  onListen(): void;
}): JSX.Element {
  const { id, label, boundKey, listening, error } = props;
  const display = listening ? '…' : boundKey === null ? '—' : boundKey === '.' ? '·' : boundKey;
  return (
    <div className="sc-row" key={id}>
      <dt>
        <button
          type="button"
          className={`kbd sc-bind${listening ? ' listening' : ''}${boundKey === null && !listening ? ' unbound' : ''}`}
          title={listening ? 'Press a key (⌫ clears, Esc cancels)' : `Click to rebind “${label}”`}
          onClick={props.onListen}
        >
          {display}
        </button>
      </dt>
      <dd>
        {label}
        {error !== null && <span className="sc-error"> {error}</span>}
      </dd>
    </div>
  );
}

export function ShortcutsDialog({ keymap, onKeymapChange, onClose }: ShortcutsDialogProps): JSX.Element {
  const [dontShow, setDontShow] = useState(false);
  const [listening, setListening] = useState<KeymapActionId | null>(null);
  const [bindError, setBindError] = useState<{ id: KeymapActionId; message: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Refs so the capture listener (bound once) sees the live values.
  const stateRef = useRef({ dontShow, listening, keymap, onKeymapChange, onClose });
  stateRef.current = { dontShow, listening, keymap, onKeymapChange, onClose };

  // Own the keyboard while open so app shortcuts don't fire behind the
  // dialog. While a chip is listening, the next keypress becomes the binding
  // (Backspace clears, Esc cancels); otherwise Esc closes the dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      const s = stateRef.current;
      if (s.listening === null) {
        if (event.key === 'Escape') {
          event.preventDefault();
          s.onClose(s.dontShow);
        }
        return;
      }
      event.preventDefault();
      if (event.key === 'Escape') {
        setListening(null);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        s.onKeymapChange(unbindKey(s.keymap, s.listening));
        setListening(null);
        setBindError(null);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
      const result = assignKey(s.keymap, s.listening, event.key);
      if (result.keymap) {
        s.onKeymapChange(result.keymap);
        setListening(null);
        setBindError(null);
      } else {
        setBindError({ id: s.listening, message: result.error ?? 'Unavailable' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const bindableSection = (title: string, group: 'rhythm' | 'articulation', lead?: string) => (
    <section className="sc-col">
      <h3>{title}</h3>
      {lead !== undefined && <p className="sc-sublead">{lead}</p>}
      <dl>
        {KEYMAP_ACTIONS.filter((a) => a.group === group).map((action) => (
          <BindableRow
            key={action.id}
            id={action.id}
            label={action.label}
            boundKey={keymap[action.id]}
            listening={listening === action.id}
            error={bindError?.id === action.id ? bindError.message : null}
            onListen={() => {
              setBindError(null);
              setListening((prev) => (prev === action.id ? null : action.id));
            }}
          />
        ))}
        {group === 'articulation' && (
          <div className="sc-row">
            <dt>
              <kbd className="kbd">⇧</kbd>
              <kbd className="kbd">B / S / N</kbd>
            </dt>
            <dd>Cycle bend / slide / harmonic variant</dd>
          </div>
        )}
      </dl>
    </section>
  );

  return (
    <div className="sc-backdrop" onPointerDown={() => onClose(dontShow)}>
      <div
        className="sc-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
        <header className="sc-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="sc-x" aria-label="Close" onClick={() => onClose(dontShow)}>
            ✕
          </button>
        </header>
        <p className="sc-lead">
          Select a note (or drag a selection), then press a key. Click any highlighted key to rebind it — press the
          new key, ⌫ to unbind, Esc to cancel.
        </p>
        <div className="sc-cols">
          <Section title="Editing" rows={EDITING} />
          <Section title="Playback &amp; bars" rows={PLAYBACK} />
          {bindableSection('Note values', 'rhythm', 'Sets the entry value; retimes the selected notes.')}
          {bindableSection('Articulations', 'articulation')}
        </div>
        <footer className="sc-foot">
          <label className="sc-dontshow">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => {
                setDontShow(e.target.checked);
              }}
            />
            <span>Don&apos;t show again</span>
          </label>
          <div className="sc-actions">
            <button
              type="button"
              className="sc-reset"
              onClick={() => {
                setListening(null);
                setBindError(null);
                onKeymapChange(defaultKeymap());
              }}
            >
              Reset to defaults
            </button>
            <button type="button" className="sc-ok" onClick={() => onClose(dontShow)}>
              Got it
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
