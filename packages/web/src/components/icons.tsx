import type { JSX } from 'react';
import type { NoteValue } from '@tabkit/core';

interface IconProps {
  size?: number;
  className?: string;
}

function svg(children: JSX.Element | JSX.Element[], size = 22): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** A drawn musical note for the given value (whole … 64th). */
export function NoteValueIcon({ value, size = 22 }: { value: NoteValue } & IconProps): JSX.Element {
  const filled = value >= 4;
  const hasStem = value >= 2;
  const flags = value === 8 ? 1 : value === 16 ? 2 : value === 32 ? 3 : value === 64 ? 4 : 0;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <g transform="rotate(-20 8.5 16)">
        <ellipse
          cx="8.5"
          cy="16"
          rx="4.7"
          ry="3.4"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </g>
      {hasStem && <line x1="12.8" y1="15.2" x2="12.8" y2="3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {Array.from({ length: flags }).map((_, i) => (
        <path
          key={i}
          d={`M12.8 ${4 + i * 3} q5.5 1.6 4.4 6`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** A quarter-rest glyph (used for the note-value / rest section). */
export function RestIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    <path
      d="M9.5 5 L14 9.5 L10.5 13 L14 16.8 Q9.5 15 9.5 19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
    size,
  );
}

export function DotIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(<circle cx="12" cy="12" r="2.4" fill="currentColor" />, size);
}

// ---- transport / file --------------------------------------------------

export function PlayIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(<path d="M8 5.5 L18 12 L8 18.5 Z" fill="currentColor" stroke="none" />, size);
}
export function StopIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />, size);
}
export function MetronomeIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M9 19 L12 4 L15 19 Z" {...stroke} />,
      <line key="b" x1="6.5" y1="19" x2="17.5" y2="19" {...stroke} />,
      <line key="c" x1="13" y1="16" x2="16" y2="8" {...stroke} />,
    ],
    size,
  );
}
export function UndoIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M8 8 L4 12 L8 16" {...stroke} />,
      <path key="b" d="M4 12 H14 a5 5 0 0 1 0 10 H10" {...stroke} />,
    ],
    size,
  );
}
export function RedoIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M16 8 L20 12 L16 16" {...stroke} />,
      <path key="b" d="M20 12 H10 a5 5 0 0 0 0 10 H14" {...stroke} />,
    ],
    size,
  );
}
export function NewIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M13 4 H7 a2 2 0 0 0-2 2 V18 a2 2 0 0 0 2 2 H17 a2 2 0 0 0 2-2 V10 Z" {...stroke} />,
      <path key="b" d="M13 4 V10 H19" {...stroke} />,
    ],
    size,
  );
}
export function ImportIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M12 4 V15" {...stroke} />,
      <path key="b" d="M8 11 L12 15 L16 11" {...stroke} />,
      <path key="c" d="M5 19 H19" {...stroke} />,
    ],
    size,
  );
}
export function ExportIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M12 16 V5" {...stroke} />,
      <path key="b" d="M8 9 L12 5 L16 9" {...stroke} />,
      <path key="c" d="M5 19 H19" {...stroke} />,
    ],
    size,
  );
}
export function DemoIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <circle key="a" cx="9" cy="17" r="2.4" fill="currentColor" stroke="none" />,
      <path key="b" d="M11.4 17 V6 L18 4 V15" {...stroke} />,
      <circle key="c" cx="15.6" cy="15" r="2.4" fill="currentColor" stroke="none" />,
    ],
    size,
  );
}
export function KeyboardIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    [
      <rect key="a" x="3" y="6.5" width="18" height="11" rx="2" {...stroke} />,
      <line key="b" x1="7" y1="10" x2="7" y2="10.2" {...stroke} />,
      <line key="c" x1="11" y1="10" x2="11" y2="10.2" {...stroke} />,
      <line key="d" x1="15" y1="10" x2="15" y2="10.2" {...stroke} />,
      <line key="e" x1="8" y1="14" x2="16" y2="14" {...stroke} />,
    ],
    size,
  );
}

export function StarIcon({ size = 20 }: IconProps): JSX.Element {
  return svg(
    <path d="M12 4 L13.8 9.2 L19.2 9.4 L14.9 12.7 L16.4 18 L12 14.9 L7.6 18 L9.1 12.7 L4.8 9.4 L10.2 9.2 Z" fill="currentColor" stroke="none" />,
    size,
  );
}

// ---- articulation glyphs ----------------------------------------------

export function HammerIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M5 15 Q12 7 19 15" {...stroke} />,
      <text key="b" x="12" y="21" fontSize="8" fill="currentColor" textAnchor="middle" fontFamily="serif">
        h
      </text>,
    ],
    size,
  );
}
export function PullIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M5 9 Q12 17 19 9" {...stroke} />,
      <text key="b" x="12" y="6" fontSize="8" fill="currentColor" textAnchor="middle" fontFamily="serif">
        p
      </text>,
    ],
    size,
  );
}
export function SlideIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <line key="a" x1="5" y1="17" x2="19" y2="7" {...stroke} />,
      <circle key="b" cx="5" cy="17" r="1.7" fill="currentColor" stroke="none" />,
      <circle key="c" cx="19" cy="7" r="1.7" fill="currentColor" stroke="none" />,
    ],
    size,
  );
}
export function BendIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M6 19 Q7 9 15 8" {...stroke} />,
      <path key="b" d="M12 8 L16 7.5 L14 11" fill="currentColor" stroke="none" />,
    ],
    size,
  );
}
export function VibratoIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(<path d="M3 13 q2.4 -5 4.8 0 t4.8 0 t4.8 0 t4.8 0" {...stroke} />, size);
}
export function HarmonicIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(<path d="M12 5 L18.5 12 L12 19 L5.5 12 Z" {...stroke} />, size);
}
export function DeadIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <line key="a" x1="7" y1="7" x2="17" y2="17" {...stroke} />,
      <line key="b" x1="17" y1="7" x2="7" y2="17" {...stroke} />,
    ],
    size,
  );
}
export function LetRingIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    [
      <path key="a" d="M6 6 V16" {...stroke} />,
      <path key="b" d="M6 6 H14 a3 3 0 0 1 0 6 H6" {...stroke} />,
      <path key="c" d="M11 12 L15 18" {...stroke} />,
    ],
    size,
  );
}
export function PalmMuteIcon({ size = 22 }: IconProps): JSX.Element {
  return svg(
    <text x="12" y="15" fontSize="8.5" fill="currentColor" textAnchor="middle" fontFamily="serif" fontWeight="600">
      P.M.
    </text>,
    size,
  );
}

/** A short letter glyph icon (tap/slap/pop). */
export function LetterIcon({ letter, size = 22 }: { letter: string } & IconProps): JSX.Element {
  return svg(
    <text x="12" y="16" fontSize="12" fill="currentColor" textAnchor="middle" fontFamily="serif" fontWeight="600">
      {letter}
    </text>,
    size,
  );
}
