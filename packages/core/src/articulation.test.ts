import { describe, expect, it } from 'vitest';
import {
  articulationsEqual,
  bend,
  defaultArticulation,
  getArticulation,
  harmonic,
  hasArticulation,
  normalizeArticulation,
  plainArticulation,
  slide,
  withArticulation,
  withoutArticulationType,
} from './articulation';

describe('articulation', () => {
  it('constructors validate parameters', () => {
    expect(bend(1)).toEqual({ type: 'bend', amount: 1 });
    expect(() => bend(3 as never)).toThrow(RangeError);
    expect(slide('legato')).toEqual({ type: 'slide', style: 'legato' });
    expect(() => slide('sideways' as never)).toThrow(RangeError);
    expect(harmonic('pinch')).toEqual({ type: 'harmonic', kind: 'pinch' });
    expect(() => plainArticulation('bend')).toThrow(RangeError);
    expect(plainArticulation('vibrato')).toEqual({ type: 'vibrato' });
  });

  it('defaultArticulation fills default parameters', () => {
    expect(defaultArticulation('bend')).toEqual({ type: 'bend', amount: 1 });
    expect(defaultArticulation('slide')).toEqual({ type: 'slide', style: 'shift' });
    expect(defaultArticulation('harmonic')).toEqual({ type: 'harmonic', kind: 'natural' });
    expect(defaultArticulation('palmMute')).toEqual({ type: 'palmMute' });
  });

  it('normalizeArticulation migrates legacy string tags', () => {
    expect(normalizeArticulation('bend')).toEqual({ type: 'bend', amount: 1 });
    expect(normalizeArticulation('hammerOn')).toEqual({ type: 'hammerOn' });
    expect(normalizeArticulation({ type: 'slide', style: 'outUp' })).toEqual({ type: 'slide', style: 'outUp' });
    expect(() => normalizeArticulation('wiggle')).toThrow(TypeError);
    expect(() => normalizeArticulation({ type: 'bend', amount: 7 })).toThrow(RangeError);
    expect(() => normalizeArticulation(42)).toThrow(TypeError);
    expect(() => normalizeArticulation(null)).toThrow(TypeError);
  });

  it('equality compares type and parameters', () => {
    expect(articulationsEqual(bend(1), bend(1))).toBe(true);
    expect(articulationsEqual(bend(1), bend(2))).toBe(false);
    expect(articulationsEqual(bend(1), plainArticulation('vibrato'))).toBe(false);
    expect(articulationsEqual(plainArticulation('tap'), plainArticulation('tap'))).toBe(true);
  });

  it('withArticulation replaces the same type', () => {
    const list = withArticulation([bend(1)], bend(2));
    expect(list).toEqual([{ type: 'bend', amount: 2 }]);
    const two = withArticulation(list, slide('shift'));
    expect(two).toHaveLength(2);
    expect(hasArticulation(two, 'bend')).toBe(true);
    expect(getArticulation(two, 'slide')).toEqual({ type: 'slide', style: 'shift' });
  });

  it('withoutArticulationType removes only that type', () => {
    const list = withArticulation([bend(1)], slide('shift'));
    expect(withoutArticulationType(list, 'bend')).toEqual([{ type: 'slide', style: 'shift' }]);
    expect(withoutArticulationType(list, 'vibrato')).toEqual(list);
  });
});
