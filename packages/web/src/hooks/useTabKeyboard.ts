import { useEffect, useRef } from 'react';
import type { ArticulationType, Direction, NoteValue } from '@tabkit/core';
import { actionForKey, type Keymap } from '../lib/keymap';

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
  /** Set the note value (brush + targeted beats). */
  onRhythmValue(value: NoteValue): void;
  /** Cycle dots 0 → 1 → 2 → 0 on the brush + targeted beats. */
  onToggleDot(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Global keyboard controller. Ignores keystrokes while a form field is
 * focused; reads the latest handlers and keymap through refs so the listener
 * binds once. Letter/dot keys resolve through the user-configurable keymap.
 */
export function useTabKeyboard(handlers: TabKeyboardHandlers, keymap: Keymap): void {
  const ref = useRef(handlers);
  const keymapRef = useRef(keymap);
  useEffect(() => {
    ref.current = handlers;
    keymapRef.current = keymap;
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
        const action = actionForKey(keymapRef.current, event.key);
        if (!action) return;
        event.preventDefault();
        if (action === 'rhythm.dot') {
          h.onToggleDot();
        } else if (action.startsWith('rhythm.')) {
          h.onRhythmValue(Number(action.slice('rhythm.'.length)) as NoteValue);
        } else {
          h.onArticulation(action.slice('articulation.'.length) as ArticulationType, event.shiftKey);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
