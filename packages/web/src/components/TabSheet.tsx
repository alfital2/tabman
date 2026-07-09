import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  canMoveNotesByStringDelta,
  canMoveNotesToSlot,
  canMoveNoteToString,
  noteAt,
  type Cell,
  type EditorState,
} from '@tabkit/core';
import {
  DEFAULT_METRICS,
  DEFAULT_THEME,
  ellipseStyle,
  hitTest,
  layoutScore,
  lineStyle,
  pathStyle,
  textStyle,
  type HitCell,
  type Layout,
  type Primitive,
} from '@tabkit/render';
import { CLICK_SLOP, normalizedRect, resolveGesture, type GestureMode } from '../lib/gestures';
import { cellKey, cellsInRect } from '../lib/selection';
import type { PlayheadPosition } from '../hooks/useTabPlayer';

export const SCALE = 1.3;

export interface TabSheetProps {
  state: EditorState;
  selection: readonly Cell[];
  playhead: PlayheadPosition | null;
  onPick(cell: HitCell): void;
  onSelect(cells: Cell[]): void;
  onMoveNote(from: Cell, toString: number): void;
  onMoveSelection(delta: number): void;
  onMoveToSlot(cells: readonly Cell[], target: HitCell): void;
  onContextMenu(clientX: number, clientY: number, cell: HitCell): void;
}

interface DragState {
  mode: GestureMode;
  startCell: HitCell | null;
  endCell: HitCell | null;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function primitiveNode(p: Primitive, index: number): JSX.Element {
  const theme = DEFAULT_THEME;
  switch (p.kind) {
    case 'line': {
      const s = lineStyle(theme, p.role);
      return <line key={index} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} />;
    }
    case 'text': {
      const s = textStyle(theme, p.role);
      return (
        <text
          key={index}
          x={p.x}
          y={p.y}
          fill={s.fill}
          fontFamily={s.fontFamily}
          fontWeight={s.fontWeight}
          fontSize={p.fontSize}
          textAnchor={p.anchor}
          dominantBaseline={p.baseline === 'middle' ? 'central' : p.baseline}
        >
          {p.text}
        </text>
      );
    }
    case 'rect':
      return <rect key={index} x={p.x} y={p.y} width={p.width} height={p.height} fill={theme.fretBackground} />;
    case 'ellipse': {
      const s = ellipseStyle(theme, p.filled);
      return (
        <ellipse key={index} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      );
    }
    case 'path': {
      const s = pathStyle(theme, p.role, p.filled);
      return <path key={index} d={p.d} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />;
    }
  }
}

function slotRect(layout: Layout, bar: number, beat: number) {
  return layout.slots.find((s) => s.path.bar === bar && s.path.beat === beat)?.rect ?? null;
}

/** Small rect hugging one string cell of a beat column. */
function cellRect(layout: Layout, cell: Cell) {
  const box = slotRect(layout, cell.bar, cell.beat);
  if (!box) return null;
  const system = layout.systems.find((sys) => {
    const first = sys.stringYs[0] ?? sys.top;
    const last = sys.stringYs[sys.stringYs.length - 1] ?? sys.top;
    return box.y + box.height / 2 >= first - layout.stringGap * 2 && box.y + box.height / 2 <= last + layout.stringGap * 2;
  });
  const y = system?.stringYs[cell.string];
  if (y === undefined) return null;
  return { x: box.x + 1.5, y: y - layout.stringGap / 2 + 1, width: box.width - 3, height: layout.stringGap - 2 };
}

export function TabSheet(props: TabSheetProps): JSX.Element {
  const { state, selection, playhead } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [fill, setFill] = useState({ width: 900, height: 640 });
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const area = wrap.closest('.sheet-area');
    const measure = () => {
      const style = getComputedStyle(wrap);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const width = wrap.clientWidth - padX;
      const height = area instanceof HTMLElement ? area.clientHeight - 150 : 640;
      setFill((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    if (area instanceof HTMLElement) observer.observe(area);
    measure();
    return () => {
      observer.disconnect();
    };
  }, []);

  const layout = useMemo(
    () =>
      layoutScore(state.score, DEFAULT_METRICS, {
        fillToWidth: Math.max(320, fill.width) / SCALE,
        fillToHeight: Math.max(0, fill.height) / SCALE,
      }),
    [state.score, fill],
  );

  // While a gesture is live, no part of the page should highlight as text.
  useEffect(() => {
    if (!drag) return;
    const body = document.body;
    const previous = body.style.userSelect;
    body.style.userSelect = 'none';
    body.style.webkitUserSelect = 'none';
    return () => {
      body.style.userSelect = previous;
      body.style.webkitUserSelect = previous;
    };
  }, [drag !== null]);

  const primitives = useMemo(() => layout.primitives.map(primitiveNode), [layout]);

  const toLayoutPoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: -1, y: -1 };
    const rect = svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / SCALE, y: (event.clientY - rect.top) / SCALE };
  };

  const selectionKeys = useMemo(() => new Set(selection.map(cellKey)), [selection]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); // no native text-selection from the sheet
    const point = toLayoutPoint(event);
    const cell = hitTest(layout, point.x, point.y);
    const mode: GestureMode =
      cell && selectionKeys.has(cellKey(cell))
        ? 'group'
        : cell && noteAt(state.score, cell)
          ? 'single'
          : 'marquee';
    setDrag({ mode, startCell: cell, endCell: cell, start: point, end: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = toLayoutPoint(event);
    setDrag({ ...drag, end: point, endCell: hitTest(layout, point.x, point.y) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    const result = resolveGesture(drag);
    switch (result.kind) {
      case 'pick':
        props.onPick(result.cell);
        break;
      case 'select':
        props.onSelect(cellsInRect(state.score, layout, result.rect));
        break;
      case 'moveNote':
        props.onMoveNote(result.from, result.toString);
        break;
      case 'moveSelection':
        props.onMoveSelection(result.delta);
        break;
      case 'moveToSlot':
        props.onMoveToSlot(drag.mode === 'group' ? selection : [result.from], result.target);
        break;
      case 'none':
        break;
    }
  };

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = toLayoutPoint(event);
    const cell = hitTest(layout, point.x, point.y);
    if (cell) props.onContextMenu(event.clientX, event.clientY, cell);
  };

  // ---- overlays -----------------------------------------------------------

  const overlays: JSX.Element[] = [];

  if (playhead) {
    const rect = slotRect(layout, playhead.bar, playhead.beat);
    if (rect) {
      overlays.push(
        <rect
          key="playing"
          className="playing-mark"
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="#f59e0b"
          opacity={0.28}
          rx={2}
        />,
      );
    }
  }

  const cursorColumn = slotRect(layout, state.cursor.bar, state.cursor.beat);
  if (cursorColumn) {
    overlays.push(
      <rect
        key="cursor-column"
        x={cursorColumn.x}
        y={cursorColumn.y}
        width={cursorColumn.width}
        height={cursorColumn.height}
        fill="#2f6bff"
        opacity={0.07}
        rx={2}
      />,
    );
  }

  for (const cell of selection) {
    const rect = cellRect(layout, cell);
    if (rect) {
      overlays.push(
        <rect
          key={`sel-${cellKey(cell)}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="#16a34a"
          opacity={0.22}
          rx={2}
        />,
      );
    }
  }

  const topOverlays: JSX.Element[] = [];

  // Move previews while dragging.
  if (drag && drag.endCell && (Math.abs(drag.end.x - drag.start.x) > CLICK_SLOP || Math.abs(drag.end.y - drag.start.y) > CLICK_SLOP)) {
    const dx = Math.abs(drag.end.x - drag.start.x);
    const dy = Math.abs(drag.end.y - drag.start.y);
    const horizontal = dx > dy;
    if (drag.mode !== 'marquee' && drag.startCell && horizontal) {
      // Reposition-in-time preview: tint the slot column under the pointer.
      const movingCells = drag.mode === 'group' ? selection : [drag.startCell];
      const notSame = drag.endCell.bar !== drag.startCell.bar || drag.endCell.beat !== drag.startCell.beat;
      if (notSame) {
        const ok = canMoveNotesToSlot(state.score, movingCells, drag.endCell);
        const rect = slotRect(layout, drag.endCell.bar, drag.endCell.beat);
        if (rect) {
          topOverlays.push(
            <rect key="preview-slot" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={ok ? '#16a34a' : '#dc2626'} opacity={0.25} rx={2} />,
          );
        }
      }
    } else if (drag.mode === 'single' && drag.startCell && drag.endCell.string !== drag.startCell.string) {
      const ok = canMoveNoteToString(state.score, drag.startCell, drag.endCell.string);
      const rect = cellRect(layout, { ...drag.startCell, string: drag.endCell.string });
      if (rect) {
        topOverlays.push(
          <rect key="preview" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={ok ? '#16a34a' : '#dc2626'} opacity={0.32} rx={2} />,
        );
      }
    } else if (drag.mode === 'group' && drag.startCell) {
      const delta = drag.endCell.string - drag.startCell.string;
      if (delta !== 0) {
        const ok = canMoveNotesByStringDelta(state.score, selection, delta);
        for (const cell of selection) {
          const rect = cellRect(layout, { ...cell, string: cell.string + delta });
          if (rect) {
            topOverlays.push(
              <rect key={`preview-${cellKey(cell)}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={ok ? '#16a34a' : '#dc2626'} opacity={0.32} rx={2} />,
            );
          }
        }
      }
    } else if (drag.mode === 'marquee') {
      const rect = normalizedRect(drag.start, drag.end);
      topOverlays.push(
        <rect
          key="marquee"
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="#2f6bff"
          opacity={0.08}
          stroke="#2f6bff"
          strokeWidth={0.7}
          strokeDasharray="3 2"
        />,
      );
    }
  } else if (drag && drag.mode === 'marquee' && (Math.abs(drag.end.x - drag.start.x) > CLICK_SLOP || Math.abs(drag.end.y - drag.start.y) > CLICK_SLOP)) {
    const rect = normalizedRect(drag.start, drag.end);
    topOverlays.push(
      <rect key="marquee" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#2f6bff" opacity={0.08} stroke="#2f6bff" strokeWidth={0.7} strokeDasharray="3 2" />,
    );
  }

  // Blinking caret on the exact cursor cell.
  const caret = cellRect(layout, state.cursor);
  if (caret) {
    topOverlays.push(
      <rect
        key="caret"
        className="cursor-caret"
        x={caret.x}
        y={caret.y}
        width={caret.width}
        height={caret.height}
        fill="none"
        stroke="#2f6bff"
        strokeWidth={1.2}
        rx={2}
      />,
    );
  }

  return (
    <div
      className="tab-sheet-svg"
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
      }}
      onContextMenu={onContextMenu}
      role="application"
      aria-label="Guitar tablature editor"
    >
      <svg
        ref={svgRef}
        width={layout.width * SCALE}
        height={layout.height * SCALE}
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
      >
        {overlays}
        {primitives}
        {topOverlays}
      </svg>
    </div>
  );
}
