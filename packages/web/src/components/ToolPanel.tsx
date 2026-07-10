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
import { ARTICULATION_GROUPS } from '../lib/articulations';
import { BRUSH_LADDER, brushLabel, sameBrush } from '../lib/durationBrush';
import { TIME_SIGNATURE_PRESETS, timeSignatureLabel } from '../lib/timeSignatures';
import {
  BendIcon,
  DeadIcon,
  HammerIcon,
  HarmonicIcon,
  LetRingIcon,
  LetterIcon,
  NoteValueIcon,
  PalmMuteIcon,
  PullIcon,
  SlideIcon,
  VibratoIcon,
} from './icons';

const BRUSH_ROW = BRUSH_LADDER.slice(0, 5); // whole … 16th

export interface ToolPanelProps {
  state: EditorState;
  selection: readonly Cell[];
  brush: Duration;
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

export function ToolPanel(props: ToolPanelProps): JSX.Element {
  const { state, selection, brush } = props;
  const [popover, setPopover] = useState<VariantPopover | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (popover === null) return;
    const close = (event: Event) => {
      if (event instanceof PointerEvent && panelRef.current?.contains(event.target as Node)) return;
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
      // Open to the LEFT of the right-docked panel, clamped to the viewport.
      const x = Math.max(8, Math.min(r.left - width - 6, window.innerWidth - width - 8));
      const y = Math.min(r.top, window.innerHeight - 8 - 40);
      return { type, x: Math.round(x), y: Math.round(Math.max(8, y)) };
    });
  };

  return (
    <aside className="toolpanel" ref={panelRef}>
      <section className="tp-section">
        <h3>Note value</h3>
        <div className="tp-grid">
          {BRUSH_ROW.map((duration) => (
            <button
              key={duration.value}
              type="button"
              className={`tb-icon${sameBrush(brush, duration) ? ' active' : ''}`}
              title={brushLabel(duration)}
              aria-label={brushLabel(duration)}
              onClick={() => {
                props.onBrush(duration);
              }}
            >
              <NoteValueIcon value={duration.value} />
            </button>
          ))}
        </div>
      </section>

      <section className="tp-section">
        <h3>Time signature</h3>
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
      </section>

      <section className="tp-section">
        <h3>
          Articulations
          <span className="tp-target">{canArticulate ? (selection.length > 0 ? `${String(selection.length)} sel` : 'cursor') : '—'}</span>
        </h3>
        {ARTICULATION_GROUPS.map((group) => (
          <div key={group.title} className="tp-artic-group">
            <h4>{group.title}</h4>
            <div className="tp-grid">
              {group.buttons.map((button) => {
                if (!button.variants) {
                  return (
                    <button
                      key={button.type}
                      type="button"
                      className={`tb-icon${typeActive(button.type) ? ' active' : ''}`}
                      title={button.label}
                      aria-label={button.label}
                      disabled={!canArticulate}
                      onClick={() => {
                        props.onToggleArticulation(defaultArticulation(button.type));
                      }}
                    >
                      {articulationIcon(button.type)}
                    </button>
                  );
                }
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
          </div>
        ))}
      </section>

      {popover &&
        (() => {
          const button = ARTICULATION_GROUPS.flatMap((g) => g.buttons).find((b) => b.type === popover.type);
          if (!button?.variants) return null;
          return (
            <div className="tb-popover" style={{ left: popover.x, top: popover.y }} role="menu">
              {button.variants.map((variant) => (
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
    </aside>
  );
}
