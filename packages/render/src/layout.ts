import {
  barCapacityInWholes,
  barFilledInWholes,
  compareFractions,
  getArticulation,
  recognizeChord,
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
import type { BeatBox, ChordLabelBox, Primitive, TrackSystem } from './primitives';

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
  /** Clickable chord-name labels above chord columns. */
  readonly chordLabels: readonly ChordLabelBox[];
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
  /** Horizontal space one beat/append slot occupies after justification. */
  slotWidth: number;
}

/** Bars never stretch more than this, so a lone empty bar can't get absurd. */
const MAX_JUSTIFY_SCALE = 3;

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

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${String(cx - r)} ${String(cy)} a ${String(r)} ${String(r)} 0 1 0 ${String(r * 2)} 0 a ${String(r)} ${String(r)} 0 1 0 ${String(-r * 2)} 0 Z`;
}

/**
 * Vector rest shapes (font music glyphs are unreliable across platforms):
 * whole = block hanging under the mid line, half = block sitting on it,
 * quarter = the classic squiggle, 8th/16th/32nd/64th = slash with 1–4 hooks.
 */
function restPaths(cx: number, y0: number, value: number): Array<{ d: string; filled: boolean }> {
  if (value === 1) {
    return [{ d: `M ${String(cx - 3)} ${String(y0)} h 6 v 2.4 h -6 Z`, filled: true }];
  }
  if (value === 2) {
    return [{ d: `M ${String(cx - 3)} ${String(y0 - 2.4)} h 6 v 2.4 h -6 Z`, filled: true }];
  }
  if (value === 4) {
    return [
      {
        d: `M ${String(cx - 1.3)} ${String(y0 - 4.8)} L ${String(cx + 1.7)} ${String(y0 - 1.6)} L ${String(cx - 0.7)} ${String(y0 + 0.9)} L ${String(cx + 1.7)} ${String(y0 + 3.6)} Q ${String(cx - 1.2)} ${String(y0 + 2.2)} ${String(cx - 1.2)} ${String(y0 + 4.9)}`,
        filled: false,
      },
    ];
  }
  const flags = value === 8 ? 1 : value === 16 ? 2 : value === 32 ? 3 : 4;
  const top = y0 - 3.2;
  const height = 6.4 + (flags - 1) * 1.6;
  const paths: Array<{ d: string; filled: boolean }> = [
    { d: `M ${String(cx + 1.9)} ${String(top)} L ${String(cx - 1.9)} ${String(top + height)}`, filled: false },
  ];
  for (let k = 0; k < flags; k++) {
    const hookY = top + 0.9 + k * 2.3;
    // x of the slash at this height, hooks hang off its left side
    const attachX = cx + 1.9 - 3.8 * ((hookY - top) / height);
    paths.push({ d: circlePath(attachX - 2.5, hookY + 0.9, 1.05), filled: true });
    paths.push({
      d: `M ${String(attachX - 2.1)} ${String(hookY + 1.3)} Q ${String(attachX - 0.8)} ${String(hookY + 1.9)} ${String(attachX)} ${String(hookY)}`,
      filled: false,
    });
  }
  return paths;
}

/** 8th = 1 beam, 16th = 2, 32nd = 3, 64th = 4; longer values (and rests) don't beam. */
function beamLevels(beat: Beat): number {
  if (beat.notes.length === 0) return 0; // rests break beam groups
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
  const systemsOfBars: BarPlan[][] = [];
  let current: BarPlan[] = [];
  let x = originX;
  for (const plan of plans) {
    if (current.length > 0 && x + plan.width > fillWidth - m.marginX) {
      systemsOfBars.push(current);
      current = [];
      x = originX;
    }
    current.push(plan);
    x += plan.width;
  }
  if (current.length > 0) systemsOfBars.push(current);

  // Pass 2.5: justify — stretch each system's bars to fill the row width, so
  // a short row (or a lone bar) never renders as a stub. Only meaningful when
  // the width is bounded.
  // A beat/append slot never stretches past this, so a near-empty bar keeps
  // compact cells instead of ballooning to fill the row (the staff lines still
  // rule full width, so the page reads as paper either way).
  const maxSlotWidth = m.beatWidth * 1.55;
  const placedSystems: PlacedBar[][] = systemsOfBars.map((systemPlans) => {
    const natural = systemPlans.reduce((sum, p) => sum + p.width, 0);
    const usable = Number.isFinite(fillWidth) ? fillWidth - m.marginX - originX : natural;
    const scale = natural > 0 && usable > natural ? Math.min(MAX_JUSTIFY_SCALE, usable / natural) : 1;
    let cursorX = originX;
    return systemPlans.map((plan) => {
      const fixed = m.barStartPad + m.barEndPad + (plan.showTimeSignature ? TIME_SIGNATURE_WIDTH : 0);
      const slotCount = Math.max(1, beats(plan.bar).length + (plan.hasAppendSlot ? 1 : 0));
      const slotWidth = Math.min(maxSlotWidth, (plan.width * scale - fixed) / slotCount);
      const width = fixed + slotWidth * slotCount;
      const placed: PlacedBar = { ...plan, x: cursorX, width, slotWidth };
      cursorX += width;
      return placed;
    });
  });

  const primitives: Primitive[] = [];
  const beatBoxes: BeatBox[] = [];
  const slotBoxes: BeatBox[] = [];
  const chordLabels: ChordLabelBox[] = [];
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

  for (const systemBars of placedSystems) {
    const last = systemBars[systemBars.length - 1]!;
    const barsEndX = last.x + last.width;
    // Ruled lines always run the full row so every system reads as the same
    // sheet of paper, even when its bars end early.
    const endX = Number.isFinite(fillWidth) ? fillWidth - m.marginX : barsEndX;
    contentRight = Math.max(contentRight, barsEndX);
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

      const slotWidth = placed.slotWidth;
      const boxRect = (cx: number) => ({
        x: cx - slotWidth / 2,
        y: top - m.staffLineGap,
        width: slotWidth,
        height: staffHeight + m.staffLineGap * 2,
      });

      // Rhythm rail bookkeeping for the beam pass.
      const stemsAtLevel: Array<{ cx: number; levels: number } | null> = [];

      barBeats.forEach((beat, beatIndex) => {
        const cx = contentX + beatIndex * slotWidth + slotWidth / 2;
        const box: BeatBox = { path: { track: TRACK, bar: barIndex, voice: VOICE, beat: beatIndex }, rect: boxRect(cx) };
        beatBoxes.push(box);
        slotBoxes.push(box);

        const value = beat.duration.value;
        const isRestBeat = beat.notes.length === 0;

        if (isRestBeat) {
          // Rest: a vector glyph centered on the staff — no stem, no beam.
          const restY = top + staffHeight / 2;
          for (const piece of restPaths(cx, restY, value)) {
            primitives.push({ kind: 'path', role: 'rest', d: piece.d, filled: piece.filled });
          }
          for (let dot = 0; dot < beat.duration.dots; dot++) {
            primitives.push({ kind: 'ellipse', role: 'dot', cx: cx + 5.5 + dot * 4, cy: restY - 2, rx: 1.3, ry: 1.3, filled: true });
          }
          stemsAtLevel.push({ cx, levels: 0 });
          return;
        }

        // Stems: none for wholes, half-length for halves, full otherwise.
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

        // Chord name above the column — derived live from the notes it sounds.
        const chord = track ? recognizeChord(beat.notes, track.tuning) : null;
        if (chord !== null) {
          const labelSize = m.fretFontSize * 1.15;
          const labelY = top - m.staffLineGap * 0.9;
          primitives.push({
            kind: 'text',
            role: 'chordName',
            x: cx,
            y: labelY,
            text: chord,
            fontSize: labelSize,
            anchor: 'middle',
            baseline: 'auto',
          });
          const labelW = Math.max(14, chord.length * labelSize * 0.6 + 8);
          chordLabels.push({
            path: { track: TRACK, bar: barIndex, voice: VOICE, beat: beatIndex },
            rect: { x: cx - labelW / 2, y: labelY - labelSize, width: labelW, height: labelSize + 6 },
            text: chord,
          });
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
          const beamletLength = Math.min(slotWidth, m.beatWidth) * 0.32;
          for (let level = 1; level <= solo.levels; level++) {
            const y = railY - (level - 1) * BEAM_SPACING;
            primitives.push({ kind: 'line', role: 'beam', x1: solo.cx, y1: y, x2: solo.cx + beamletLength, y2: y });
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
        const cx = contentX + barBeats.length * slotWidth + slotWidth / 2;
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
    chordLabels,
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
