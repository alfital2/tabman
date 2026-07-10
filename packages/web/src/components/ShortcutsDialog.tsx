import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

export interface ShortcutsDialogProps {
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

const ARTICULATIONS: Row[] = [
  { keys: ['h'], label: 'Hammer-on' },
  { keys: ['p'], label: 'Pull-off' },
  { keys: ['s'], label: 'Slide' },
  { keys: ['b'], label: 'Bend' },
  { keys: ['v'], label: 'Vibrato' },
  { keys: ['m'], label: 'Palm mute' },
  { keys: ['r'], label: 'Let ring' },
  { keys: ['t'], label: 'Tap' },
  { keys: ['a'], label: 'Slap' },
  { keys: ['o'], label: 'Pop' },
  { keys: ['x'], label: 'Dead note' },
  { keys: ['n'], label: 'Harmonic' },
  { keys: ['⇧', 'B / S / N'], label: 'Cycle bend / slide / harmonic variant' },
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

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps): JSX.Element {
  const [dontShow, setDontShow] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dontShowRef = useRef(dontShow);
  dontShowRef.current = dontShow;

  // Own the keyboard while open so shortcuts don't fire behind it; Esc closes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(dontShowRef.current);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

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
        <p className="sc-lead">Select a note (or drag a selection), then press a key to apply an articulation.</p>
        <div className="sc-cols">
          <Section title="Editing" rows={EDITING} />
          <Section title="Playback &amp; bars" rows={PLAYBACK} />
          <Section title="Articulations" rows={ARTICULATIONS} />
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
          <button type="button" className="sc-ok" onClick={() => onClose(dontShow)}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
