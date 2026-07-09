import {
  addFractions,
  barCapacityInWholes,
  barFilledInWholes,
  beatDurationInWholes,
  compareFractions,
  fractionToNumber,
  fretToMidi,
  getArticulation,
  midiToFrequency,
  ZERO,
  type Articulation,
  type Bar,
  type Beat,
  type Score,
} from '@tabkit/core';

/** A whole note is four quarters: 240 / bpm seconds. */
export function secondsPerWhole(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError(`bpm must be positive, got ${String(bpm)}`);
  }
  return 240 / bpm;
}

/** playbackRate automation, times relative to the note's start, ratio 1 = written pitch. */
export interface PitchAnchor {
  readonly atSec: number;
  readonly ratio: number;
}

export interface ScheduledNote {
  readonly string: number;
  readonly fret: number;
  readonly midi: number;
  readonly frequency: number;
  readonly articulations: readonly Articulation[];
  /** false for legato targets — they sound as a continuation of their source. */
  attack: boolean;
  /** How long the note rings; legato sources extend past their beat. */
  sustainSec: number;
  /** Baked pitch automation (own bend + glides + slurred targets' pitch). */
  pitch?: PitchAnchor[];
  /** Set on shift slides: the destination pitch being glided to. */
  glideToMidi?: number;
}

export interface ScheduledEvent {
  readonly bar: number;
  readonly beat: number;
  readonly startSec: number;
  readonly durationSec: number;
  readonly notes: ScheduledNote[];
}

export interface PlayFrom {
  fromBar?: number;
  fromBeat?: number;
}

export interface Schedule {
  readonly events: readonly ScheduledEvent[];
  readonly totalSec: number;
}

const TRACK = 0;
const VOICE = 0;

function beatsOf(bar: Bar): readonly Beat[] {
  return bar.voices[VOICE]?.beats ?? [];
}

/**
 * Seconds a bar occupies on the timeline. Bars advance by their
 * time-signature capacity (underfilled bars get a tail of silence, keeping the
 * metronome grid locked); an overfull bar advances by its content so notes
 * never overlap the next bar.
 */
function barAdvanceWholes(bar: Bar) {
  const capacity = barCapacityInWholes(bar.timeSignature);
  const filled = barFilledInWholes(bar);
  return compareFractions(filled, capacity) > 0 ? filled : capacity;
}

const BEND_RATIO_PER_TONE = (tones: number) => 2 ** ((tones * 2) / 12);
/** Fraction of the note's duration before pitch transitions begin. */
const TRANSITION_POINT = 0.6;
const STEP_EPSILON = 0.008;

function isLegatoTransition(art: Articulation | undefined): art is Articulation {
  if (!art) return false;
  return art.type === 'hammerOn' || art.type === 'pullOff' || (art.type === 'slide' && art.style === 'legato');
}

function transitionOf(note: ScheduledNote): 'legato' | 'shift' | null {
  if (
    isLegatoTransition(getArticulation(note.articulations, 'hammerOn')) ||
    isLegatoTransition(getArticulation(note.articulations, 'pullOff')) ||
    isLegatoTransition(getArticulation(note.articulations, 'slide'))
  ) {
    return 'legato';
  }
  const slide = getArticulation(note.articulations, 'slide');
  if (slide && slide.type === 'slide' && slide.style === 'shift') return 'shift';
  return null;
}

function bendAnchors(note: ScheduledNote, durationSec: number, baseRatio: number, offsetSec: number): PitchAnchor[] {
  const bendArt = getArticulation(note.articulations, 'bend');
  if (!bendArt || bendArt.type !== 'bend') return [];
  const target = baseRatio * BEND_RATIO_PER_TONE(bendArt.amount);
  return [
    { atSec: offsetSec, ratio: baseRatio },
    { atSec: offsetSec + durationSec * TRANSITION_POINT, ratio: target },
  ];
}

/**
 * Pure scheduling: beats sit at the cumulative sum of their durations, bars
 * advance by their time-signature capacity. Legato chains (hammer-on,
 * pull-off, legato slide) are folded into their source note: the source rings
 * through its targets and carries the whole chain's pitch automation; targets
 * keep `attack: false`.
 */
export function scheduleScore(score: Score, bpm: number, from?: PlayFrom): Schedule {
  const spw = secondsPerWhole(bpm);
  const track = score.tracks[TRACK];
  if (!track) return { events: [], totalSec: 0 };

  const events: ScheduledEvent[] = [];
  let barStart = 0;
  track.bars.forEach((bar, barIndex) => {
    let t = barStart;
    beatsOf(bar).forEach((beat, beatIndex) => {
      const durationSec = fractionToNumber(beatDurationInWholes(beat)) * spw;
      const notes: ScheduledNote[] = beat.notes.map((note) => {
        const midi = fretToMidi(track.tuning, Math.min(note.string, track.tuning.length - 1), note.fret);
        return {
          string: note.string,
          fret: note.fret,
          midi,
          frequency: midiToFrequency(midi),
          articulations: note.articulations,
          attack: true,
          sustainSec: durationSec,
        };
      });
      events.push({ bar: barIndex, beat: beatIndex, startSec: t, durationSec, notes });
      t += durationSec;
    });
    barStart += fractionToNumber(barAdvanceWholes(bar)) * spw;
  });
  const totalSec = barStart;

  // Fold legato chains and bake pitch automation.
  for (let i = 0; i < events.length; i++) {
    for (const source of events[i]!.notes) {
      if (!source.attack) continue; // already consumed by an earlier chain

      let anchors = bendAnchors(source, events[i]!.durationSec, 1, 0);
      let offset = events[i]!.durationSec;
      let ratio = anchors.length > 0 ? anchors[anchors.length - 1]!.ratio : 1;
      let cur = source;
      let eventIndex = i;

      for (;;) {
        const transition = transitionOf(cur);
        if (!transition) break;
        const nextEvent = events[eventIndex + 1];
        const target = nextEvent?.notes.find((n) => n.string === source.string);
        if (!nextEvent || !target) break;
        const targetRatio = target.frequency / source.frequency;
        const curDur = events[eventIndex]!.durationSec;
        const transitionStart = offset - curDur * (1 - TRANSITION_POINT);

        if (transition === 'shift') {
          // Glide to the destination; the destination is re-picked.
          cur.glideToMidi = target.midi;
          anchors.push({ atSec: transitionStart, ratio }, { atSec: offset, ratio: targetRatio });
          break;
        }

        // Legato: one attack, pitch moves; the target is tied.
        target.attack = false;
        const slideArt = getArticulation(cur.articulations, 'slide');
        if (slideArt && slideArt.type === 'slide' && slideArt.style === 'legato') {
          anchors.push({ atSec: transitionStart, ratio }, { atSec: offset, ratio: targetRatio });
        } else {
          // hammer-on / pull-off: an instant pitch step at the boundary.
          anchors.push({ atSec: Math.max(0, offset - STEP_EPSILON), ratio }, { atSec: offset, ratio: targetRatio });
        }
        ratio = targetRatio;
        // The slurred target can still bend — fold it into the source.
        const targetBend = bendAnchors(target, nextEvent.durationSec, targetRatio, offset);
        if (targetBend.length > 0) {
          anchors.push(...targetBend);
          ratio = targetBend[targetBend.length - 1]!.ratio;
        }
        source.sustainSec = nextEvent.startSec + nextEvent.durationSec - events[i]!.startSec;
        offset = nextEvent.startSec + nextEvent.durationSec - events[i]!.startSec;
        cur = target;
        eventIndex += 1;
      }

      if (anchors.length > 0) {
        // De-duplicate identical leading anchors and keep times monotonic.
        anchors = anchors.filter((a, idx) => idx === 0 || a.atSec >= anchors[idx - 1]!.atSec);
        source.pitch = anchors;
      }
    }
  }

  if (!from || (from.fromBar === undefined && from.fromBeat === undefined)) {
    return { events, totalSec };
  }

  const fromBar = from.fromBar ?? 0;
  const fromBeat = from.fromBeat ?? 0;
  const t0 = beatStartSeconds(score, bpm, fromBar, fromBeat);
  const kept = events.filter((e) => e.bar > fromBar || (e.bar === fromBar && e.beat >= fromBeat));
  const rebased = kept.map((e, idx) => ({
    ...e,
    startSec: e.startSec - t0,
    // The first sounding event must be picked even if it was a legato target —
    // its source got dropped by the range cut.
    notes: idx === 0 ? e.notes.map((note) => ({ ...note, attack: true })) : e.notes,
  }));
  return { events: rebased, totalSec: Math.max(0, totalSec - t0) };
}

/** Absolute start time of a cell (bar, beat) on the schedule timeline. */
export function beatStartSeconds(score: Score, bpm: number, barIndex: number, beatIndex: number): number {
  const spw = secondsPerWhole(bpm);
  const track = score.tracks[TRACK];
  if (!track) return 0;
  let t = 0;
  for (let i = 0; i < Math.min(barIndex, track.bars.length); i++) {
    t += fractionToNumber(barAdvanceWholes(track.bars[i]!)) * spw;
  }
  const bar = track.bars[barIndex];
  if (!bar) return t;
  const beats = beatsOf(bar);
  let within = ZERO;
  for (let j = 0; j < Math.min(beatIndex, beats.length); j++) {
    within = addFractions(within, beatDurationInWholes(beats[j]!));
  }
  return t + fractionToNumber(within) * spw;
}
