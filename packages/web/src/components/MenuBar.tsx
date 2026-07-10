import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { clampTempo, type EditorState } from '@tabkit/core';
import type { Tone } from '@tabkit/playback';
import {
  ExportIcon,
  ImportIcon,
  KeyboardIcon,
  MetronomeIcon,
  NewIcon,
  NoteValueIcon,
  PlayIcon,
  RedoIcon,
  StopIcon,
  UndoIcon,
} from './icons';

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export interface MenuBarProps {
  state: EditorState;
  tone: Tone;
  speed: number;
  metronome: boolean;
  isPlaying: boolean;
  statusMessage: string | null;
  onTogglePlay(): void;
  onTempo(bpm: number): void;
  onSpeed(speed: number): void;
  onTone(tone: Tone): void;
  onMetronome(on: boolean): void;
  onNew(): void;
  onUndo(): void;
  onRedo(): void;
  onExport(): void;
  onImport(file: File): void;
  onShowShortcuts(): void;
}

export function MenuBar(props: MenuBarProps): JSX.Element {
  const { state } = props;
  const [tempoText, setTempoText] = useState(String(state.score.tempo));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTempoText(String(state.score.tempo));
  }, [state.score.tempo]);

  const commitTempo = () => {
    const parsed = Number(tempoText);
    if (Number.isFinite(parsed) && parsed > 0) {
      props.onTempo(parsed);
      setTempoText(String(clampTempo(parsed)));
    } else {
      setTempoText(String(state.score.tempo));
    }
  };

  const iconBtn = (icon: ReactNode, title: string, onClick: () => void, opts: { active?: boolean; disabled?: boolean } = {}) => (
    <button
      type="button"
      className={`tb-icon${opts.active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={opts.active}
      disabled={opts.disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <header className="menubar">
      <div className="tb-section">
        <button
          type="button"
          className={`tb-play${props.isPlaying ? ' playing' : ''}`}
          onClick={props.onTogglePlay}
        >
          {props.isPlaying ? <StopIcon /> : <PlayIcon />}
          <span>{props.isPlaying ? 'Stop' : 'Play'}</span>
        </button>
        <label className="tb-tempo" title="Tempo (BPM)">
          <NoteValueIcon value={4} size={16} />
          <span className="tb-eq">=</span>
          <input
            type="number"
            min={20}
            max={400}
            value={tempoText}
            onChange={(e) => {
              setTempoText(e.target.value);
            }}
            onBlur={commitTempo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTempo();
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <div className="tb-speed" role="group" aria-label="Playback speed">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`tb-chip${props.speed === speed ? ' active' : ''}`}
              onClick={() => {
                props.onSpeed(speed);
              }}
            >
              {String(speed)}×
            </button>
          ))}
        </div>
        <select
          className="tb-select"
          value={props.tone}
          title="Sound"
          onChange={(e) => {
            props.onTone(e.target.value as Tone);
          }}
        >
          <option value="clean">Clean</option>
          <option value="distortion">Distortion</option>
        </select>
        {iconBtn(<MetronomeIcon />, 'Metronome', () => props.onMetronome(!props.metronome), {
          active: props.metronome,
        })}
      </div>

      <div className="tb-divider" />

      <div className="tb-section">
        {iconBtn(<NewIcon />, 'New', props.onNew)}
        {iconBtn(<ImportIcon />, 'Import .tabkit.json', () => fileInputRef.current?.click())}
        {iconBtn(<ExportIcon />, 'Export .tabkit.json', props.onExport)}
        <span className="tb-mini-divider" />
        {iconBtn(<UndoIcon />, 'Undo', props.onUndo, { disabled: !state.canUndo })}
        {iconBtn(<RedoIcon />, 'Redo', props.onRedo, { disabled: !state.canRedo })}
        <span className="tb-mini-divider" />
        {iconBtn(<KeyboardIcon />, 'Keyboard shortcuts', props.onShowShortcuts)}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onImport(file);
            e.target.value = '';
          }}
        />
      </div>

      {props.statusMessage !== null && <span className="tb-status-msg">{props.statusMessage}</span>}
    </header>
  );
}
