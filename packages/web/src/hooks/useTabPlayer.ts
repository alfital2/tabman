import { useCallback, useEffect, useRef, useState } from 'react';
import type { Score } from '@tabkit/core';
import { TabPlayer, type PlayOptions } from '@tabkit/playback';

export interface PlayheadPosition {
  readonly bar: number;
  readonly beat: number;
}

export interface TabPlayerBinding {
  readonly isPlaying: boolean;
  readonly playhead: PlayheadPosition | null;
  play(score: Score, options: Omit<PlayOptions, 'onEnd'>): void;
  stop(): void;
}

/**
 * React binding for TabPlayer. The engine is created lazily on first play (no
 * AudioContext at mount — browsers require a user gesture), and a
 * requestAnimationFrame loop reports the sounding beat for the playhead.
 */
export function useTabPlayer(): TabPlayerBinding {
  const playerRef = useRef<TabPlayer | null>(null);
  const rafRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<PlayheadPosition | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const stop = useCallback(() => {
    playerRef.current?.stop();
    stopRaf();
    setIsPlaying(false);
    setPlayhead(null);
  }, [stopRaf]);

  const play = useCallback(
    (score: Score, options: Omit<PlayOptions, 'onEnd'>) => {
      const player = (playerRef.current ??= new TabPlayer());
      stopRaf();
      player.play(score, {
        ...options,
        onEnd: () => {
          stopRaf();
          setIsPlaying(false);
          setPlayhead(null);
        },
      });
      if (!player.isPlaying) {
        // Nothing to play (empty range).
        setIsPlaying(false);
        setPlayhead(null);
        return;
      }
      setIsPlaying(true);

      const tick = () => {
        const current = playerRef.current;
        if (!current || !current.isPlaying) {
          rafRef.current = 0;
          return;
        }
        const t = current.currentTime();
        const schedule = current.currentSchedule;
        if (schedule) {
          let sounding: PlayheadPosition | null = null;
          for (const event of schedule.events) {
            if (event.startSec <= t) {
              sounding = { bar: event.bar, beat: event.beat };
            } else {
              break;
            }
          }
          setPlayhead((prev) =>
            prev && sounding && prev.bar === sounding.bar && prev.beat === sounding.beat ? prev : sounding,
          );
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopRaf],
  );

  useEffect(() => {
    return () => {
      stopRaf();
      const player = playerRef.current;
      playerRef.current = null;
      if (player) void player.dispose();
    };
  }, [stopRaf]);

  return { isPlaying, playhead, play, stop };
}
