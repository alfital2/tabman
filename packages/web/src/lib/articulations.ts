import {
  bend,
  BEND_AMOUNTS,
  harmonic,
  HARMONIC_KINDS,
  slide,
  SLIDE_STYLES,
  type Articulation,
  type ArticulationType,
} from '@tabkit/core';
import { bendLabel } from '@tabkit/render';

export interface ArticulationButton {
  readonly type: ArticulationType;
  readonly label: string;
  /** Types with variants open a popover instead of toggling directly. */
  readonly variants: readonly { label: string; value: Articulation }[] | null;
}

export interface ArticulationGroup {
  readonly title: string;
  readonly buttons: readonly ArticulationButton[];
}

export const ARTICULATION_GROUPS: readonly ArticulationGroup[] = [
  {
    title: 'Transitions',
    buttons: [
      { type: 'hammerOn', label: 'Hammer-on (h)', variants: null },
      { type: 'pullOff', label: 'Pull-off (p)', variants: null },
      {
        type: 'slide',
        label: 'Slide',
        variants: SLIDE_STYLES.map((style) => ({ label: slideStyleLabel(style), value: slide(style) })),
      },
    ],
  },
  {
    title: 'Expression',
    buttons: [
      {
        type: 'bend',
        label: 'Bend',
        variants: BEND_AMOUNTS.map((amount) => ({ label: bendLabel(amount), value: bend(amount) })),
      },
      { type: 'vibrato', label: 'Vibrato', variants: null },
      { type: 'letRing', label: 'Let ring', variants: null },
    ],
  },
  {
    title: 'Attack',
    buttons: [
      { type: 'tap', label: 'Tap (T)', variants: null },
      { type: 'slap', label: 'Slap (S)', variants: null },
      { type: 'pop', label: 'Pop (P)', variants: null },
    ],
  },
  {
    title: 'Technique',
    buttons: [
      { type: 'palmMute', label: 'Palm mute', variants: null },
      {
        type: 'harmonic',
        label: 'Harmonic',
        variants: HARMONIC_KINDS.map((kind) => ({ label: harmonicKindLabel(kind), value: harmonic(kind) })),
      },
      { type: 'dead', label: 'Dead note (x)', variants: null },
    ],
  },
];

function slideStyleLabel(style: (typeof SLIDE_STYLES)[number]): string {
  switch (style) {
    case 'shift':
      return 'Shift';
    case 'legato':
      return 'Legato';
    case 'inBelow':
      return 'In from below';
    case 'inAbove':
      return 'In from above';
    case 'outDown':
      return 'Out downward';
    case 'outUp':
      return 'Out upward';
  }
}

function harmonicKindLabel(kind: (typeof HARMONIC_KINDS)[number]): string {
  switch (kind) {
    case 'natural':
      return 'Natural ◇';
    case 'artificial':
      return 'Artificial A.H.';
    case 'pinch':
      return 'Pinch P.H.';
    case 'tap':
      return 'Tapped T.H.';
  }
}
