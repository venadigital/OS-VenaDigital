// Floating tool dock of the PDF viewer: the tools, and above them the colors and sizes of
// the tool in hand (or of the selected mark).
import type { ReactNode } from 'react';
import { Circle, Eraser, Highlighter, MousePointer2, MoveUpRight, PenLine, Slash, Square, StickyNote, TextSelect, Trash2, Type } from 'lucide-react';
import type { Annotation, ShapeKind } from '@/data/types';
import { cx } from '@/components/ui';
import { HIGHLIGHT_COLORS, INK_COLORS, MARKER_WIDTHS, NOTE_COLORS, PEN_WIDTHS, SHAPE_WIDTHS, TEXT_SIZES, type Tool, type ToolStyles } from './model';

const SHAPE_ICONS: Record<ShapeKind, typeof Square> = { rect: Square, ellipse: Circle, line: Slash, arrow: MoveUpRight };
const SHAPE_LABELS: Record<ShapeKind, string> = { rect: 'Rectángulo', ellipse: 'Círculo', line: 'Línea', arrow: 'Flecha' };

export const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Seleccionar', key: 'V' },
  { id: 'pen', label: 'Lápiz', key: 'P' },
  { id: 'marker', label: 'Resaltador', key: 'H' },
  { id: 'texthl', label: 'Resaltar texto', key: 'S' },
  { id: 'eraser', label: 'Borrador', key: 'E' },
  { id: 'text', label: 'Texto', key: 'T' },
  { id: 'shape', label: 'Formas', key: 'R' },
  { id: 'note', label: 'Nota', key: 'N' },
];

function ToolIcon({ tool, shape }: { tool: Tool; shape: ShapeKind }) {
  const p = { size: 19, strokeWidth: 1.75 };
  switch (tool) {
    case 'select':
      return <MousePointer2 {...p} />;
    case 'pen':
      return <PenLine {...p} />;
    case 'marker':
      return <Highlighter {...p} />;
    case 'texthl':
      return <TextSelect {...p} />;
    case 'eraser':
      return <Eraser {...p} />;
    case 'text':
      return <Type {...p} />;
    case 'shape': {
      const Icon = SHAPE_ICONS[shape];
      return <Icon {...p} />;
    }
    case 'note':
      return <StickyNote {...p} />;
  }
}

type DockProps = {
  tool: Tool;
  shape: ShapeKind;
  styles: ToolStyles;
  selected: Annotation | null;
  onTool: (t: Tool) => void;
  onShape: (s: ShapeKind) => void;
  onStyles: (s: ToolStyles) => void;
  onSelectedChange: (patch: { color?: string; width?: number; size?: number }) => void;
  onDeleteSelected: () => void;
  extra?: ReactNode;
};

export function ToolDock({ tool, shape, styles, selected, onTool, onShape, onStyles, onSelectedChange, onDeleteSelected, extra }: DockProps) {
  return (
    <div className="doc-dock">
      {extra}
      <StyleBar
        tool={tool}
        shape={shape}
        styles={styles}
        selected={selected}
        onShape={onShape}
        onStyles={onStyles}
        onSelectedChange={onSelectedChange}
        onDeleteSelected={onDeleteSelected}
      />
      <div className="doc-toolbar" role="toolbar" aria-label="Herramientas">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="doc-tool"
            aria-pressed={tool === t.id}
            aria-label={t.label}
            title={`${t.label} · ${t.key}`}
            onClick={() => onTool(t.id)}
          >
            <ToolIcon tool={t.id} shape={shape} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleBar({
  tool,
  shape,
  styles,
  selected,
  onShape,
  onStyles,
  onSelectedChange,
  onDeleteSelected,
}: Omit<DockProps, 'onTool' | 'extra'>) {
  const set = <K extends keyof ToolStyles>(k: K, patch: Partial<ToolStyles[K]>) => onStyles({ ...styles, [k]: { ...styles[k], ...patch } });

  if (tool === 'select') {
    if (!selected) return null;
    const palette = selected.type === 'marker' || selected.type === 'texthl' ? HIGHLIGHT_COLORS : selected.type === 'note' ? NOTE_COLORS : INK_COLORS;
    const widths =
      selected.type === 'ink' ? PEN_WIDTHS : selected.type === 'marker' ? MARKER_WIDTHS : 'x1' in selected ? SHAPE_WIDTHS : null;
    return (
      <Bar>
        <Swatches colors={palette} value={selected.color} onChange={(color) => onSelectedChange({ color })} custom={palette === INK_COLORS} />
        {widths && 'width' in selected && (
          <>
            <Sep />
            <Widths widths={widths} value={selected.width} onChange={(width) => onSelectedChange({ width })} />
          </>
        )}
        {selected.type === 'text' && (
          <>
            <Sep />
            <Sizes value={selected.size} onChange={(size) => onSelectedChange({ size })} />
          </>
        )}
        <Sep />
        <button type="button" className="doc-icon-btn doc-icon-btn--danger" aria-label="Borrar selección" title="Borrar · Supr" onClick={onDeleteSelected}>
          <Trash2 size={16} />
        </button>
      </Bar>
    );
  }
  switch (tool) {
    case 'pen':
      return (
        <Bar>
          <Swatches colors={INK_COLORS} value={styles.pen.color} onChange={(color) => set('pen', { color })} custom />
          <Sep />
          <Widths widths={PEN_WIDTHS} value={styles.pen.width} onChange={(width) => set('pen', { width })} />
        </Bar>
      );
    case 'marker':
      return (
        <Bar>
          <Swatches colors={HIGHLIGHT_COLORS} value={styles.marker.color} onChange={(color) => set('marker', { color })} />
          <Sep />
          <Widths widths={MARKER_WIDTHS} value={styles.marker.width} onChange={(width) => set('marker', { width })} />
        </Bar>
      );
    case 'texthl':
      return (
        <Bar>
          <Swatches colors={HIGHLIGHT_COLORS} value={styles.texthl.color} onChange={(color) => set('texthl', { color })} />
        </Bar>
      );
    case 'shape':
      return (
        <Bar>
          <div className="flex items-center gap-0.5" role="group" aria-label="Forma">
            {(Object.keys(SHAPE_ICONS) as ShapeKind[]).map((k) => {
              const Icon = SHAPE_ICONS[k];
              return (
                <button key={k} type="button" className="doc-mini" aria-pressed={shape === k} aria-label={SHAPE_LABELS[k]} title={SHAPE_LABELS[k]} onClick={() => onShape(k)}>
                  <Icon size={16} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>
          <Sep />
          <Swatches colors={INK_COLORS} value={styles.shape.color} onChange={(color) => set('shape', { color })} custom />
          <Sep />
          <Widths widths={SHAPE_WIDTHS} value={styles.shape.width} onChange={(width) => set('shape', { width })} />
        </Bar>
      );
    case 'text':
      return (
        <Bar>
          <Swatches colors={INK_COLORS} value={styles.text.color} onChange={(color) => set('text', { color })} custom />
          <Sep />
          <Sizes value={styles.text.size} onChange={(size) => set('text', { size })} />
        </Bar>
      );
    case 'note':
      return (
        <Bar>
          <Swatches colors={NOTE_COLORS} value={styles.note.color} onChange={(color) => set('note', { color })} />
        </Bar>
      );
    default:
      return null;
  }
}

function Bar({ children }: { children: ReactNode }) {
  return <div className="doc-stylebar">{children}</div>;
}

function Sep() {
  return <span className="doc-sep" aria-hidden />;
}

function Swatches({ colors, value, onChange, custom }: { colors: string[]; value: string; onChange: (c: string) => void; custom?: boolean }) {
  const own = custom && !colors.includes(value);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Color">
      {colors.map((c) => (
        <button key={c} type="button" className="doc-swatch" aria-label={`Color ${c}`} aria-pressed={value === c} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      {custom && (
        <label className={cx('doc-swatch doc-swatch--custom', own && 'is-on')} title="Otro color" style={own ? { background: value } : undefined}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Otro color" />
        </label>
      )}
    </div>
  );
}

function Widths({ widths, value, onChange }: { widths: number[]; value: number; onChange: (w: number) => void }) {
  const max = Math.max(...widths);
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Grosor">
      {widths.map((w) => (
        <button key={w} type="button" className="doc-mini" aria-pressed={value === w} aria-label={`Grosor ${w}`} title={`Grosor ${w}`} onClick={() => onChange(w)}>
          <span className="doc-width-dot" style={{ width: 4 + (w / max) * 14, height: 4 + (w / max) * 14 }} />
        </button>
      ))}
    </div>
  );
}

function Sizes({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Tamaño del texto">
      {TEXT_SIZES.map((s, i) => (
        <button key={s} type="button" className="doc-mini" aria-pressed={value === s} aria-label={`Tamaño ${s}`} title={`Tamaño ${s}`} onClick={() => onChange(s)}>
          <span style={{ fontSize: 11 + i * 3, fontWeight: 600, lineHeight: 1 }}>A</span>
        </button>
      ))}
    </div>
  );
}
