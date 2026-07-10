import { useEffect, useRef } from 'react';
import type { ArticulationType, Direction } from '@tabkit/core';

export interface TabKeyboardHandlers {
  onDigit(digit: number): void;
  onMove(direction: Direction): void;
  onBrushStep(direction: 'longer' | 'shorter'): void;
  onNudgeDuration(direction: 'longer' | 'shorter'): void;
  onDelete(): void;
  onEscape(): void;
  onTogglePlay(): void;
  onUndo(): void;
  onRedo(): void;
  onCopy(): void;
  onPaste(): void;
  onDuplicate(): void;
  /** Apply/toggle an articulation on the targeted note(s); cycle = Shift held. */
  onArticulation(type: ArticulationType, cycle: boolean): void;
}

/** Single-letter shortcut → articulation type. Digits are fret entry, so
 * letters are free and never collide with browser (Cmd/Ctrl/Alt) shortcuts. */
export const ARTICULATION_KEYS: Readonly<Record<string, ArticulationType>> = {
  h: 'hammerOn',
  p: 'pullOff',
  s: 'slide',
  b: 'bend',
  v: 'vibrato',
  m: 'palmMute',
  r: 'letRing',
  t: 'tap',
  a: 'slap',
  o: 'pop',
  x: 'dead',
  n: 'harmonic',
};

/** The base shortcut key for an articulation type (for tooltips). */
export function articulationKeyHint(type: ArticulationType): string | undefined {
  const entry = Object.entries(ARTICULATION_KEYS).find(([, t]) => t === type);
  return entry?.[0];
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Global keyboard controller. Ignores keystrokes while a form field is
 * focused; reads the latest handlers through a ref so the listener binds once.
 */
export function useTabKeyboard(handlers: TabKeyboardHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const h = ref.current;
      const mod = event.metaKey || event.ctrlKey;

      if (mod) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) h.onRedo();
          else h.onUndo();
        } else if (key === 'y') {
          event.preventDefault();
          h.onRedo();
        } else if (key === 'c') {
          event.preventDefault();
          h.onCopy();
        } else if (key === 'v') {
          event.preventDefault();
          h.onPaste();
        } else if (key === 'd') {
          event.preventDefault();
          h.onDuplicate();
        }
        return;
      }
      if (event.altKey) return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          const direction = event.key.slice(5).toLowerCase() as Direction;
          h.onMove(direction);
          return;
        }
        case '[':
          event.preventDefault();
          h.onBrushStep('longer');
          return;
        case ']':
          event.preventDefault();
          h.onBrushStep('shorter');
          return;
        case '+':
        case '=':
          event.preventDefault();
          h.onNudgeDuration('longer');
          return;
        case '-':
        case '_':
          event.preventDefault();
          h.onNudgeDuration('shorter');
          return;
        case 'Backspace':
        case 'Delete':
          event.preventDefault();
          h.onDelete();
          return;
        case 'Escape':
          h.onEscape();
          return;
        case ' ':
          event.preventDefault();
          h.onTogglePlay();
          return;
        default:
          break;
      }
      if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        h.onDigit(Number(event.key));
        return;
      }
      if (event.key.length === 1) {
        const type = ARTICULATION_KEYS[event.key.toLowerCase()];
        if (type) {
          event.preventDefault();
          h.onArticulation(type, event.shiftKey);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
