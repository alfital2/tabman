import { hasArticulation, type Articulation } from '@tabkit/core';

export interface PluckOptions {
  sampleRate: number;
  articulations?: readonly Articulation[];
  gain?: number;
  /** Noise seed, for reproducible output. */
  seed?: number;
}

/** Deterministic xorshift32 noise generator. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/**
 * Karplus-Strong plucked string. Articulations shape the damping:
 * dead = a short percussive click, palmMute = fast decay,
 * harmonic / letRing = long bright sustain.
 */
export function renderPluck(frequency: number, seconds: number, options: PluckOptions): Float32Array<ArrayBuffer> {
  const { sampleRate, articulations = [], gain = 1 } = options;
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
    throw new RangeError(`invalid sampleRate ${String(sampleRate)}`);
  }
  const freq = Math.min(Math.max(frequency, 20), sampleRate / 4);

  const dead = hasArticulation(articulations, 'dead');
  const palmMute = hasArticulation(articulations, 'palmMute');
  const ringing = hasArticulation(articulations, 'harmonic') || hasArticulation(articulations, 'letRing');

  const duration = dead ? Math.min(seconds, 0.08) : Math.max(seconds, 0.02);
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const out = new Float32Array(length);

  const period = Math.max(2, Math.round(sampleRate / freq));
  const buffer = new Float32Array(period);
  const noise = makeNoise(options.seed ?? 12345);
  for (let i = 0; i < period; i++) buffer[i] = noise();

  const damping = dead ? 0.88 : palmMute ? 0.985 : ringing ? 0.9995 : 0.998;

  let ptr = 0;
  for (let i = 0; i < length; i++) {
    const current = buffer[ptr]!;
    out[i] = current * gain;
    const next = buffer[(ptr + 1) % period]!;
    buffer[ptr] = ((current + next) / 2) * damping;
    ptr = (ptr + 1) % period;
  }

  // Short linear fade-out so a truncated tail never clicks.
  const fade = Math.min(length, Math.ceil(sampleRate * 0.02));
  for (let i = 0; i < fade; i++) {
    const idx = length - 1 - i;
    out[idx] = out[idx]! * (i / fade);
  }
  return out;
}
