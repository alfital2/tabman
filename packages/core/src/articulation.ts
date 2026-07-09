export type ArticulationType =
  | 'hammerOn'
  | 'pullOff'
  | 'slide'
  | 'bend'
  | 'vibrato'
  | 'palmMute'
  | 'harmonic'
  | 'tap'
  | 'slap'
  | 'pop'
  | 'letRing'
  | 'dead';

export type BendAmount = 0.25 | 0.5 | 0.75 | 1 | 1.5 | 2; // in tones (whole steps)
export type SlideStyle = 'shift' | 'legato' | 'inBelow' | 'inAbove' | 'outDown' | 'outUp';
export type HarmonicKind = 'natural' | 'artificial' | 'pinch' | 'tap';

export type Articulation =
  | { readonly type: 'bend'; readonly amount: BendAmount }
  | { readonly type: 'slide'; readonly style: SlideStyle }
  | { readonly type: 'harmonic'; readonly kind: HarmonicKind }
  | { readonly type: 'hammerOn' }
  | { readonly type: 'pullOff' }
  | { readonly type: 'vibrato' }
  | { readonly type: 'palmMute' }
  | { readonly type: 'tap' }
  | { readonly type: 'slap' }
  | { readonly type: 'pop' }
  | { readonly type: 'letRing' }
  | { readonly type: 'dead' };

export const BEND_AMOUNTS: readonly BendAmount[] = Object.freeze([0.25, 0.5, 0.75, 1, 1.5, 2]);
export const SLIDE_STYLES: readonly SlideStyle[] = Object.freeze([
  'shift',
  'legato',
  'inBelow',
  'inAbove',
  'outDown',
  'outUp',
]);
export const HARMONIC_KINDS: readonly HarmonicKind[] = Object.freeze(['natural', 'artificial', 'pinch', 'tap']);

/** Palette / display order. */
export const ARTICULATION_TYPE_ORDER: readonly ArticulationType[] = Object.freeze([
  'hammerOn',
  'pullOff',
  'slide',
  'bend',
  'vibrato',
  'palmMute',
  'harmonic',
  'tap',
  'slap',
  'pop',
  'letRing',
  'dead',
]);

const PLAIN_TYPES: ReadonlySet<ArticulationType> = new Set([
  'hammerOn',
  'pullOff',
  'vibrato',
  'palmMute',
  'tap',
  'slap',
  'pop',
  'letRing',
  'dead',
]);

export function bend(amount: BendAmount): Articulation {
  if (!BEND_AMOUNTS.includes(amount)) {
    throw new RangeError(`invalid bend amount ${String(amount)}`);
  }
  return Object.freeze({ type: 'bend', amount });
}

export function slide(style: SlideStyle): Articulation {
  if (!SLIDE_STYLES.includes(style)) {
    throw new RangeError(`invalid slide style ${String(style)}`);
  }
  return Object.freeze({ type: 'slide', style });
}

export function harmonic(kind: HarmonicKind): Articulation {
  if (!HARMONIC_KINDS.includes(kind)) {
    throw new RangeError(`invalid harmonic kind ${String(kind)}`);
  }
  return Object.freeze({ type: 'harmonic', kind });
}

export function plainArticulation(type: ArticulationType): Articulation {
  if (!PLAIN_TYPES.has(type)) {
    throw new RangeError(`articulation '${type}' needs a parameter; use its constructor`);
  }
  return Object.freeze({ type } as Articulation);
}

/** A bare type in its default-parameter form. */
export function defaultArticulation(type: ArticulationType): Articulation {
  switch (type) {
    case 'bend':
      return bend(1);
    case 'slide':
      return slide('shift');
    case 'harmonic':
      return harmonic('natural');
    default:
      return plainArticulation(type);
  }
}

/**
 * Validate an untrusted value (e.g. from a persisted document) into an
 * Articulation. Migrates the legacy plain-string form ('bend' → default bend).
 * Throws TypeError on anything unrecognizable.
 */
export function normalizeArticulation(value: unknown): Articulation {
  if (typeof value === 'string') {
    if (!(ARTICULATION_TYPE_ORDER as readonly string[]).includes(value)) {
      throw new TypeError(`unknown articulation '${value}'`);
    }
    return defaultArticulation(value as ArticulationType);
  }
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`invalid articulation ${JSON.stringify(value)}`);
  }
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !(ARTICULATION_TYPE_ORDER as readonly string[]).includes(type)) {
    throw new TypeError(`unknown articulation type ${JSON.stringify(type)}`);
  }
  switch (type as ArticulationType) {
    case 'bend':
      return bend(record.amount as BendAmount);
    case 'slide':
      return slide(record.style as SlideStyle);
    case 'harmonic':
      return harmonic(record.kind as HarmonicKind);
    default:
      return plainArticulation(type as ArticulationType);
  }
}

export function hasArticulation(list: readonly Articulation[], type: ArticulationType): boolean {
  return list.some((a) => a.type === type);
}

export function getArticulation(list: readonly Articulation[], type: ArticulationType): Articulation | undefined {
  return list.find((a) => a.type === type);
}

/** Same type and same parameters. */
export function articulationsEqual(a: Articulation, b: Articulation): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'bend':
      return a.amount === (b as { amount: BendAmount }).amount;
    case 'slide':
      return a.style === (b as { style: SlideStyle }).style;
    case 'harmonic':
      return a.kind === (b as { kind: HarmonicKind }).kind;
    default:
      return true;
  }
}

/** Add an articulation, replacing any existing one of the same type. */
export function withArticulation(list: readonly Articulation[], art: Articulation): readonly Articulation[] {
  return Object.freeze([...list.filter((a) => a.type !== art.type), art]);
}

export function withoutArticulationType(
  list: readonly Articulation[],
  type: ArticulationType,
): readonly Articulation[] {
  return Object.freeze(list.filter((a) => a.type !== type));
}
