import type { JSX } from 'react';
import { midiToName, tuningName, type Score, type ScoreMetaPatch } from '@tabkit/core';

export interface SheetHeaderProps {
  score: Score;
  onMeta(patch: ScoreMetaPatch): void;
}

export function SheetHeader({ score, onMeta }: SheetHeaderProps): JSX.Element {
  const track = score.tracks[0];
  const tuningLabel = track
    ? `${tuningName(track.tuning)} · ${[...track.tuning]
        .reverse()
        .map((midi) => midiToName(midi).replace(/-?\d+$/, ''))
        .join('')}`
    : '';

  return (
    <header className="sheet-header">
      <input
        className="sheet-title"
        value={score.title}
        placeholder="Title"
        aria-label="Title"
        onChange={(e) => {
          onMeta({ title: e.target.value });
        }}
      />
      <input
        className="sheet-subtitle"
        value={score.subtitle}
        placeholder="Subtitle"
        aria-label="Subtitle"
        onChange={(e) => {
          onMeta({ subtitle: e.target.value });
        }}
      />
      <div className="sheet-meta-row">
        <input
          className="sheet-composer"
          value={score.composer}
          placeholder="Composer"
          aria-label="Composer"
          onChange={(e) => {
            onMeta({ composer: e.target.value });
          }}
        />
        <span className="sheet-tuning" title="Tuning">
          {tuningLabel}
        </span>
      </div>
    </header>
  );
}
