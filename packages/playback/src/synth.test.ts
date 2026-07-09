import { describe, expect, it } from 'vitest';
import { plainArticulation } from '@tabkit/core';
import { renderPluck } from './synth';

const SR = 44100;

function energy(buf: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += buf[i]! * buf[i]!;
  return sum / (to - from);
}

describe('renderPluck', () => {
  it('renders the requested length with audible content that decays', () => {
    const buf = renderPluck(440, 1, { sampleRate: SR });
    expect(buf.length).toBe(SR);
    const head = energy(buf, 0, SR / 10);
    const tail = energy(buf, SR - SR / 10, SR);
    expect(head).toBeGreaterThan(0);
    expect(tail).toBeLessThan(head);
  });

  it('is deterministic for a fixed seed', () => {
    const a = renderPluck(220, 0.1, { sampleRate: SR, seed: 7 });
    const b = renderPluck(220, 0.1, { sampleRate: SR, seed: 7 });
    expect(a).toEqual(b);
  });

  it('dead notes are short percussive clicks', () => {
    const buf = renderPluck(440, 1, { sampleRate: SR, articulations: [plainArticulation('dead')] });
    expect(buf.length).toBeLessThanOrEqual(SR * 0.08 + 1);
  });

  it('palm mute decays much faster than let-ring', () => {
    const muted = renderPluck(220, 0.8, { sampleRate: SR, articulations: [plainArticulation('palmMute')], seed: 3 });
    const ringing = renderPluck(220, 0.8, { sampleRate: SR, articulations: [plainArticulation('letRing')], seed: 3 });
    const window = Math.floor(SR * 0.1);
    const mutedTail = energy(muted, muted.length - window, muted.length);
    const ringingTail = energy(ringing, ringing.length - window, ringing.length);
    expect(mutedTail).toBeLessThan(ringingTail / 10);
  });

  it('fades out the tail to avoid clicks and clamps crazy inputs', () => {
    const buf = renderPluck(440, 0.2, { sampleRate: SR });
    expect(Math.abs(buf[buf.length - 1]!)).toBeLessThan(1e-4);
    expect(() => renderPluck(440, 0.1, { sampleRate: 100 })).toThrow(RangeError);
    // absurd frequencies clamp instead of crashing
    expect(renderPluck(0, 0.05, { sampleRate: SR }).length).toBeGreaterThan(0);
    expect(renderPluck(1e9, 0.05, { sampleRate: SR }).length).toBeGreaterThan(0);
  });

  it('applies gain', () => {
    const loud = renderPluck(220, 0.1, { sampleRate: SR, seed: 5, gain: 1 });
    const quiet = renderPluck(220, 0.1, { sampleRate: SR, seed: 5, gain: 0.5 });
    expect(Math.abs(quiet[10]!)).toBeCloseTo(Math.abs(loud[10]!) / 2, 5);
  });
});
