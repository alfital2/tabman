import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import {
  articulationsEqual,
  defaultArticulation,
  getArticulation,
  hasArticulation,
  noteAt,
  timeSignatureEquals,
  type Articulation,
  type ArticulationType,
  type Cell,
  type Duration,
  type EditorState,
  type Note,
  type TimeSignature,
} from '@tabkit/core';
import type { Tone } from '@tabkit/playback';
import { ARTICULATION_GROUPS } from '../lib/articulations';
import { BRUSH_LADDER, brushGlyph, brushLabel, sameBrush } from '../lib/durationBrush';
import { TIME_SIGNATURE_PRESETS, timeSignatureLabel } from '../lib/timeSignatures';

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const BRUSH_ROW = BRUSH_LADDER.slice(0, 5); // whole … 16th

export interface SidePanelProps {
  state: EditorState;
  selection: readonly Cell[];
  brush: Duration;
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
  onLoadDemo(): void;
  onLoadShowcase(): void;
  onLoadNothingElse(): void;
  onUndo(): void;
  onRedo(): void;
  onExport(): void;
  onImport(file: File): void;
  onBrush(duration: Duration): void;
  onScoreTimeSignature(ts: TimeSignature): void;
  onToggleArticulation(articulation: Articulation): void;
}

export function SidePanel(props: SidePanelProps): JSX.Element {
  const { state, selection, brush } = props;
  const [tempoText, setTempoText] = useState(String(state.score.tempo));
  const [openPopover, setOpenPopover] = useState<ArticulationType | null>(null);
  const articulationsRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTempoText(String(state.score.tempo));
  }, [state.score.tempo]);

  useEffect(() => {
    if (openPopover === null) return;
    const close = (event: PointerEvent) => {
      if (articulationsRef.current?.contains(event.target as Node)) return;
      setOpenPopover(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
    };
  }, [openPopover]);

  const commitTempo = () => {
    const parsed = Number(tempoText);
    if (Number.isFinite(parsed) && parsed > 0) {
      props.onTempo(parsed);
    } else {
      setTempoText(String(state.score.tempo));
    }
  };

  const targetCells: readonly Cell[] = selection.length > 0 ? selection : [state.cursor];
  const targetNotes = targetCells
    .map((cell) => noteAt(state.score, cell))
    .filter((n): n is Note => n !== undefined);
  const typeActive = (type: ArticulationType) =>
    targetNotes.length > 0 && targetNotes.every((n) => hasArticulation(n.articulations, type));
  const variantActive = (variant: Articulation) =>
    targetNotes.length > 0 &&
    targetNotes.every((n) => {
      const existing = getArticulation(n.articulations, variant.type);
      return existing !== undefined && articulationsEqual(existing, variant);
    });

  const scoreTs = state.score.tracks[0]?.bars[0]?.timeSignature;
  const uniformTs =
    scoreTs !== undefined && state.score.tracks[0]!.bars.every((b) => timeSignatureEquals(b.timeSignature, scoreTs))
      ? scoreTs
      : undefined;

  const cursorBeatHasNote = targetNotes.length > 0;

  return (
    <aside className="side-panel">
      <h1 className="brand">TabKit</h1>

      <section className="panel-section">
        <h2>Playback</h2>
        <button type="button" className={`play-button${props.isPlaying ? ' playing' : ''}`} onClick={props.onTogglePlay}>
          {props.isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <label className="field">
          <span>Tempo</span>
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
        <div className="field">
          <span>Speed</span>
          <div className="chip-row">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={`chip${props.speed === speed ? ' active' : ''}`}
                onClick={() => {
                  props.onSpeed(speed);
                }}
              >
                {String(speed)}×
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Sound</span>
          <select
            value={props.tone}
            onChange={(e) => {
              props.onTone(e.target.value as Tone);
            }}
          >
            <option value="clean">Classic (clean)</option>
            <option value="distortion">Distortion</option>
          </select>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={props.metronome}
            onChange={(e) => {
              props.onMetronome(e.target.checked);
            }}
          />
          <span>Metronome</span>
        </label>
      </section>

      <section className="panel-section">
        <h2>File</h2>
        <div className="chip-row">
          <button type="button" className="chip" onClick={props.onNew}>
            New
          </button>
          <button type="button" className="chip" onClick={props.onLoadDemo}>
            Demo riff
          </button>
        </div>
        <div className="chip-row">
          <button type="button" className="chip" disabled={!state.canUndo} onClick={props.onUndo}>
            ↶ Undo
          </button>
          <button type="button" className="chip" disabled={!state.canRedo} onClick={props.onRedo}>
            Redo ↷
          </button>
        </div>
        <button type="button" className="chip wide" onClick={props.onLoadShowcase}>
          ✦ Load feature showcase
        </button>
        <button type="button" className="chip wide" onClick={props.onLoadNothingElse}>
          ♪ Nothing Else Matters (intro)
        </button>
        <div className="chip-row">
          <button type="button" className="chip" onClick={props.onExport}>
            ⤓ Export
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            ⤒ Import
          </button>
          <input
            ref={fileRef}
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
        {props.statusMessage !== null && <div className="status-message">{props.statusMessage}</div>}
      </section>

      <section className="panel-section">
        <h2>Note value</h2>
        <div className="chip-row">
          {BRUSH_ROW.map((duration) => (
            <button
              key={duration.value}
              type="button"
              title={brushLabel(duration)}
              className={`chip glyph${sameBrush(brush, duration) ? ' active' : ''}`}
              onClick={() => {
                props.onBrush(duration);
              }}
            >
              {brushGlyph(duration)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h2>Time signature</h2>
        <select
          value={uniformTs ? timeSignatureLabel(uniformTs) : ''}
          onChange={(e) => {
            const preset = TIME_SIGNATURE_PRESETS.find((p) => p.label === e.target.value);
            if (preset) props.onScoreTimeSignature(preset.value);
          }}
        >
          {uniformTs === undefined && <option value="">mixed</option>}
          {TIME_SIGNATURE_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.label}>
              {preset.label}
            </option>
          ))}
        </select>
      </section>

      <section className="panel-section" ref={articulationsRef}>
        <h2>
          Articulations
          <span className="target-label">{selection.length > 0 ? `${String(selection.length)} selected` : 'cursor'}</span>
        </h2>
        {!cursorBeatHasNote && <div className="hint">Put the cursor on a note (or select notes) to articulate.</div>}
        {ARTICULATION_GROUPS.map((group) => (
          <div key={group.title} className="articulation-group">
            <h3>{group.title}</h3>
            <div className="chip-row wrap">
              {group.buttons.map((button) => (
                <div key={button.type} className="popover-anchor">
                  <button
                    type="button"
                    className={`chip${typeActive(button.type) ? ' active' : ''}`}
                    disabled={targetNotes.length === 0}
                    onClick={() => {
                      if (button.variants) {
                        setOpenPopover((open) => (open === button.type ? null : button.type));
                      } else {
                        props.onToggleArticulation(defaultArticulation(button.type));
                      }
                    }}
                  >
                    {button.label}
                  </button>
                  {button.variants && openPopover === button.type && (
                    <div className="popover">
                      {button.variants.map((variant) => (
                        <button
                          key={variant.label}
                          type="button"
                          className={`chip${variantActive(variant.value) ? ' active' : ''}`}
                          onClick={() => {
                            props.onToggleArticulation(variant.value);
                            setOpenPopover(null);
                          }}
                        >
                          {variant.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </aside>
  );
}
