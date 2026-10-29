// One PDF page: the rendered page (canvas), its selectable text (PDF.js text layer) and the
// marks on top. The page owns the gesture in progress (stroke, shape, eraser, move) and
// reports the finished result with `onChange`.
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { TextLayer } from 'pdfjs-dist';
import { Check, Trash2 } from 'lucide-react';
import type { Annotation, InkPoint, ShapeKind } from '@/data/types';
import { MAX_CANVAS_PIXELS, type PDFPageProxy } from './pdf';
import {
  constrainShape,
  hitTest,
  hitTop,
  NOTE_COLORS,
  noteSize,
  simplify,
  TEXT_FONT,
  TEXT_LINE,
  textLines,
  textWidth,
  translate,
  uid,
  type Tool,
  type ToolStyles,
} from './model';
import { MarkView, SelectionBox } from './Marks';

/** State shared by every page and the viewer, read inside pointer handlers. */
export type Shared = {
  /** Touch pointers down on the viewer right now. */
  touches: Set<number>;
  /** Two fingers are panning or zooming: no page draws. */
  gesture: boolean;
  /** An Apple Pencil was seen: the pencil draws, fingers scroll. */
  penMode: boolean;
  /** A text box or a note is open somewhere. */
  editing: boolean;
  onPen: () => void;
};

type TextMark = Extract<Annotation, { type: 'text' }>;
type NoteMark = Extract<Annotation, { type: 'note' }>;

type Drag =
  | { kind: 'draw'; pointer: number; mark: Annotation }
  | { kind: 'erase'; pointer: number; ids: string[]; last: [number, number] }
  | { kind: 'move'; pointer: number; id: string; from: [number, number]; dx: number; dy: number; moved: boolean }
  | { kind: 'tap'; pointer: number; x: number; y: number; hitId: string | null; wasEditing: boolean; wasSelected: boolean };

type Props = {
  index: number;
  page: PDFPageProxy;
  width: number;
  height: number;
  zoom: number;
  /** Zoom the canvas is drawn at; trails `zoom` while pinching. */
  renderZoom: number;
  active: boolean;
  marks: Annotation[];
  tool: Tool;
  shape: ShapeKind;
  styles: ToolStyles;
  selectedId: string | null;
  shared: Shared;
  onChange: (index: number, next: Annotation[]) => void;
  onSelect: (index: number, id: string | null) => void;
};

export const PdfPage = memo(function PdfPage(props: Props) {
  const { index, page, width, height, zoom, renderZoom, active, marks, tool, shape, styles, selectedId, shared, onChange, onSelect } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasHolder = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const textLayer = useRef<TextLayer | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [editingText, setEditingText] = useState<{ mark: TextMark; isNew: boolean } | null>(null);
  const [openNote, setOpenNote] = useState<{ mark: NoteMark; isNew: boolean } | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  // ---------- Rendering of the page itself ----------
  useEffect(() => {
    const holder = canvasHolder.current;
    if (!holder) return;
    if (!active) {
      for (const c of holder.querySelectorAll('canvas')) c.width = c.height = 0;
      holder.replaceChildren();
      return;
    }
    const pixels = width * height * renderZoom * renderZoom;
    const outputScale = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / pixels));
    const viewport = page.getViewport({ scale: renderZoom * outputScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // Drawn apart and swapped in when ready, so zooming never flashes a blank page.
    const task = page.render({ canvas, viewport });
    task.promise
      .then(() => {
        for (const c of holder.querySelectorAll('canvas')) c.width = c.height = 0;
        holder.replaceChildren(canvas);
      })
      .catch(() => {
        canvas.width = canvas.height = 0;
      });
    return () => task.cancel();
  }, [active, page, renderZoom, width, height]);

  useEffect(() => {
    const container = textRef.current;
    if (!active || !container) return;
    container.replaceChildren();
    const layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport: page.getViewport({ scale: latest.current.renderZoom }) });
    textLayer.current = layer;
    layer
      .render()
      .then(() => {
        // Keeps a drag-selection from jumping to the end of the page (as in Firefox's viewer).
        const end = document.createElement('div');
        end.className = 'endOfContent';
        container.append(end);
      })
      .catch(() => undefined);
    return () => {
      layer.cancel();
      textLayer.current = null;
      container.replaceChildren();
    };
  }, [active, page]);

  useEffect(() => {
    textLayer.current?.update({ viewport: page.getViewport({ scale: renderZoom }) });
  }, [page, renderZoom]);

  // ---------- Pointer ----------
  const toPage = (clientX: number, clientY: number): [number, number] => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [((clientX - r.left) * width) / r.width, ((clientY - r.top) * height) / r.height];
  };
  const tolerance = (e: { pointerType: string }) => (e.pointerType === 'touch' ? 14 : 7) / zoom;
  const commit = (next: Annotation[]) => onChange(index, next);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'pen') shared.onPen();
    // A second finger: what the first one started is a pan or a pinch, not a stroke.
    if (e.pointerType === 'touch' && (shared.touches.size > 1 || shared.gesture)) {
      if (dragRef.current) setDrag(null);
      return;
    }
    if (dragRef.current) return;
    const drawing = tool !== 'select' && tool !== 'texthl';
    // With a pencil around, fingers only scroll (the viewer pans).
    if (drawing && e.pointerType === 'touch' && shared.penMode) return;
    const [x, y] = toPage(e.clientX, e.clientY);
    const p: InkPoint = [x, y, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
    const target = e.currentTarget;
    const capture = () => {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone; the gesture still works without capture
      }
    };

    if (tool === 'select') {
      const onHandle = (e.target as Element).getAttribute?.('data-handle') === 'move';
      const hit = onHandle ? marks.find((m) => m.id === selectedId) ?? null : hitTop(marks, x, y, tolerance(e), zoom);
      if (e.pointerType === 'mouse' || onHandle) {
        if (!hit) return onSelect(index, null);
        e.preventDefault();
        onSelect(index, hit.id);
        capture();
        setDrag({ kind: 'move', pointer: e.pointerId, id: hit.id, from: [x, y], dx: 0, dy: 0, moved: false });
      } else {
        setDrag({ kind: 'tap', pointer: e.pointerId, x: e.clientX, y: e.clientY, hitId: hit?.id ?? null, wasEditing: shared.editing, wasSelected: hit?.id === selectedId });
      }
      return;
    }
    if (tool === 'texthl') return;
    e.preventDefault();
    capture();
    if (tool === 'text' || tool === 'note') {
      const hit = hitTop(marks.filter((m) => m.type === tool), x, y, tolerance(e), zoom);
      setDrag({ kind: 'tap', pointer: e.pointerId, x: e.clientX, y: e.clientY, hitId: hit?.id ?? null, wasEditing: shared.editing, wasSelected: false });
      return;
    }
    if (tool === 'eraser') {
      const ids = marks.filter((m) => hitTest(m, x, y, tolerance(e), zoom)).map((m) => m.id);
      setDrag({ kind: 'erase', pointer: e.pointerId, ids, last: [x, y] });
      return;
    }
    const id = uid();
    const mark: Annotation =
      tool === 'pen'
        ? { id, type: 'ink', color: styles.pen.color, width: styles.pen.width, points: [p], pressure: e.pointerType === 'pen' }
        : tool === 'marker'
          ? { id, type: 'marker', color: styles.marker.color, width: styles.marker.width, points: [p] }
          : { id, type: shape, color: styles.shape.color, width: styles.shape.width, x1: x, y1: y, x2: x, y2: y };
    setDrag({ kind: 'draw', pointer: e.pointerId, mark });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (shared.gesture && e.pointerType === 'touch') return setDrag(null);
    if (d.kind === 'tap') {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) setDrag(null); // a scroll, not a tap
      return;
    }
    const [x, y] = toPage(e.clientX, e.clientY);
    if (d.kind === 'move') {
      const dx = x - d.from[0];
      const dy = y - d.from[1];
      setDrag({ ...d, dx, dy, moved: d.moved || Math.hypot(dx, dy) * zoom > 3 });
      return;
    }
    if (d.kind === 'erase') {
      const tol = tolerance(e);
      const mid: [number, number] = [(x + d.last[0]) / 2, (y + d.last[1]) / 2];
      const add = marks.filter((m) => !d.ids.includes(m.id) && (hitTest(m, x, y, tol, zoom) || hitTest(m, mid[0], mid[1], tol, zoom))).map((m) => m.id);
      setDrag({ ...d, ids: add.length ? [...d.ids, ...add] : d.ids, last: [x, y] });
      return;
    }
    const m = d.mark;
    if (m.type === 'ink' || m.type === 'marker') {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const pts = (events.length ? events : [e.nativeEvent]).map((ev): InkPoint => {
        const [px, py] = toPage(ev.clientX, ev.clientY);
        return [px, py, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5];
      });
      setDrag({ ...d, mark: { ...m, points: [...m.points, ...pts] } });
    } else if (m.type !== 'text' && m.type !== 'texthl' && m.type !== 'note') {
      const [x2, y2] = e.shiftKey ? constrainShape(m.type, m.x1, m.y1, x, y) : [x, y];
      setDrag({ ...d, mark: { ...m, x2, y2 } });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    setDrag(null);
    if (d.kind === 'draw') {
      const m = d.mark;
      if (m.type === 'ink' || m.type === 'marker') return commit([...marks, { ...m, points: simplify(m.points) }]);
      if (m.type === 'text' || m.type === 'texthl' || m.type === 'note') return;
      if (Math.abs(m.x2 - m.x1) * zoom < 4 && Math.abs(m.y2 - m.y1) * zoom < 4) return;
      return commit([...marks, m]);
    }
    if (d.kind === 'erase') {
      if (d.ids.length) commit(marks.filter((m) => !d.ids.includes(m.id)));
      return;
    }
    if (d.kind === 'move') {
      const m = marks.find((x) => x.id === d.id);
      if (!m) return;
      if (d.moved) return commit(marks.map((x) => (x.id === d.id ? translate(x, d.dx, d.dy) : x)));
      if (m.type === 'note') openNoteEditor(m, false);
      else if (m.type === 'text' && e.pointerType !== 'mouse') openTextEditor(m, false); // a mouse double-clicks instead
      return;
    }
    // A tap.
    const hit = d.hitId ? marks.find((m) => m.id === d.hitId) ?? null : null;
    if (tool === 'select') {
      onSelect(index, hit?.id ?? null);
      if (hit?.type === 'note') openNoteEditor(hit, false);
      else if (hit?.type === 'text' && d.wasSelected) openTextEditor(hit, false);
      return;
    }
    if (d.wasEditing) return; // the tap only closed the open text box or note
    const [x, y] = toPage(e.clientX, e.clientY);
    if (tool === 'text') {
      if (hit?.type === 'text') return openTextEditor(hit, false);
      const size = styles.text.size;
      openTextEditor({ id: uid(), type: 'text', color: styles.text.color, size, x, y: y - size * 0.62, text: '' }, true);
    } else if (tool === 'note') {
      if (hit?.type === 'note') return openNoteEditor(hit, false);
      const s = noteSize(zoom);
      openNoteEditor({ id: uid(), type: 'note', color: styles.note.color, x: x - s / 2, y: y - s / 2, text: '' }, true);
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointer === e.pointerId) setDrag(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'select') return;
    const [x, y] = toPage(e.clientX, e.clientY);
    const hit = hitTop(marks, x, y, 7 / zoom, zoom);
    if (hit?.type === 'text') openTextEditor(hit, false);
  };

  // ---------- Text boxes and notes ----------
  const openTextEditor = (mark: TextMark, isNew: boolean) => {
    shared.editing = true;
    setEditingText({ mark, isNew });
  };
  const openNoteEditor = (mark: NoteMark, isNew: boolean) => {
    shared.editing = true;
    onSelect(index, isNew ? null : mark.id);
    setOpenNote({ mark, isNew });
  };
  const finishEdit = (mark: Annotation, isNew: boolean, text: string) => {
    shared.editing = false;
    const current = latest.current.marks;
    if (!text.trim()) {
      if (!isNew) commit(current.filter((m) => m.id !== mark.id));
      return;
    }
    const next = { ...mark, text } as Annotation;
    const prev = current.find((m) => m.id === mark.id) as TextMark | NoteMark | undefined;
    if (isNew || !prev) commit([...current, next]);
    else if (prev.text !== text || prev.color !== mark.color) commit(current.map((m) => (m.id === mark.id ? next : m)));
  };

  // ---------- What is shown ----------
  const d = drag;
  const shown = marks.map((m) => {
    if (d?.kind === 'move' && d.id === m.id && d.moved) return translate(m, d.dx, d.dy);
    return m;
  });
  const hidden = new Set<string>([editingText?.mark.id ?? '', openNote?.isNew ? openNote.mark.id : ''].filter(Boolean));
  const erasing = d?.kind === 'erase' ? new Set(d.ids) : null;
  const selected = tool === 'select' ? shown.find((m) => m.id === selectedId) : undefined;
  const drawing = tool !== 'select' && tool !== 'texthl';

  const style = {
    width: width * zoom,
    height: height * zoom,
    '--total-scale-factor': zoom,
    '--scale-round-x': '1px',
    '--scale-round-y': '1px',
  } as CSSProperties;

  return (
    <div
      ref={wrapRef}
      data-page={index}
      className={`doc-page doc-tool-${tool}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
    >
      <div ref={canvasHolder} className="doc-canvas" />
      <div ref={textRef} className="textLayer" />
      <svg className={`doc-marks${drawing ? ' doc-marks--drawing' : ''}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Only note pins depend on the zoom; the rest scale with the viewBox. */}
        {shown.map((m) => (hidden.has(m.id) ? null : <MarkView key={m.id} mark={m} zoom={m.type === 'note' ? zoom : 1} faded={erasing?.has(m.id)} />))}
        {d?.kind === 'draw' && <MarkView mark={d.mark} zoom={zoom} live />}
        {openNote?.isNew && <MarkView mark={openNote.mark} zoom={zoom} />}
        {selected && !editingText && <SelectionBox mark={selected} zoom={zoom} />}
      </svg>
      {editingText && (
        <TextEditor
          key={editingText.mark.id}
          mark={editingText.mark}
          zoom={zoom}
          onDone={(text) => {
            const { mark, isNew } = editingText;
            setEditingText(null);
            finishEdit(mark, isNew, text);
          }}
        />
      )}
      {openNote && (
        <NoteEditor
          key={openNote.mark.id}
          mark={openNote.mark}
          zoom={zoom}
          pageWidth={width}
          onColor={(color) => setOpenNote({ ...openNote, mark: { ...openNote.mark, color } })}
          onDone={(text, deleted) => {
            const { mark, isNew } = openNote;
            setOpenNote(null);
            finishEdit(mark, isNew, deleted ? '' : text);
          }}
        />
      )}
    </div>
  );
});

/**
 * A text box typed in place. iOS zooms the page into any field under 16px, so small text
 * is typed at 16px and scaled down to its real size.
 */
function TextEditor({ mark, zoom, onDone }: { mark: TextMark; zoom: number; onDone: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(mark.text);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };
  const px = mark.size * zoom;
  const font = Math.max(16, px);
  const k = px / font;
  const lines = textLines(text || ' ');
  const w = Math.max(mark.size * 2, ...lines.map((l) => textWidth(l, mark.size))) + mark.size;
  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      aria-label="Texto"
      spellCheck
      className="doc-text-editor"
      style={{
        left: mark.x * zoom,
        top: mark.y * zoom,
        width: (w * zoom) / k,
        height: (lines.length * mark.size * TEXT_LINE * zoom) / k,
        fontSize: font,
        lineHeight: TEXT_LINE,
        fontFamily: TEXT_FONT,
        color: mark.color,
        transform: k === 1 ? undefined : `scale(${k})`,
      }}
    />
  );
}

function NoteEditor({
  mark,
  zoom,
  pageWidth,
  onColor,
  onDone,
}: {
  mark: NoteMark;
  zoom: number;
  pageWidth: number;
  onColor: (color: string) => void;
  onDone: (text: string, deleted?: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(mark.text);
  const done = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const finish = (deleted?: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(text, deleted);
  };
  const s = noteSize(zoom);
  const W = Math.min(260, pageWidth * zoom - 12);
  let left = (mark.x + s) * zoom + 8;
  if (left + W > pageWidth * zoom - 6) left = mark.x * zoom - W - 8;
  left = Math.max(6, left);
  // Buttons keep the focus in the text, so tapping them never closes the note.
  const keepFocus = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      ref={box}
      className="doc-note-editor"
      style={{ left, top: Math.max(6, mark.y * zoom), width: W }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={text}
        rows={4}
        placeholder="Nota"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          if (box.current?.contains(e.relatedTarget as Node | null)) return;
          finish();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            finish();
          }
        }}
        aria-label="Nota"
        style={{ background: `color-mix(in srgb, ${mark.color} 22%, var(--color-overlay))` }}
      />
      <div className="doc-note-actions">
        <div className="flex items-center gap-1.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label="Color de la nota"
              aria-pressed={c === mark.color}
              className="doc-swatch doc-swatch--sm"
              style={{ background: c }}
              onPointerDown={keepFocus}
              onClick={() => onColor(c)}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="doc-icon-btn" aria-label="Borrar nota" title="Borrar nota" onPointerDown={keepFocus} onClick={() => finish(true)}>
            <Trash2 size={15} />
          </button>
          <button type="button" className="doc-icon-btn doc-icon-btn--accent" aria-label="Listo" title="Listo" onPointerDown={keepFocus} onClick={() => finish()}>
            <Check size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
