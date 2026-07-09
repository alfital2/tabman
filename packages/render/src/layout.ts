import {
  barCapacityInWholes,
  barFilledInWholes,
  compareFractions,
  getArticulation,
  timeSignatureEquals,
  type Bar,
  type BendAmount,
  type Beat,
  type Note,
  type Score,
} from '@tabkit/core';
import {
  ARTICULATION_FONT_SIZE,
  BEAM_SPACING,
  DEFAULT_METRICS,
  MARGIN_BOTTOM,
  STEM_DROP,
  TIME_SIGNATURE_WIDTH,
  type Metrics,
} from './metrics';
import type { BeatBox, Primitive, TrackSystem } from './primitives';

export interface LayoutOptions {
  /** Wrap bars onto new systems to fit this width. Infinity/0/undefined = never wrap. */
  fillToWidth?: number;
  /** Pad the page with blank ruled systems down to this height. */
  fillToHeight?: number;
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly primitives: readonly Primitive[];
  /** Rendered beats — hit-testing clicks on notes. */
  readonly beats: readonly BeatBox[];
  /** Every cursor landing spot: each beat, plus the append slot of unfilled bars. */
  readonly slots: readonly BeatBox[];
  readonly systems: readonly TrackSystem[];
  readonly stringGap: number;
}

const TRACK = 0;
const VOICE = 0;

interface BarPlan {
  index: number;
  bar: Bar;
  showTimeSignature: boolean;
  hasAppendSlot: boolean;
  width: number;
}

interface PlacedBar extends BarPlan {
  x: number;
}

interface NotePlacement {
  x: number;
  y: number;
  note: Note;
  systemTop: number;
  systemBottom: number;
  barIndex: number;
  beatIndex: number;
}

export function bendLabel(amount: BendAmount): string {
  switch (amount) {
    case 0.25:
      return '¼';
    case 0.5:
      return '½';
    case 0.75:
      return '¾';
    case 1:
      return 'full';
    case 1.5:
      return '1½';
    case 2:
      return '2';
  }
}

function hasOpenAppendSlot(bar: Bar): boolean {
  return compareFractions(barFilledInWholes(bar), barCapacityInWholes(bar.timeSignature)) < 0;
}

function beats(bar: Bar): readonly Beat[] {
  return bar.voices[VOICE]?.beats ?? [];
}

/** 8th = 1 beam, 16th = 2, 32nd = 3, 64th = 4; longer values don't beam. */
function beamLevels(beat: Beat): number {
  switch (beat.duration.value) {
    case 8:
      return 1;
    case 16:
      return 2;
    case 32:
      return 3;
    case 64:
      return 4;
    default:
      return 0;
  }
}

export function layoutScore(score: Score, metrics: Metrics = DEFAULT_METRICS, options: LayoutOptions = {}): Layout {
  const m = metrics;
  const track = score.tracks[TRACK];
  const stringCount = track ? track.tuning.length : 6;
  const staffHeight = (stringCount - 1) * m.staffLineGap;
  const originX = m.marginX + m.clefWidth;

  const rawFill = options.fillToWidth;
  const fillWidth = rawFill !== undefined && Number.isFinite(rawFill) && rawFill > 0 ? rawFill : Infinity;

  const bars = track ? track.bars : [];

  // Pass 1: per-bar plans (width, whether the time signature is shown).
  const plans: BarPlan[] = bars.map((bar, index) => {
    const prev = bars[index - 1];
    const showTimeSignature = index === 0 || (prev !== undefined && !timeSignatureEquals(prev.timeSignature, bar.timeSignature));
    const appendSlot = hasOpenAppendSlot(bar);
    const slotCount = Math.max(1, beats(bar).length + (appendSlot ? 1 : 0));
    const width =
      m.barStartPad + (showTimeSignature ? TIME_SIGNATURE_WIDTH : 0) + slotCount * m.beatWidth + m.barEndPad;
    return { index, bar, showTimeSignature, hasAppendSlot: appendSlot, width };
  });

  // Pass 2: flow bars into systems. A system always takes at least one bar so
  // a too-narrow container can never loop forever.
  const systemsOfBars: PlacedBar[][] = [];
  let current: PlacedBar[] = [];
  let x = originX;
  for (const plan of plans) {
    if (current.length > 0 && x + plan.width > fillWidth - m.marginX) {
      systemsOfBars.push(current);
      current = [];
      x = originX;
    }
    current.push({ ...plan, x });
    x += plan.width;
  }
  if (current.length > 0) systemsOfBars.push(current);

  const primitives: Primitive[] = [];
  const beatBoxes: BeatBox[] = [];
  const slotBoxes: BeatBox[] = [];
  const systems: TrackSystem[] = [];
  const notePlacements: NotePlacement[] = [];
  /** bar:beat:string -> placement, for two-beat ornaments (slides). */
  const placementIndex = new Map<string, NotePlacement>();

  const systemAdvance = staffHeight + m.systemGap;
  let top = m.marginTop;
  let contentRight = originX + m.beatWidth; // widest content seen

  const drawSystemChrome = (systemTop: number, endX: number): number[] => {
    const stringYs: number[] = [];
    for (let s = 0; s < stringCount; s++) {
      const y = systemTop + s * m.staffLineGap;
      stringYs.push(y);
      primitives.push({ kind: 'line', role: 'staff', x1: originX, y1: y, x2: endX, y2: y });
    }
    // Opening barline + TAB clef letters down the margin.
    primitives.push({
      kind: 'line',
      role: 'barline',
      x1: originX,
      y1: systemTop,
      x2: originX,
      y2: systemTop + staffHeight,
    });
    const clefX = m.marginX + m.clefWidth / 2 - 2;
    const clefSize = m.staffLineGap * 1.15;
    const mid = systemTop + staffHeight / 2;
    (['T', 'A', 'B'] as const).forEach((letter, i) => {
      primitives.push({
        kind: 'text',
        role: 'clef',
        x: clefX,
        y: mid + (i - 1) * clefSize,
        text: letter,
        fontSize: clefSize,
        anchor: 'middle',
        baseline: 'middle',
      });
    });
    return stringYs;
  };

  for (const systemBars of systemsOfBars) {
    const last = systemBars[systemBars.length - 1]!;
    const endX = last.x + last.width;
    contentRight = Math.max(contentRight, endX);
    const stringYs = drawSystemChrome(top, endX);
    systems.push({ track: TRACK, top, stringYs });
    const bottom = top + staffHeight;
    const railY = bottom + STEM_DROP;

    for (const placed of systemBars) {
      const { bar, index: barIndex } = placed;
      const barBeats = beats(bar);

      // Measure number above the bar start.
      primitives.push({
        kind: 'text',
        role: 'measureNumber',
        x: placed.x + 2,
        y: top - 7,
        text: String(barIndex + 1),
        fontSize: m.measureNumberFontSize,
        anchor: 'start',
        baseline: 'middle',
      });

      let contentX = placed.x + m.barStartPad;
      if (placed.showTimeSignature) {
        const tsX = placed.x + m.barStartPad / 2 + TIME_SIGNATURE_WIDTH / 2;
        const tsSize = m.staffLineGap * 1.7;
        primitives.push({
          kind: 'text',
          role: 'timeSignature',
          x: tsX,
          y: top + staffHeight / 2 - m.staffLineGap * 0.95,
          text: String(bar.timeSignature.numerator),
          fontSize: tsSize,
          anchor: 'middle',
          baseline: 'middle',
        });
        primitives.push({
          kind: 'text',
          role: 'timeSignature',
          x: tsX,
          y: top + staffHeight / 2 + m.staffLineGap * 0.95,
          text: String(bar.timeSignature.denominator),
          fontSize: tsSize,
          anchor: 'middle',
          baseline: 'middle',
        });
        contentX += TIME_SIGNATURE_WIDTH;
      }

      // Closing barline.
      primitives.push({
        kind: 'line',
        role: 'barline',
        x1: placed.x + placed.width,
        y1: top,
        x2: placed.x + placed.width,
        y2: bottom,
      });

      const boxRect = (cx: number) => ({
        x: cx - m.beatWidth / 2,
        y: top - m.staffLineGap,
        width: m.beatWidth,
        height: staffHeight + m.staffLineGap * 2,
      });

      // Rhythm rail bookkeeping for the beam pass.
      const stemsAtLevel: Array<{ cx: number; levels: number } | null> = [];

      barBeats.forEach((beat, beatIndex) => {
        const cx = contentX + beatIndex * m.beatWidth + m.beatWidth / 2;
        const box: BeatBox = { path: { track: TRACK, bar: barIndex, voice: VOICE, beat: beatIndex }, rect: boxRect(cx) };
        beatBoxes.push(box);
        slotBoxes.push(box);

        // Stems: none for wholes, half-length for halves, full otherwise.
        const value = beat.duration.value;
        if (value >= 2) {
          const stemTop = bottom + 3;
          const stemBottom = value === 2 ? bottom + 3 + (STEM_DROP - 3) / 2 : railY;
          primitives.push({ kind: 'line', role: 'stem', x1: cx, y1: stemTop, x2: cx, y2: stemBottom });
        }
        if (beat.duration.dots > 0) {
          for (let dot = 0; dot < beat.duration.dots; dot++) {
            primitives.push({ kind: 'ellipse', role: 'dot', cx: cx + 3.5 + dot * 4, cy: railY - 1.5, rx: 1.4, ry: 1.4, filled: true });
          }
        }
        stemsAtLevel.push({ cx, levels: beamLevels(beat) });

        if (beat.notes.length === 0) {
          // Rest: a hollow marker on the middle of the staff.
          primitives.push({
            kind: 'ellipse',
            role: 'dot',
            cx,
            cy: top + staffHeight / 2,
            rx: 2.6,
            ry: 1.9,
            filled: false,
          });
          return;
        }

        for (const note of beat.notes) {
          const y = stringYs[Math.min(note.string, stringCount - 1)]!;
          const isDead = getArticulation(note.articulations, 'dead') !== undefined;
          const text = isDead ? 'x' : String(note.fret);
          const bgWidth = text.length * m.fretFontSize * 0.62 + 2.5;
          primitives.push({
            kind: 'rect',
            role: 'fretBackground',
            x: cx - bgWidth / 2,
            y: y - m.fretFontSize / 2 - 0.5,
            width: bgWidth,
            height: m.fretFontSize + 1,
          });
          primitives.push({
            kind: 'text',
            role: 'fret',
            x: cx,
            y,
            text,
            fontSize: m.fretFontSize,
            anchor: 'middle',
            baseline: 'middle',
          });
          const placement: NotePlacement = {
            x: cx,
            y,
            note,
            systemTop: top,
            systemBottom: bottom,
            barIndex,
            beatIndex,
          };
          notePlacements.push(placement);
          placementIndex.set(`${String(barIndex)}:${String(beatIndex)}:${String(note.string)}`, placement);
        }
      });

      // Beams: consecutive eighth-or-shorter beats join; anything longer (or a
      // bar boundary) breaks the run. Isolated beamable beats get a beamlet.
      let run: Array<{ cx: number; levels: number }> = [];
      const flushRun = () => {
        if (run.length === 1) {
          const solo = run[0]!;
          for (let level = 1; level <= solo.levels; level++) {
            const y = railY - (level - 1) * BEAM_SPACING;
            primitives.push({ kind: 'line', role: 'beam', x1: solo.cx, y1: y, x2: solo.cx + m.beatWidth * 0.32, y2: y });
          }
        } else if (run.length > 1) {
          for (let i = 0; i < run.length - 1; i++) {
            const a = run[i]!;
            const b = run[i + 1]!;
            const shared = Math.min(a.levels, b.levels);
            for (let level = 1; level <= shared; level++) {
              const y = railY - (level - 1) * BEAM_SPACING;
              primitives.push({ kind: 'line', role: 'beam', x1: a.cx, y1: y, x2: b.cx, y2: y });
            }
          }
        }
        run = [];
      };
      for (const stem of stemsAtLevel) {
        if (stem && stem.levels > 0) {
          run.push(stem);
        } else {
          flushRun();
        }
      }
      flushRun();

      if (placed.hasAppendSlot) {
        const cx = contentX + barBeats.length * m.beatWidth + m.beatWidth / 2;
        slotBoxes.push({
          path: { track: TRACK, bar: barIndex, voice: VOICE, beat: barBeats.length },
          rect: boxRect(cx),
        });
      }
    }

    top += systemAdvance;
  }

  // Ornament post-pass (may span two beats).
  emitOrnaments(primitives, placementIndex, notePlacements, m);

  let height = top - m.systemGap + staffHeight + MARGIN_BOTTOM;

  const width = Number.isFinite(fillWidth) ? fillWidth : contentRight + m.marginX;

  // Fill remaining vertical space with blank ruled systems (notebook paper).
  const fillHeight = options.fillToHeight;
  if (fillHeight !== undefined && Number.isFinite(fillHeight) && fillHeight > 0) {
    while (height + systemAdvance <= fillHeight) {
      const stringYs = drawSystemChrome(top, width - m.marginX);
      systems.push({ track: TRACK, top, stringYs });
      top += systemAdvance;
      height = top - m.systemGap + staffHeight + MARGIN_BOTTOM;
    }
    height = Math.max(height, fillHeight);
  }

  return {
    width,
    height,
    primitives,
    beats: beatBoxes,
    slots: slotBoxes,
    systems,
    stringGap: m.staffLineGap,
  };
}

function emitOrnaments(
  primitives: Primitive[],
  placementIndex: Map<string, NotePlacement>,
  placements: readonly NotePlacement[],
  m: Metrics,
): void {
  for (const p of placements) {
    const { note, x, y } = p;
    const labels: string[] = [];
    let labelLift = 0.8;

    for (const art of note.articulations) {
      switch (art.type) {
        case 'hammerOn':
          labels.push('h');
          break;
        case 'pullOff':
          labels.push('p');
          break;
        case 'palmMute':
          labels.push('PM');
          break;
        case 'letRing':
          labels.push('lr');
          break;
        case 'tap':
          labels.push('T');
          break;
        case 'slap':
          labels.push('S');
          break;
        case 'pop':
          labels.push('P');
          break;
        case 'harmonic':
          labels.push(art.kind === 'natural' ? '◇' : art.kind === 'artificial' ? 'A.H.' : art.kind === 'pinch' ? 'P.H.' : 'T.H.');
          break;
        case 'dead':
          break; // drawn as the 'x' notehead
        case 'vibrato': {
          const y0 = y - m.staffLineGap * 0.8;
          const d = `M ${String(x - 8)} ${String(y0)} q 2 -3 4 0 t 4 0 t 4 0 t 4 0`;
          primitives.push({ kind: 'path', role: 'vibrato', d });
          labelLift = 1.6;
          break;
        }
        case 'bend': {
          const tipX = x + 9;
          const tipY = y - m.staffLineGap * 1.5;
          primitives.push({
            kind: 'path',
            role: 'bend',
            d: `M ${String(x + 3.5)} ${String(y - 2)} Q ${String(tipX)} ${String(y - 3)} ${String(tipX)} ${String(tipY + 3)}`,
          });
          primitives.push({
            kind: 'path',
            role: 'bend',
            d: `M ${String(tipX - 2.2)} ${String(tipY + 4.5)} L ${String(tipX)} ${String(tipY)} L ${String(tipX + 2.2)} ${String(tipY + 4.5)} Z`,
            filled: true,
          });
          primitives.push({
            kind: 'text',
            role: 'articulation',
            x: tipX,
            y: tipY - 4,
            text: bendLabel(art.amount),
            fontSize: ARTICULATION_FONT_SIZE,
            anchor: 'middle',
            baseline: 'middle',
          });
          break;
        }
        case 'slide': {
          emitSlide(primitives, placementIndex, p, art.style, m);
          break;
        }
      }
    }

    if (labels.length > 0) {
      primitives.push({
        kind: 'text',
        role: 'articulation',
        x,
        y: y - m.staffLineGap * labelLift,
        text: labels.join(' '),
        fontSize: ARTICULATION_FONT_SIZE,
        anchor: 'middle',
        baseline: 'middle',
      });
    }
  }
}

function emitSlide(
  primitives: Primitive[],
  placementIndex: Map<string, NotePlacement>,
  p: NotePlacement,
  style: string,
  m: Metrics,
): void {
  const { x, y } = p;
  const stub = (x1: number, y1: number, x2: number, y2: number) => {
    primitives.push({ kind: 'line', role: 'slide', x1, y1, x2, y2 });
  };
  switch (style) {
    case 'inBelow':
      stub(x - 13, y + 4.5, x - 4.5, y + 0.5);
      return;
    case 'inAbove':
      stub(x - 13, y - 4.5, x - 4.5, y - 0.5);
      return;
    case 'outDown':
      stub(x + 4.5, y + 0.5, x + 13, y + 4.5);
      return;
    case 'outUp':
      stub(x + 4.5, y - 0.5, x + 13, y - 4.5);
      return;
    default: {
      // shift / legato: a straight line to the next note on the string.
      const target =
        placementIndex.get(`${String(p.barIndex)}:${String(p.beatIndex + 1)}:${String(p.note.string)}`) ??
        placementIndex.get(`${String(p.barIndex + 1)}:0:${String(p.note.string)}`);
      if (target && target.systemTop === p.systemTop && target.x > x) {
        const rising = target.note.fret > p.note.fret;
        const falling = target.note.fret < p.note.fret;
        const dy = rising ? 3 : falling ? -3 : 0;
        stub(x + 5.5, y + dy * 0.8, target.x - 5.5, y - dy * 0.8);
      } else {
        // No visible target (end of system/score): draw an out-stub.
        stub(x + 4.5, y - 0.5, x + 13, y - 3.5);
      }
      return;
    }
  }
}
