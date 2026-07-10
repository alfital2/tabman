import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { getChord, searchChords } from '@tabkit/core';
import { ChordDiagram } from './ChordDiagram';

export interface ChordPickerProps {
  onPick(frets: readonly (number | null)[]): void;
  onClose(): void;
}

export function ChordPicker(props: ChordPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => searchChords(query), [query]);
  const activeName = selected && results.includes(selected) ? selected : (results[0] ?? null);
  const chord = activeName ? getChord(activeName) : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Own Escape (close) without letting global shortcuts fire behind the modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [props]);

  const move = (delta: number) => {
    if (results.length === 0) return;
    const idx = activeName ? results.indexOf(activeName) : 0;
    const next = results[(idx + delta + results.length) % results.length]!;
    setSelected(next);
    // keep the selected row in view
    requestAnimationFrame(() => {
      listRef.current?.querySelector('.cp-name.active')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const v = chord?.voicings[0];
      if (v) props.onPick(v.frets);
    }
  };

  return (
    <div className="sc-backdrop" onPointerDown={props.onClose}>
      <div
        className="cp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add chord"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
        <header className="sc-head">
          <h2>Add chord</h2>
          <button type="button" className="sc-x" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </header>

        <div className="cp-body">
          <div className="cp-left">
            <input
              ref={inputRef}
              className="cp-search"
              type="text"
              placeholder="Search — e.g. C, Am, G7, Fmaj7"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              onKeyDown={onInputKey}
            />
            <div className="cp-names" ref={listRef}>
              {results.length === 0 && <div className="cp-empty">No chords match “{query}”.</div>}
              {results.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`cp-name${name === activeName ? ' active' : ''}`}
                  onClick={() => {
                    setSelected(name);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="cp-right">
            {chord ? (
              <>
                <div className="cp-chord-title">
                  {chord.name}
                  <span className="cp-count">
                    {chord.voicings.length} voicing{chord.voicings.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="cp-voicings">
                  {chord.voicings.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      className="cp-voicing"
                      title={`${chord.name} — ${v.shape}`}
                      onClick={() => {
                        props.onPick(v.frets);
                      }}
                    >
                      <ChordDiagram voicing={v} size={1.35} />
                      <span className="cp-voicing-label">{v.shape}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="cp-empty">Search for a chord to see its voicings.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
