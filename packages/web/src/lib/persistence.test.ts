import { describe, expect, it } from 'vitest';
import { createDefaultScore, noteAt } from '@tabkit/core';
import { demoScore, showcaseScore, nothingElseMatters } from './demoScore';
import {
  loadStoredScore,
  saveStoredScore,
  scoreFromFileJson,
  scoreFromJson,
  scoreToFileJson,
  STORAGE_KEY,
  suggestedFileName,
} from './persistence';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => map,
  };
}

describe('scoreFromJson round-trip', () => {
  it('round-trips every demo score exactly', () => {
    for (const score of [createDefaultScore(), demoScore(), showcaseScore(), nothingElseMatters()]) {
      const revived = scoreFromJson(JSON.parse(JSON.stringify(score)));
      expect(revived).toEqual(score);
    }
  });

  it('migrates legacy string-tag articulations', () => {
    const raw = JSON.parse(JSON.stringify(demoScore())) as Record<string, never>;
    const json = JSON.stringify(raw).replace(
      '{"type":"bend","amount":1}',
      '"bend"', // the old persisted form
    );
    const revived = scoreFromJson(JSON.parse(json));
    expect(revived).not.toBeNull();
    const note = noteAt(revived!, { bar: 0, beat: 6, string: 2 });
    expect(note?.articulations).toEqual([{ type: 'bend', amount: 1 }]);
  });

  it('drops garbage without crashing', () => {
    expect(scoreFromJson(null)).toBeNull();
    expect(scoreFromJson('x')).toBeNull();
    expect(scoreFromJson(42)).toBeNull();
    // wildly broken fields fall back to defaults rather than throwing
    const revived = scoreFromJson({
      title: 7,
      tempo: 'fast',
      tracks: [
        {
          tuning: ['x', -5, 900],
          bars: [
            {
              timeSignature: { numerator: -3, denominator: 7 },
              voices: [
                {
                  beats: [
                    { duration: { value: 5, dots: 9 }, notes: [{ string: 99, fret: -2 }, { string: 0, fret: 3, articulations: ['nonsense', { type: 'slide', style: 'legato' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(revived).not.toBeNull();
    const note = noteAt(revived!, { bar: 0, beat: 0, string: 0 });
    expect(note?.fret).toBe(3);
    expect(note?.articulations).toEqual([{ type: 'slide', style: 'legato' }]);
  });
});

describe('local storage', () => {
  it('saves and loads', () => {
    const storage = memoryStorage();
    const score = demoScore();
    expect(saveStoredScore(storage, score)).toBe(true);
    expect(loadStoredScore(storage)).toEqual(score);
  });

  it('corrupt JSON and quota errors are survivable', () => {
    expect(loadStoredScore(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadStoredScore(throwing)).toBeNull();
    expect(saveStoredScore(throwing, demoScore())).toBe(false);
    expect(loadStoredScore(null)).toBeNull();
  });
});

describe('file format', () => {
  it('wraps with a schema version and parses back', () => {
    const score = showcaseScore();
    const text = scoreToFileJson(score);
    const parsed = JSON.parse(text) as { format: string; schemaVersion: number };
    expect(parsed.format).toBe('tabkit');
    expect(parsed.schemaVersion).toBe(1);
    expect(scoreFromFileJson(text)).toEqual(score);
  });

  it('accepts a bare score dump too, rejects junk', () => {
    const score = demoScore();
    expect(scoreFromFileJson(JSON.stringify(score))).toEqual(score);
    expect(scoreFromFileJson('nope')).toBeNull();
    expect(scoreFromFileJson('[1,2]')).toBeNull();
  });

  it('suggests a safe file name', () => {
    expect(suggestedFileName(demoScore())).toBe('demo-riff.tabkit.json');
    expect(suggestedFileName(createDefaultScore())).toBe('untitled.tabkit.json');
  });
});
