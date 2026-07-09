import { getArticulation, type Score } from '@tabkit/core';
import { metronomeClicks } from './metronome';
import { renderPluck } from './synth';
import { scheduleScore, type PlayFrom, type Schedule, type ScheduledNote } from './schedule';

export type Tone = 'clean' | 'distortion';

export interface PlayOptions {
  bpm: number;
  metronome: boolean;
  tone?: Tone;
  from?: PlayFrom;
  onEnd?: () => void;
}

const SCHEDULE_HEADROOM = 0.08;
const RELEASE_TAIL = 0.25;

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
}

/**
 * The impure audio engine: renders each picked note's Karplus-Strong buffer,
 * applies its baked pitch automation, slide-in/out scoops and vibrato LFO,
 * schedules everything (plus the metronome) on a Web Audio graph.
 *
 * All timing/timbre logic lives in the pure modules; this class only wires
 * the graph. Construct with a factory for testing.
 */
export class TabPlayer {
  private readonly createContext: () => AudioContext;
  private context: AudioContext | null = null;
  private playing = false;
  private baseTime = 0;
  private sources: AudioScheduledSourceNode[] = [];
  private liveNodes: AudioNode[] = [];
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private schedule: Schedule | null = null;

  constructor(createContext?: () => AudioContext) {
    this.createContext = createContext ?? (() => new AudioContext());
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Seconds into the current schedule, 0 when stopped. */
  currentTime(): number {
    if (!this.playing || !this.context) return 0;
    return Math.max(0, this.context.currentTime - this.baseTime);
  }

  get currentSchedule(): Schedule | null {
    return this.schedule;
  }

  play(score: Score, options: PlayOptions): void {
    this.stop();
    const context = (this.context ??= this.createContext());
    if (context.state === 'suspended') {
      void context.resume();
    }

    const schedule = scheduleScore(score, options.bpm, options.from);
    this.schedule = schedule;
    if (schedule.events.length === 0 || schedule.totalSec <= 0) {
      options.onEnd?.();
      return;
    }

    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
    this.liveNodes.push(master);

    let voiceBus: AudioNode = master;
    if ((options.tone ?? 'clean') === 'distortion') {
      const shaper = context.createWaveShaper();
      shaper.curve = distortionCurve(4);
      shaper.oversample = '2x';
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3800;
      const compensate = context.createGain();
      compensate.gain.value = 0.45;
      shaper.connect(lowpass);
      lowpass.connect(compensate);
      compensate.connect(master);
      this.liveNodes.push(shaper, lowpass, compensate);
      voiceBus = shaper;
    }

    const base = (this.baseTime = context.currentTime + SCHEDULE_HEADROOM);

    for (const event of schedule.events) {
      const chordScale = event.notes.length > 1 ? 1 / Math.sqrt(event.notes.length) : 1;
      for (const note of event.notes) {
        if (!note.attack) continue;
        this.scheduleNote(context, voiceBus, base + event.startSec, note, chordScale);
      }
    }

    if (options.metronome) {
      this.scheduleMetronome(context, master, base, score, options);
    }

    this.playing = true;
    const endInMs = (SCHEDULE_HEADROOM + schedule.totalSec + RELEASE_TAIL) * 1000;
    this.endTimer = setTimeout(() => {
      this.stop();
      options.onEnd?.();
    }, endInMs);
  }

  private scheduleNote(
    context: AudioContext,
    bus: AudioNode,
    when: number,
    note: ScheduledNote,
    gainScale: number,
  ): void {
    // Bends raise playbackRate, consuming the buffer faster — render headroom.
    const renderSec = note.sustainSec * 1.4 + 0.2;
    const data = renderPluck(note.frequency, renderSec, {
      sampleRate: context.sampleRate,
      articulations: note.articulations,
      gain: 0.8 * gainScale,
    });
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.copyToChannel(data, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;

    const rate = source.playbackRate;
    rate.setValueAtTime(1, when);
    if (note.pitch && note.pitch.length > 0) {
      for (const anchor of note.pitch) {
        rate.linearRampToValueAtTime(anchor.ratio, when + Math.max(0, anchor.atSec));
      }
    }

    // Slide-in / slide-out scoops.
    const slide = getArticulation(note.articulations, 'slide');
    if (slide && slide.type === 'slide') {
      const SCOOP = 0.12;
      if (slide.style === 'inBelow' || slide.style === 'inAbove') {
        const fromRatio = slide.style === 'inBelow' ? 0.84 : 1.19;
        rate.setValueAtTime(fromRatio, when);
        rate.linearRampToValueAtTime(1, when + SCOOP);
      } else if (slide.style === 'outDown' || slide.style === 'outUp') {
        const toRatio = slide.style === 'outDown' ? 0.8 : 1.25;
        const outStart = when + Math.max(0.02, note.sustainSec - SCOOP);
        rate.setValueAtTime(1, outStart);
        rate.linearRampToValueAtTime(toRatio, when + note.sustainSec);
      }
    }

    // Vibrato: a sine LFO on playbackRate (~5.5 Hz, about ±half a semitone).
    if (getArticulation(note.articulations, 'vibrato')) {
      const lfo = context.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.5;
      const depth = context.createGain();
      depth.gain.value = 0.028;
      lfo.connect(depth);
      depth.connect(rate);
      lfo.start(when);
      lfo.stop(when + note.sustainSec + 0.1);
      this.sources.push(lfo);
      this.liveNodes.push(depth);
    }

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(1, when);
    const stopAt = when + note.sustainSec + 0.15;
    envelope.gain.setTargetAtTime(0, when + note.sustainSec, 0.05);
    source.connect(envelope);
    envelope.connect(bus);
    source.start(when);
    source.stop(stopAt + 0.2);
    this.sources.push(source);
    this.liveNodes.push(envelope);
  }

  private scheduleMetronome(
    context: AudioContext,
    master: AudioNode,
    base: number,
    score: Score,
    options: PlayOptions,
  ): void {
    const clicks = metronomeClicks(score, options.bpm, options.from);
    for (const click of clicks) {
      const osc = context.createOscillator();
      osc.type = 'square';
      osc.frequency.value = click.accent ? 1400 : 900;
      const env = context.createGain();
      const at = base + click.timeSec;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(click.accent ? 0.22 : 0.14, at + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.connect(env);
      env.connect(master);
      osc.start(at);
      osc.stop(at + 0.06);
      this.sources.push(osc);
      this.liveNodes.push(env);
    }
  }

  stop(): void {
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
    }
    for (const node of this.liveNodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.sources = [];
    this.liveNodes = [];
    this.playing = false;
    this.schedule = null;
  }

  /** Release the AudioContext entirely (component unmount). */
  async dispose(): Promise<void> {
    this.stop();
    if (this.context && this.context.state !== 'closed') {
      await this.context.close().catch(() => undefined);
    }
    this.context = null;
  }
}
