import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  articulationsEqual,
  clampTempo,
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
import { BRUSH_LADDER, brushLabel, sameBrush } from '../lib/durationBrush';
import { TIME_SIGNATURE_PRESETS, timeSignatureLabel } from '../lib/timeSignatures';
import {
  BendIcon,
  DeadIcon,
  DemoIcon,
  ExportIcon,
  HammerIcon,
  HarmonicIcon,
  ImportIcon,
  LetRingIcon,
  LetterIcon,
  MetronomeIcon,
  NewIcon,
  NoteValueIcon,
  PalmMuteIcon,
  PlayIcon,
  PullIcon,
  RedoIcon,
  SlideIcon,
  StarIcon,
  StopIcon,
  UndoIcon,
  VibratoIcon,
} from './icons';

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const BRUSH_ROW = BRUSH_LADDER.slice(0, 5); // whole … 16th

export interface ToolbarProps {
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

function articulationIcon(type: ArticulationType): JSX.Element {
  switch (type) {
    case 'hammerOn':
      return <HammerIcon />;
    case 'pullOff':
      return <PullIcon />;
    case 'slide':
      return <SlideIcon />;
    case 'bend':
      return <BendIcon />;
    case 'vibrato':
      return <VibratoIcon />;
    case 'letRing':
      return <LetRingIcon />;
    case 'palmMute':
      return <PalmMuteIcon />;
    case 'harmonic':
      return <HarmonicIcon />;
    case 'tap':
      return <LetterIcon letter="T" />;
    case 'slap':
      return <LetterIcon letter="S" />;
    case 'pop':
      return <LetterIcon letter="P" />;
    case 'dead':
      return <DeadIcon />;
  }
}

interface VariantPopover {
  type: ArticulationType;
  x: number;
  y: number;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const { state, selection, brush } = props;
  const [tempoText, setTempoText] = useState(String(state.score.tempo));
  const [popover, setPopover] = useState<VariantPopover | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTempoText(String(state.score.tempo));
  }, [state.score.tempo]);

  useEffect(() => {
    if (popover === null) return;
    const close = (event: Event) => {
      if (event instanceof PointerEvent && barRef.current?.contains(event.target as Node)) return;
      setPopover(null);
    };
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        setPopover(null);
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [popover]);

  const commitTempo = () => {
    const parsed = Number(tempoText);
    if (Number.isFinite(parsed) && parsed > 0) {
      props.onTempo(parsed);
      setTempoText(String(clampTempo(parsed)));
    } else {
      setTempoText(String(state.score.tempo));
    }
  };

  const targetCells: readonly Cell[] = selection.length > 0 ? selection : [state.cursor];
  const targetNotes = targetCells
    .map((cell) => noteAt(state.score, cell))
    .filter((n): n is Note => n !== undefined);
  const canArticulate = targetNotes.length > 0;
  const typeActive = (type: ArticulationType) =>
    canArticulate && targetNotes.every((n) => hasArticulation(n.articulations, type));
  const variantActive = (variant: Articulation) =>
    canArticulate &&
    targetNotes.every((n) => {
      const existing = getArticulation(n.articulations, variant.type);
      return existing !== undefined && articulationsEqual(existing, variant);
    });

  const scoreTs = state.score.tracks[0]?.bars[0]?.timeSignature;
  const uniformTs =
    scoreTs !== undefined && state.score.tracks[0]!.bars.every((b) => timeSignatureEquals(b.timeSignature, scoreTs))
      ? scoreTs
      : undefined;

  const openVariants = (type: ArticulationType, anchor: HTMLElement) => {
    setPopover((cur) => {
      if (cur?.type === type) return null;
      const r = anchor.getBoundingClientRect();
      const width = 176;
      const x = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      return { type, x: Math.round(x), y: Math.round(r.bottom + 5) };
    });
  };

  const iconBtn = (
    key: string,
    icon: ReactNode,
    title: string,
    onClick: () => void,
    opts: { active?: boolean; disabled?: boolean } = {},
  ) => (
    <button
      key={key}
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
    <header className="toolbar" ref={barRef}>
      {/* Transport */}
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
        {iconBtn('metro', <MetronomeIcon />, 'Metronome', () => props.onMetronome(!props.metronome), {
          active: props.metronome,
        })}
      </div>

      <div className="tb-divider" />

      {/* File / history */}
      <div className="tb-section">
        {iconBtn('new', <NewIcon />, 'New', props.onNew)}
        {iconBtn('import', <ImportIcon />, 'Import .tabkit.json', () => fileInputRef.current?.click())}
        {iconBtn('export', <ExportIcon />, 'Export .tabkit.json', props.onExport)}
        <span className="tb-mini-divider" />
        {iconBtn('undo', <UndoIcon />, 'Undo', props.onUndo, { disabled: !state.canUndo })}
        {iconBtn('redo', <RedoIcon />, 'Redo', props.onRedo, { disabled: !state.canRedo })}
        <span className="tb-mini-divider" />
        {iconBtn('demo', <DemoIcon />, 'Demo riff', props.onLoadDemo)}
        {iconBtn('showcase', <StarIcon />, 'Feature showcase', props.onLoadShowcase)}
        <button type="button" className="tb-text-chip" title="Nothing Else Matters (intro)" onClick={props.onLoadNothingElse}>
          NEM
        </button>
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

      <div className="tb-divider" />

      {/* Note value */}
      <div className="tb-section tb-labeled">
        <span className="tb-label">Value</span>
        <div className="tb-group">
          {BRUSH_ROW.map((duration) =>
            iconBtn(
              `nv-${String(duration.value)}`,
              <NoteValueIcon value={duration.value} />,
              brushLabel(duration),
              () => props.onBrush(duration),
              { active: sameBrush(brush, duration) },
            ),
          )}
        </div>
      </div>

      <div className="tb-divider" />

      {/* Time signature */}
      <div className="tb-section tb-labeled">
        <span className="tb-label">Time</span>
        <select
          className="tb-select tb-time"
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
      </div>

      <div className="tb-divider" />

      {/* Articulations */}
      <div className="tb-section tb-labeled tb-artic">
        <span className="tb-label">
          Articulations
          <em>{canArticulate ? (selection.length > 0 ? `${String(selection.length)} sel` : 'cursor') : '—'}</em>
        </span>
        <div className="tb-group">
          {ARTICULATION_GROUPS.map((group, gi) => (
            <div key={group.title} className="tb-artic-cluster" title={group.title}>
              {gi > 0 && <span className="tb-mini-divider" />}
              {group.buttons.map((button) => {
                const btn = iconBtn(
                  button.type,
                  articulationIcon(button.type),
                  button.label + (button.variants ? ' ▾' : ''),
                  () => {
                    if (button.variants) {
                      // handled below by anchor click; noop here
                    } else {
                      props.onToggleArticulation(defaultArticulation(button.type));
                    }
                  },
                  { active: typeActive(button.type), disabled: !canArticulate },
                );
                if (!button.variants) return btn;
                return (
                  <button
                    key={button.type}
                    type="button"
                    className={`tb-icon${typeActive(button.type) ? ' active' : ''}${popover?.type === button.type ? ' open' : ''}`}
                    title={`${button.label} ▾`}
                    aria-label={button.label}
                    disabled={!canArticulate}
                    onClick={(e) => {
                      openVariants(button.type, e.currentTarget);
                    }}
                  >
                    {articulationIcon(button.type)}
                    <span className="tb-badge">▾</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="tb-spacer" />
      {props.statusMessage !== null && <span className="tb-status-msg">{props.statusMessage}</span>}

      {popover &&
        (() => {
          const group = ARTICULATION_GROUPS.flatMap((g) => g.buttons).find((b) => b.type === popover.type);
          if (!group?.variants) return null;
          return (
            <div className="tb-popover" style={{ left: popover.x, top: popover.y }} role="menu">
              {group.variants.map((variant) => (
                <button
                  key={variant.label}
                  type="button"
                  className={`tb-menu-item${variantActive(variant.value) ? ' active' : ''}`}
                  onClick={() => {
                    props.onToggleArticulation(variant.value);
                    setPopover(null);
                  }}
                >
                  {variant.label}
                </button>
              ))}
            </div>
          );
        })()}
    </header>
  );
}
