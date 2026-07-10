import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getChord, searchChords } from '@tabkit/core';

export interface ChordInputProps {
  onCommit(frets: readonly (number | null)[]): void;
  onCancel(): void;
}

const MAX_SUGGESTIONS = 7;

/**
 * A minimal type-to-add chord box, floated above the target column. Type a
 * chord name; after the first character a short suggestion list appears.
 * Enter or click inserts the top voicing; Escape or blur cancels.
 */
export function ChordInput(props: ChordInputProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => (query.trim() === '' ? [] : searchChords(query).slice(0, MAX_SUGGESTIONS)), [query]);
  const activeIdx = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = (name: string | undefined) => {
    if (name === undefined) return;
    const voicing = getChord(name)?.voicings[0];
    if (voicing) props.onCommit(voicing.frets);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(results[activeIdx]);
    }
  };

  return (
    <div
      className="chord-input"
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <input
        ref={inputRef}
        className="chord-input-field"
        type="text"
        placeholder="Chord…"
        value={query}
        spellCheck={false}
        autoComplete="off"
        aria-label="Chord name"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={props.onCancel}
      />
      {results.length > 0 && (
        <div className="chord-input-list">
          {results.map((name, i) => (
            <button
              key={name}
              type="button"
              className={`chord-input-item${i === activeIdx ? ' active' : ''}`}
              // Commit on pointer-down: fires before the input's blur, and
              // preventDefault keeps focus so blur→cancel never races the pick.
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                commit(name);
              }}
              onMouseEnter={() => {
                setActive(i);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
