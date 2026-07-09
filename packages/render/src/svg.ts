import type { Layout } from './layout';
import type { Primitive } from './primitives';
import { DEFAULT_THEME, ellipseStyle, lineStyle, pathStyle, textStyle, type Theme } from './theme';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function primitiveToSvg(p: Primitive, theme: Theme): string {
  switch (p.kind) {
    case 'line': {
      const s = lineStyle(theme, p.role);
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${esc(s.stroke)}" stroke-width="${String(s.strokeWidth)}"/>`;
    }
    case 'text': {
      const s = textStyle(theme, p.role);
      return `<text x="${n(p.x)}" y="${n(p.y)}" fill="${esc(s.fill)}" font-family="${esc(s.fontFamily)}" font-weight="${s.fontWeight}" font-size="${String(p.fontSize)}" text-anchor="${p.anchor}" dominant-baseline="${p.baseline === 'middle' ? 'central' : p.baseline}">${esc(p.text)}</text>`;
    }
    case 'rect':
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" height="${n(p.height)}" fill="${esc(theme.fretBackground)}"/>`;
    case 'ellipse': {
      const s = ellipseStyle(theme, p.filled);
      return `<ellipse cx="${n(p.cx)}" cy="${n(p.cy)}" rx="${n(p.rx)}" ry="${n(p.ry)}" fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${String(s.strokeWidth)}"/>`;
    }
    case 'path': {
      const s = pathStyle(theme, p.role, p.filled);
      return `<path d="${esc(p.d)}" fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${String(s.strokeWidth)}"/>`;
    }
  }
}

/** A self-contained SVG document string (headless rendering / export). */
export function sceneToSvg(layout: Layout, theme: Theme = DEFAULT_THEME): string {
  const body = layout.primitives.map((p) => primitiveToSvg(p, theme)).join('\n  ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.width)}" height="${n(layout.height)}" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}">`,
    `  <rect width="${n(layout.width)}" height="${n(layout.height)}" fill="${esc(theme.background)}"/>`,
    `  ${body}`,
    `</svg>`,
  ].join('\n');
}
