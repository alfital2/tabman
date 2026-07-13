import { describe, expect, it } from 'vitest';
import {
  actionForKey,
  assignKey,
  defaultKeymap,
  KEYMAP_ACTIONS,
  KEYMAP_STORAGE_KEY,
  keyForAction,
  loadKeymap,
  saveKeymap,
  unbindKey,
} from './keymap';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('defaultKeymap', () => {
  it('binds rhythm values q w e r d f longest-first', () => {
    const km = defaultKeymap();
    expect(keyForAction(km, 'rhythm.1')).toBe('q');
    expect(keyForAction(km, 'rhythm.2')).toBe('w');
    expect(keyForAction(km, 'rhythm.4')).toBe('e');
    expect(keyForAction(km, 'rhythm.8')).toBe('r');
    expect(keyForAction(km, 'rhythm.16')).toBe('d');
    expect(keyForAction(km, 'rhythm.32')).toBe('f');
  });

  it('leaves the 64th unbound and binds the dot to "."', () => {
    const km = defaultKeymap();
    expect(keyForAction(km, 'rhythm.64')).toBeNull();
    expect(keyForAction(km, 'rhythm.dot')).toBe('.');
  });

  it('moves let-ring to g so r is free for 8ths', () => {
    const km = defaultKeymap();
    expect(keyForAction(km, 'articulation.letRing')).toBe('g');
    expect(actionForKey(km, 'r')).toBe('rhythm.8');
  });

  it('keeps the other articulation keys', () => {
    const km = defaultKeymap();
    expect(actionForKey(km, 'h')).toBe('articulation.hammerOn');
    expect(actionForKey(km, 'p')).toBe('articulation.pullOff');
    expect(actionForKey(km, 's')).toBe('articulation.slide');
    expect(actionForKey(km, 'b')).toBe('articulation.bend');
    expect(actionForKey(km, 'v')).toBe('articulation.vibrato');
    expect(actionForKey(km, 'm')).toBe('articulation.palmMute');
    expect(actionForKey(km, 't')).toBe('articulation.tap');
    expect(actionForKey(km, 'a')).toBe('articulation.slap');
    expect(actionForKey(km, 'o')).toBe('articulation.pop');
    expect(actionForKey(km, 'x')).toBe('articulation.dead');
    expect(actionForKey(km, 'n')).toBe('articulation.harmonic');
  });

  it('has no duplicate default keys across the registry', () => {
    const keys = KEYMAP_ACTIONS.map((a) => a.defaultKey).filter((k): k is string => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('actionForKey', () => {
  it('is case-insensitive so Shift+key still resolves', () => {
    expect(actionForKey(defaultKeymap(), 'Q')).toBe('rhythm.1');
  });

  it('returns undefined for unbound keys', () => {
    expect(actionForKey(defaultKeymap(), 'z')).toBeUndefined();
  });
});

describe('assignKey', () => {
  it('rebinds an action to a free key', () => {
    const result = assignKey(defaultKeymap(), 'rhythm.64', 'z');
    expect(result.error).toBeUndefined();
    expect(keyForAction(result.keymap!, 'rhythm.64')).toBe('z');
    expect(actionForKey(result.keymap!, 'z')).toBe('rhythm.64');
  });

  it('normalizes to lowercase', () => {
    const result = assignKey(defaultKeymap(), 'rhythm.64', 'Z');
    expect(keyForAction(result.keymap!, 'rhythm.64')).toBe('z');
  });

  it('blocks a key already used by another action, naming it', () => {
    const result = assignKey(defaultKeymap(), 'rhythm.64', 'h');
    expect(result.keymap).toBeUndefined();
    expect(result.error).toContain('Hammer-on');
  });

  it('re-assigning an action its own key is a no-op success', () => {
    const km = defaultKeymap();
    const result = assignKey(km, 'rhythm.1', 'q');
    expect(result.error).toBeUndefined();
    expect(keyForAction(result.keymap!, 'rhythm.1')).toBe('q');
  });

  it('blocks reserved keys (digits = frets, brackets/plus/minus = brush and retime)', () => {
    for (const key of ['0', '9', '[', ']', '+', '=', '-', '_', ' ']) {
      const result = assignKey(defaultKeymap(), 'rhythm.64', key);
      expect(result.keymap, `key ${key} should be rejected`).toBeUndefined();
      expect(result.error).toBeTruthy();
    }
  });

  it('blocks multi-character keys', () => {
    const result = assignKey(defaultKeymap(), 'rhythm.64', 'Enter');
    expect(result.keymap).toBeUndefined();
  });
});

describe('unbindKey', () => {
  it('clears the binding', () => {
    const km = unbindKey(defaultKeymap(), 'articulation.dead');
    expect(keyForAction(km, 'articulation.dead')).toBeNull();
    expect(actionForKey(km, 'x')).toBeUndefined();
  });
});

describe('persistence', () => {
  it('round-trips overrides through storage', () => {
    const storage = fakeStorage();
    const edited = assignKey(defaultKeymap(), 'rhythm.64', 'z').keymap!;
    saveKeymap(storage, edited);
    const revived = loadKeymap(storage);
    expect(keyForAction(revived, 'rhythm.64')).toBe('z');
    expect(keyForAction(revived, 'rhythm.1')).toBe('q');
  });

  it('stores only diffs from the defaults', () => {
    const storage = fakeStorage();
    saveKeymap(storage, defaultKeymap());
    const raw = storage.getItem(KEYMAP_STORAGE_KEY);
    expect(raw === null || raw === '{}').toBe(true);
  });

  it('survives garbage in storage', () => {
    const storage = fakeStorage({ [KEYMAP_STORAGE_KEY]: 'not json {' });
    expect(loadKeymap(storage)).toEqual(defaultKeymap());
  });

  it('ignores unknown actions and conflicting overrides from storage', () => {
    const storage = fakeStorage({
      [KEYMAP_STORAGE_KEY]: JSON.stringify({
        'rhythm.64': 'z',
        'nonsense.action': 'k',
        'articulation.dead': 'q', // conflicts with rhythm.1 default — dropped
      }),
    });
    const km = loadKeymap(storage);
    expect(keyForAction(km, 'rhythm.64')).toBe('z');
    expect(keyForAction(km, 'articulation.dead')).toBe('x');
    expect(actionForKey(km, 'q')).toBe('rhythm.1');
  });

  it('loads defaults when storage is null', () => {
    expect(loadKeymap(null)).toEqual(defaultKeymap());
  });
});
