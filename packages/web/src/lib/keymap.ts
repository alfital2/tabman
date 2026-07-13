import type { ArticulationType, NoteValue } from '@tabkit/core';

export type KeymapActionId = `rhythm.${NoteValue}` | 'rhythm.dot' | `articulation.${ArticulationType}`;

export interface KeymapAction {
  readonly id: KeymapActionId;
  readonly label: string;
  readonly group: 'rhythm' | 'articulation';
  readonly defaultKey: string | null;
}

/** Action id → bound key (lowercase single char) or null when unbound. */
export type Keymap = Readonly<Record<KeymapActionId, string | null>>;

export const KEYMAP_STORAGE_KEY = 'tabman.keymap.v1';

export const KEYMAP_ACTIONS: readonly KeymapAction[] = Object.freeze([
  { id: 'rhythm.1', label: 'Whole note', group: 'rhythm', defaultKey: 'q' },
  { id: 'rhythm.2', label: 'Half note', group: 'rhythm', defaultKey: 'w' },
  { id: 'rhythm.4', label: 'Quarter note', group: 'rhythm', defaultKey: 'e' },
  { id: 'rhythm.8', label: '8th note', group: 'rhythm', defaultKey: 'r' },
  { id: 'rhythm.16', label: '16th note', group: 'rhythm', defaultKey: 'd' },
  { id: 'rhythm.32', label: '32nd note', group: 'rhythm', defaultKey: 'f' },
  { id: 'rhythm.64', label: '64th note', group: 'rhythm', defaultKey: null },
  { id: 'rhythm.dot', label: 'Toggle dot', group: 'rhythm', defaultKey: '.' },
  { id: 'articulation.hammerOn', label: 'Hammer-on', group: 'articulation', defaultKey: 'h' },
  { id: 'articulation.pullOff', label: 'Pull-off', group: 'articulation', defaultKey: 'p' },
  { id: 'articulation.slide', label: 'Slide', group: 'articulation', defaultKey: 's' },
  { id: 'articulation.bend', label: 'Bend', group: 'articulation', defaultKey: 'b' },
  { id: 'articulation.vibrato', label: 'Vibrato', group: 'articulation', defaultKey: 'v' },
  { id: 'articulation.palmMute', label: 'Palm mute', group: 'articulation', defaultKey: 'm' },
  { id: 'articulation.letRing', label: 'Let ring', group: 'articulation', defaultKey: 'g' },
  { id: 'articulation.tap', label: 'Tap', group: 'articulation', defaultKey: 't' },
  { id: 'articulation.slap', label: 'Slap', group: 'articulation', defaultKey: 'a' },
  { id: 'articulation.pop', label: 'Pop', group: 'articulation', defaultKey: 'o' },
  { id: 'articulation.dead', label: 'Dead note', group: 'articulation', defaultKey: 'x' },
  { id: 'articulation.harmonic', label: 'Harmonic', group: 'articulation', defaultKey: 'n' },
]);

const ACTION_BY_ID = new Map(KEYMAP_ACTIONS.map((a) => [a.id, a]));

/** Keys owned by other, non-configurable shortcuts (frets, brush, retime, play). */
const RESERVED_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '[', ']', '+', '=', '-', '_', ' ']);

export function defaultKeymap(): Keymap {
  const map = {} as Record<KeymapActionId, string | null>;
  for (const action of KEYMAP_ACTIONS) map[action.id] = action.defaultKey;
  return Object.freeze(map);
}

export function keyForAction(keymap: Keymap, id: KeymapActionId): string | null {
  return keymap[id] ?? null;
}

export function actionForKey(keymap: Keymap, key: string): KeymapActionId | undefined {
  const wanted = key.toLowerCase();
  for (const action of KEYMAP_ACTIONS) {
    if (keymap[action.id] === wanted) return action.id;
  }
  return undefined;
}

export function actionLabel(id: KeymapActionId): string {
  return ACTION_BY_ID.get(id)?.label ?? id;
}

export interface AssignResult {
  keymap?: Keymap;
  error?: string;
}

/** Bind `key` to `id`. Blocked (with a reason) for reserved keys, multi-char keys, and keys held by another action. */
export function assignKey(keymap: Keymap, id: KeymapActionId, key: string): AssignResult {
  const normalized = key.toLowerCase();
  if (normalized.length !== 1) {
    return { error: 'Single character keys only' };
  }
  if (RESERVED_KEYS.has(normalized)) {
    return { error: 'Reserved (frets / brush / retime / play)' };
  }
  const holder = actionForKey(keymap, normalized);
  if (holder !== undefined && holder !== id) {
    return { error: `Used by ${actionLabel(holder)}` };
  }
  if (keymap[id] === normalized) return { keymap };
  return { keymap: Object.freeze({ ...keymap, [id]: normalized }) };
}

export function unbindKey(keymap: Keymap, id: KeymapActionId): Keymap {
  if (keymap[id] === null) return keymap;
  return Object.freeze({ ...keymap, [id]: null });
}

/** Persist only the diff from the defaults; an empty diff clears the entry. */
export function saveKeymap(storage: Storage | null, keymap: Keymap): void {
  if (!storage) return;
  const defaults = defaultKeymap();
  const overrides: Record<string, string | null> = {};
  for (const action of KEYMAP_ACTIONS) {
    if (keymap[action.id] !== defaults[action.id]) overrides[action.id] = keymap[action.id];
  }
  try {
    if (Object.keys(overrides).length === 0) storage.removeItem(KEYMAP_STORAGE_KEY);
    else storage.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* private mode — the keymap just resets next load */
  }
}

/**
 * Load defaults + stored overrides. Unknown actions, invalid keys, and
 * overrides that collide with an already-bound key are dropped.
 */
export function loadKeymap(storage: Storage | null): Keymap {
  const map = { ...defaultKeymap() } as Record<KeymapActionId, string | null>;
  const raw = storage?.getItem(KEYMAP_STORAGE_KEY);
  if (raw == null) return Object.freeze(map);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze(map);
  }
  if (typeof parsed !== 'object' || parsed === null) return Object.freeze(map);

  for (const [id, key] of Object.entries(parsed)) {
    if (!ACTION_BY_ID.has(id as KeymapActionId)) continue;
    const actionId = id as KeymapActionId;
    if (key === null) {
      map[actionId] = null;
      continue;
    }
    if (typeof key !== 'string') continue;
    const normalized = key.toLowerCase();
    if (normalized.length !== 1 || RESERVED_KEYS.has(normalized)) continue;
    const taken = Object.entries(map).some(([otherId, otherKey]) => otherId !== actionId && otherKey === normalized);
    if (taken) continue;
    map[actionId] = normalized;
  }
  return Object.freeze(map);
}
