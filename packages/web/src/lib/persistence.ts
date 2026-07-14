import {
  createBar,
  createBeat,
  createDuration,
  createNote,
  createScore,
  createTimeSignature,
  createTrack,
  createVoice,
  MAX_FRET,
  normalizeArticulation,
  type Articulation,
  type Bar,
  type Beat,
  type Duration,
  type Note,
  type NoteValue,
  type Score,
  type Track,
  type Voice,
} from '@tabkit/core';

export const STORAGE_KEY = 'tabkit.current-document.v0';
// v2: bars carry a `pickup` flag (v1 files load with pickup = false).
export const FILE_SCHEMA_VERSION = 2;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function durationFromJson(value: unknown): Duration {
  const record = asRecord(value);
  const rawValue = record?.value;
  const noteValue = ([1, 2, 4, 8, 16, 32, 64] as const).includes(rawValue as NoteValue) ? (rawValue as NoteValue) : 4;
  const dots = clampInt(record?.dots, 0, 2, 0);
  const tupletRecord = asRecord(record?.tuplet);
  let tuplet: { actual: number; normal: number } | null = null;
  if (tupletRecord) {
    const actual = clampInt(tupletRecord.actual, 1, 64, 0);
    const normal = clampInt(tupletRecord.normal, 1, 64, 0);
    if (actual >= 1 && normal >= 1) tuplet = { actual, normal };
  }
  return createDuration(noteValue, { dots, tuplet });
}

function noteFromJson(value: unknown, stringCount: number): Note | null {
  const record = asRecord(value);
  if (!record) return null;
  const stringIndex = clampInt(record.string, 0, stringCount - 1, -1);
  const fret = clampInt(record.fret, 0, MAX_FRET, -1);
  if (stringIndex < 0 || fret < 0 || typeof record.string !== 'number' || typeof record.fret !== 'number') {
    return null;
  }
  const articulations: Articulation[] = [];
  for (const raw of asArray(record.articulations)) {
    try {
      // normalizeArticulation migrates legacy plain-string tags ('bend' → {type:'bend',amount:1}).
      articulations.push(normalizeArticulation(raw));
    } catch {
      // skip anything unrecognizable rather than losing the document
    }
  }
  return createNote(stringIndex, fret, { articulations });
}

function beatFromJson(value: unknown, stringCount: number): Beat {
  const record = asRecord(value);
  const duration = durationFromJson(record?.duration);
  const notes = asArray(record?.notes)
    .map((n) => noteFromJson(n, stringCount))
    .filter((n): n is Note => n !== null);
  return createBeat(duration, notes);
}

function voiceFromJson(value: unknown, stringCount: number): Voice {
  const record = asRecord(value);
  return createVoice(asArray(record?.beats).map((b) => beatFromJson(b, stringCount)));
}

function barFromJson(value: unknown, stringCount: number): Bar {
  const record = asRecord(value);
  const tsRecord = asRecord(record?.timeSignature);
  let ts;
  try {
    ts = createTimeSignature(
      clampInt(tsRecord?.numerator, 1, 64, 4),
      typeof tsRecord?.denominator === 'number' ? tsRecord.denominator : 4,
    );
  } catch {
    ts = createTimeSignature(4, 4);
  }
  const voices = asArray(record?.voices).map((v) => voiceFromJson(v, stringCount));
  return createBar(ts, voices.length > 0 ? voices : undefined, { pickup: record?.pickup === true });
}

function trackFromJson(value: unknown): Track {
  const record = asRecord(value);
  const rawTuning = asArray(record?.tuning).filter(
    (m): m is number => typeof m === 'number' && Number.isSafeInteger(m) && m >= 0 && m <= 127,
  );
  const tuning = rawTuning.length > 0 ? rawTuning : undefined;
  const stringCount = tuning ? tuning.length : 6;
  const bars = asArray(record?.bars).map((b) => barFromJson(b, stringCount));
  return createTrack({
    name: typeof record?.name === 'string' ? record.name : 'Guitar',
    tuning,
    bars: bars.length > 0 ? bars : undefined,
  });
}

/**
 * Rebuild a Score from untrusted JSON. Every node goes back through its
 * factory, so anything malformed is clamped, migrated or dropped — a corrupt
 * document never crashes the app. Returns null only when the input is not an
 * object at all.
 */
export function scoreFromJson(value: unknown): Score | null {
  const record = asRecord(value);
  if (!record) return null;
  try {
    const tracks = asArray(record.tracks).map(trackFromJson);
    return createScore({
      title: typeof record.title === 'string' ? record.title : '',
      subtitle: typeof record.subtitle === 'string' ? record.subtitle : '',
      composer: typeof record.composer === 'string' ? record.composer : '',
      tempo: typeof record.tempo === 'number' ? record.tempo : undefined,
      tracks: tracks.length > 0 ? tracks : undefined,
    });
  } catch {
    return null;
  }
}

export function loadStoredScore(storage: Pick<Storage, 'getItem'> | null): Score | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return scoreFromJson(JSON.parse(raw));
  } catch {
    return null; // corrupt JSON / storage unavailable → fresh document
  }
}

export function saveStoredScore(storage: Pick<Storage, 'setItem'> | null, score: Score): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(score));
    return true;
  } catch {
    return false; // quota exceeded / private mode — editing must not crash
  }
}

/** The versioned .tabkit.json file format. */
export function scoreToFileJson(score: Score): string {
  return JSON.stringify({ format: 'tabkit', schemaVersion: FILE_SCHEMA_VERSION, score }, null, 2);
}

export function scoreFromFileJson(text: string): Score | null {
  try {
    const parsed: unknown = JSON.parse(text);
    const record = asRecord(parsed);
    if (!record) return null;
    // Accept both the wrapped file format and a bare score dump.
    if (record.score !== undefined) return scoreFromJson(record.score);
    return scoreFromJson(record);
  } catch {
    return null;
  }
}

export function suggestedFileName(score: Score): string {
  const base = score.title.trim() === '' ? 'untitled' : score.title.trim().toLowerCase().replace(/[^a-z0-9-_]+/gi, '-');
  return `${base}.tabkit.json`;
}
