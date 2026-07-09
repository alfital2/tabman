import { describe, expect, it } from 'vitest';
import {
  createBar,
  createBeat,
  createNote,
  createScore,
  createTrack,
  createVoice,
  FOUR_FOUR,
  QUARTER,
} from '@tabkit/core';
import { layoutScore } from './layout';
import { sceneToSvg } from './svg';

describe('sceneToSvg', () => {
  it('produces a self-contained SVG document', () => {
    const score = createScore({
      tracks: [
        createTrack({
          bars: [createBar(FOUR_FOUR, [createVoice([createBeat(QUARTER, [createNote(0, 12)])])])],
        }),
      ],
    });
    const svg = sceneToSvg(layoutScore(score));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('>12</text>');
    expect(svg).toContain('viewBox');
  });

  it('escapes XML-special characters in text', () => {
    const score = createScore({
      title: '<Riff & "Co">',
      tracks: [createTrack({ bars: [createBar(FOUR_FOUR)] })],
    });
    const svg = sceneToSvg(layoutScore(score));
    expect(svg).not.toContain('<Riff');
  });
});
