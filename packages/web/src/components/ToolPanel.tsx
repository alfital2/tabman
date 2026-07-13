import type { JSX } from 'react';
import {
  articulationsEqual,
  defaultArticulation,
  getArticulation,
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
import { bendLabel } from '@tabkit/render';
import { ARTICULATION_GROUPS } from '../lib/articulations';
import { keyForAction, type Keymap } from '../lib/keymap';
import { beatAt, TUPLET_COUNTS } from '@tabkit/core';
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

const BRUSH_ROW = BRUSH_LADDER; // whole … 64th

export interface ToolPanelProps {
  state: EditorState;
  selection: readonly Cell[];
  brush: Duration;
  keymap: Keymap;
  onBrush(duration: Duration): void;
  /** Set the dot count on the brush + targeted beats (0 clears). */
  onDots(dots: 0 | 1 | 2): void;
  /** Split targeted beat(s) into an n-tuplet. */
  onTuplet(actual: number): void;
  /** Dissolve the tuplet group under the target(s). */
  onRemoveTuplet(): void;
  onScoreTimeSignature(ts: TimeSignature): void;
  onToggleArticulation(articulation: Articulation): void;
}

function articulationIcon(type: ArticulationType): JSX.Element {
  switch (type) {
    case 'hammerOn':
      return <HammerIcon size={20} />;
    case 'pullOff':
      return <PullIcon size={20} />;
    case 'slide':
      return <SlideIcon size={20} />;
    case 'bend':
      return <BendIcon size={20} />;
    case 'vibrato':
      return <VibratoIcon size={20} />;
    case 'letRing':
      return <LetRingIcon size={20} />;
    case 'palmMute':
      return <PalmMuteIcon size={20} />;
    case 'harmonic':
      return <HarmonicIcon size={20} />;
    case 'tap':
      return <LetterIcon letter="T" size={20} />;
    case 'slap':
      return <LetterIcon letter="S" size={20} />;
    case 'pop':
      return <LetterIcon letter="P" size={20} />;
    case 'dead':
      return <DeadIcon size={20} />;
  }
}

/** Short caption shown under each articulation button. */
function articulationCaption(a: Articulation): string {
  switch (a.type) {
    case 'bend':
      return bendLabel(a.amount);
    case 'slide':
      switch (a.style) {
        case 'legato':
          return 'Legato';
        case 'shift':
          return 'Shift';
        case 'inBelow':
          return 'In ↑';
        case 'inAbove':
          return 'In ↓';
        case 'outDown':
          return 'Out ↓';
        case 'outUp':
          return 'Out ↑';
      }
      return 'Slide';
    case 'harmonic':
      switch (a.kind) {
        case 'natural':
          return 'Nat ◇';
        case 'artificial':
          return 'A.H.';
        case 'pinch':
          return 'P.H.';
        case 'tap':
          return 'T.H.';
      }
      return 'Harm';
    case 'hammerOn':
      return 'Hammer';
    case 'pullOff':
      return 'Pull';
    case 'vibrato':
      return 'Vibrato';
    case 'letRing':
      return 'Let ring';
    case 'palmMute':
      return 'Palm mute';
    case 'tap':
      return 'Tap';
    case 'slap':
      return 'Slap';
    case 'pop':
      return 'Pop';
    case 'dead':
      return 'Dead';
  }
}

/** Every articulation in a group, with its variants expanded into one-click buttons. */
function groupEntries(group: (typeof ARTICULATION_GROUPS)[number]): Articulation[] {
  return group.buttons.flatMap((b) => (b.variants ? b.variants.map((v) => v.value) : [defaultArticulation(b.type)]));
}

export function ToolPanel(props: ToolPanelProps): JSX.Element {
  const { state, selection, brush, keymap } = props;

  const targetCells: readonly Cell[] = selection.length > 0 ? selection : [state.cursor];
  const targetNotes = targetCells
    .map((cell) => noteAt(state.score, cell))
    .filter((n): n is Note => n !== undefined);
  const canArticulate = targetNotes.length > 0;
  const isActive = (a: Articulation) =>
    canArticulate &&
    targetNotes.every((n) => {
      const existing = getArticulation(n.articulations, a.type);
      return existing !== undefined && articulationsEqual(existing, a);
    });

  // Anchor beat for dot/tuplet button states: first selected beat, else cursor.
  const anchorCell = targetCells[0]!;
  const anchorBeat = beatAt(state.score, anchorCell.bar, anchorCell.beat);
  const activeDots = anchorBeat?.duration.dots ?? brush.dots;
  const activeTuplet = anchorBeat?.duration.tuplet ?? null;

  const scoreTs = state.score.tracks[0]?.bars[0]?.timeSignature;
  const uniformTs =
    scoreTs !== undefined && state.score.tracks[0]!.bars.every((b) => timeSignatureEquals(b.timeSignature, scoreTs))
      ? scoreTs
      : undefined;

  return (
    <aside className="toolpanel">
      <section className="tp-section">
        <h3>Note value</h3>
        <div className="tp-grid">
          {BRUSH_ROW.map((duration) => {
            const key = keyForAction(keymap, `rhythm.${duration.value}`);
            return (
              <button
                key={duration.value}
                type="button"
                className={`tb-icon${sameBrush(brush, duration) ? ' active' : ''}`}
                title={key === null ? brushLabel(duration) : `${brushLabel(duration)} · key ${key}`}
                aria-label={brushLabel(duration)}
                onClick={() => {
                  props.onBrush(duration);
                }}
              >
                <NoteValueIcon value={duration.value} />
              </button>
            );
          })}
          {([1, 2] as const).map((dots) => (
            <button
              key={`dot${dots}`}
              type="button"
              className={`tb-icon tp-dot${activeDots === dots ? ' active' : ''}`}
              title={`${dots === 1 ? 'Dotted' : 'Double-dotted'} (· cycles)`}
              aria-label={dots === 1 ? 'Dotted' : 'Double dotted'}
              aria-pressed={activeDots === dots}
              onClick={() => {
                props.onDots(activeDots === dots ? 0 : dots);
              }}
            >
              {dots === 1 ? '·' : '··'}
            </button>
          ))}
        </div>
      </section>

      <section className="tp-section">
        <h3>Tuplets</h3>
        <div className="tp-grid">
          {TUPLET_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`tb-icon tp-tuplet${activeTuplet?.actual === n ? ' active' : ''}`}
              title={`${String(n)}-tuplet · Ctrl+${String(n)}`}
              aria-label={`${String(n)}-tuplet`}
              disabled={anchorBeat === undefined}
              onClick={() => {
                props.onTuplet(n);
              }}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="tb-icon tp-tuplet"
            title="Remove tuplet · Ctrl+1"
            aria-label="Remove tuplet"
            disabled={activeTuplet === null}
            onClick={() => {
              props.onRemoveTuplet();
            }}
          >
            ✕
          </button>
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
            <div className="tp-artic-grid">
              {groupEntries(group).map((a) => {
                const caption = articulationCaption(a);
                const active = isActive(a);
                const key = keyForAction(keymap, `articulation.${a.type}`) ?? undefined;
                const variantType = a.type === 'bend' || a.type === 'slide' || a.type === 'harmonic';
                const title = key
                  ? `${caption} · key ${key}${variantType ? ` (⇧${key.toUpperCase()} cycles)` : ''}`
                  : caption;
                return (
                  <button
                    key={`${a.type}-${caption}`}
                    type="button"
                    className={`tp-artbtn${active ? ' active' : ''}`}
                    title={title}
                    aria-label={caption}
                    aria-pressed={active}
                    disabled={!canArticulate}
                    onClick={() => {
                      props.onToggleArticulation(a);
                    }}
                  >
                    {articulationIcon(a.type)}
                    <span className="tp-cap">{caption}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </aside>
  );
}
