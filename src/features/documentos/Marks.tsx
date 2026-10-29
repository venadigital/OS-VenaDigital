// SVG drawing of the marks over a page (viewBox in page units, so they scale with the zoom).
import { memo } from 'react';
import type { Annotation } from '@/data/types';
import { arrowHead, bbox, HIGHLIGHT_OPACITY, inkOutline, linePath, noteSize, polygonPath, TEXT_BASELINE, TEXT_FONT, TEXT_LINE, textLines, type Box } from './model';

const multiply = { mixBlendMode: 'multiply' as const };

export const MarkView = memo(function MarkView({ mark: a, zoom, live, faded }: { mark: Annotation; zoom: number; live?: boolean; faded?: boolean }) {
  const opacity = faded ? 0.25 : undefined;
  switch (a.type) {
    case 'ink':
      return <path d={polygonPath(inkOutline(a, !live))} fill={a.color} opacity={opacity} />;
    case 'marker':
      return (
        <path
          d={linePath(a.points)}
          fill="none"
          stroke={a.color}
          strokeWidth={a.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={faded ? 0.12 : HIGHLIGHT_OPACITY}
          style={multiply}
        />
      );
    case 'texthl':
      return (
        <g fill={a.color} opacity={faded ? 0.12 : HIGHLIGHT_OPACITY} style={multiply}>
          {a.rects.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx={Math.min(2, h / 6)} />
          ))}
        </g>
      );
    case 'rect':
      return (
        <rect
          x={Math.min(a.x1, a.x2)}
          y={Math.min(a.y1, a.y2)}
          width={Math.abs(a.x2 - a.x1)}
          height={Math.abs(a.y2 - a.y1)}
          fill="none"
          stroke={a.color}
          strokeWidth={a.width}
          strokeLinejoin="round"
          opacity={opacity}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          cx={(a.x1 + a.x2) / 2}
          cy={(a.y1 + a.y2) / 2}
          rx={Math.abs(a.x2 - a.x1) / 2}
          ry={Math.abs(a.y2 - a.y1) / 2}
          fill="none"
          stroke={a.color}
          strokeWidth={a.width}
          opacity={opacity}
        />
      );
    case 'line':
    case 'arrow': {
      const head = a.type === 'arrow' ? arrowHead(a.x1, a.y1, a.x2, a.y2, a.width) : null;
      return (
        <g fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" opacity={opacity}>
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
          {head && <polyline points={`${head[0].join(',')} ${a.x2},${a.y2} ${head[1].join(',')}`} />}
        </g>
      );
    }
    case 'text':
      return (
        <text fill={a.color} fontSize={a.size} fontFamily={TEXT_FONT} opacity={opacity} style={{ whiteSpace: 'pre' }}>
          {textLines(a.text).map((line, i) => (
            <tspan key={i} x={a.x} y={a.y + a.size * (TEXT_BASELINE + i * TEXT_LINE)}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      );
    case 'note': {
      const s = noteSize(zoom);
      return (
        <g transform={`translate(${a.x} ${a.y}) scale(${s / 24})`} opacity={opacity} className="doc-note-pin">
          <path d="M3 2.5h18a1.5 1.5 0 0 1 1.5 1.5v11.5l-7 7H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 3 2.5Z" fill={a.color} stroke="rgb(0 0 0 / 0.28)" strokeWidth="1" />
          <path d="M22.5 15.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5" fill="rgb(0 0 0 / 0.08)" stroke="rgb(0 0 0 / 0.28)" strokeWidth="1" />
          <path d="M7 8h10M7 11.5h10M7 15h5" stroke="rgb(0 0 0 / 0.45)" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    }
  }
});

/** Dashed frame around the selected mark; its inside is the handle that moves it. */
export function SelectionBox({ mark, zoom }: { mark: Annotation; zoom: number }) {
  const b: Box = bbox(mark, zoom);
  const pad = 5 / zoom;
  return (
    <g>
      <rect
        x={b.x - pad}
        y={b.y - pad}
        width={b.w + pad * 2}
        height={b.h + pad * 2}
        rx={4 / zoom}
        fill="transparent"
        stroke="var(--accent)"
        strokeWidth={1.25}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
        data-handle="move"
        className="doc-selection-handle"
      />
    </g>
  );
}
