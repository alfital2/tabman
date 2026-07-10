import type { JSX } from 'react';
import type { ChordVoicing } from '@tabkit/core';

export interface ChordDiagramProps {
  voicing: ChordVoicing;
  size?: number;
}

const COLS = 6; // strings
const SPACES = 4; // fret spaces shown

/**
 * A small chord chart. Strings run low-E (left) to high-e (right); frets run
 * top (nut / lowest) to bottom. Dots mark fretted notes, ○ open, ✕ muted.
 */
export function ChordDiagram({ voicing, size = 1 }: ChordDiagramProps): JSX.Element {
  const colGap = 9;
  const rowGap = 11;
  const left = 12;
  const top = 16;
  const gridW = (COLS - 1) * colGap;
  const gridH = SPACES * rowGap;
  const width = left + gridW + 12;
  const height = top + gridH + 8;

  const fretted = voicing.frets.filter((f): f is number => f !== null && f > 0);
  const maxF = fretted.length > 0 ? Math.max(...fretted) : 0;
  const minF = fretted.length > 0 ? Math.min(...fretted) : 0;
  const showNut = maxF <= SPACES;
  const startFret = showNut ? 1 : minF;

  const stringX = (col: number) => left + col * colGap; // col 0 = low E (left)
  const fretLineY = (row: number) => top + row * rowGap;

  const lines: JSX.Element[] = [];
  // fret lines
  for (let r = 0; r <= SPACES; r++) {
    lines.push(
      <line key={`f${r}`} x1={left} y1={fretLineY(r)} x2={left + gridW} y2={fretLineY(r)} stroke="#8a909c" strokeWidth={0.8} />,
    );
  }
  // strings
  for (let c = 0; c < COLS; c++) {
    lines.push(<line key={`s${c}`} x1={stringX(c)} y1={top} x2={stringX(c)} y2={top + gridH} stroke="#8a909c" strokeWidth={0.8} />);
  }
  // nut (thick top) in open position
  if (showNut) {
    lines.push(<line key="nut" x1={left - 0.4} y1={top} x2={left + gridW + 0.4} y2={top} stroke="#cdd1da" strokeWidth={2.6} />);
  }

  const markers: JSX.Element[] = [];
  const dots: JSX.Element[] = [];
  voicing.frets.forEach((fret, string) => {
    const col = COLS - 1 - string; // string 0 (high e) → rightmost column
    const x = stringX(col);
    if (fret === null) {
      markers.push(
        <text key={`m${string}`} x={x} y={top - 5} fontSize={7} fill="#9aa0ac" textAnchor="middle">
          ✕
        </text>,
      );
      return;
    }
    if (fret === 0) {
      markers.push(<circle key={`m${string}`} cx={x} cy={top - 7} r={2.6} fill="none" stroke="#9aa0ac" strokeWidth={0.9} />);
      return;
    }
    const row = fret - startFret; // 0..SPACES-1
    const y = fretLineY(row) + rowGap / 2;
    dots.push(<circle key={`d${string}`} cx={x} cy={y} r={3.4} fill="#2f6bff" />);
  });

  return (
    <svg
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width * size}
      height={height * size}
      aria-hidden="true"
    >
      {lines}
      {!showNut && (
        <text x={left - 5} y={fretLineY(0) + rowGap * 0.75} fontSize={7.5} fill="#9aa0ac" textAnchor="end">
          {startFret}fr
        </text>
      )}
      {markers}
      {dots}
    </svg>
  );
}
