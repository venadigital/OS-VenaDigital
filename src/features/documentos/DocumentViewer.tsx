import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Download, FileDown, FileText, Hand, Highlighter, LoaderCircle, PenLine, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/data/ApiContext';
import { qk, useDocument } from '@/data/hooks';
import type { Annotation, Doc, DocAnnotations, ShapeKind } from '@/data/types';
import { Button, IconButton, Menu, type MenuItem } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { deliverFile } from '@/lib/deliverFile';
import { firstPageThumbnail, openPdf, pdfErrorMessage, type PDFDocumentProxy, type PDFPageProxy } from './pdf';
import { DEFAULT_STYLES, DRAWING_TOOLS, mergeLineRects, pageMarks, translate, uid, withPage, type Box, type Tool, type ToolStyles } from './model';
import { PdfPage, type Shared } from './PdfPage';
import { TOOLS, ToolDock } from './Toolbar';
import './documentos.css';

type Status = 'idle' | 'saving' | 'saved' | 'error';
type PageInfo = { page: PDFPageProxy; width: number; height: number; transform: number[] };
type Anchor = { index: number; px: number; py: number };

const SAVE_DELAY = 1200;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const HISTORY = 100;
const STYLES_KEY = 'vena:doc-styles';
const PEN_KEY = 'vena:doc-pen';

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
const touchDevice = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: the preference just isn't remembered
  }
}

export default function DocumentViewer() {
  const { id = '' } = useParams();
  const doc = useDocument(id);
  const navigate = useNavigate();
  if (doc.isLoading) return <Centered>Abriendo documento…</Centered>;
  if (doc.error || !doc.data)
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span>No encontramos este documento.</span>
          <Button onClick={() => navigate('/documentos')}>Volver a Documentos</Button>
        </div>
      </Centered>
    );
  return <Viewer key={doc.data.id} doc={doc.data} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center text-[14px] text-ink-3">{children}</div>;
}

function Viewer({ doc }: { doc: Doc }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------- The PDF ----------
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    (async () => {
      const blob = await api.documentFile(doc);
      const p = await openPdf(new Uint8Array(await blob.arrayBuffer()));
      opened = p;
      const list = await Promise.all(
        Array.from({ length: p.numPages }, async (_, i) => {
          const page = await p.getPage(i + 1);
          const vp = page.getViewport({ scale: 1 });
          return { page, width: vp.width, height: vp.height, transform: vp.transform };
        }),
      );
      if (!alive) return;
      setPdf(p);
      setPages(list);
      // Cards show the first page; documents saved without one get it now.
      if (!doc.thumbnail) {
        const thumbnail = await firstPageThumbnail(p);
        if (thumbnail && alive) await api.updateDocument(doc.id, { thumbnail }).then(() => qc.invalidateQueries({ queryKey: qk.documents }));
      }
    })().catch((err) => {
      if (alive) setLoadError(pdfErrorMessage(err));
    });
    return () => {
      alive = false;
      void opened?.loadingTask.destroy();
    };
    // The file never changes for a document.
  }, []);

  // ---------- Marks, history and saving ----------
  const [marks, setMarks] = useState<DocAnnotations>(doc.annotations ?? {});
  const marksRef = useRef(marks);
  const undoStack = useRef<DocAnnotations[]>([]);
  const redoStack = useRef<DocAnnotations[]>([]);
  const [, setHistoryTick] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<DocAnnotations | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setStatus('saving');
    try {
      await api.updateDocument(doc.id, { annotations: next });
      setStatus('saved');
      void qc.invalidateQueries({ queryKey: qk.documents });
    } catch (err) {
      setStatus('error');
      pending.current = pending.current ?? next;
      toast(`No se pudieron guardar las anotaciones: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [api, doc.id, qc, toast]);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saving.current = saving.current.then(save);
    return saving.current;
  }, [save]);

  const apply = useCallback(
    (next: DocAnnotations) => {
      marksRef.current = next;
      setMarks(next);
      pending.current = next;
      setStatus('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );
  const commit = useCallback(
    (next: DocAnnotations) => {
      undoStack.current.push(marksRef.current);
      if (undoStack.current.length > HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setHistoryTick((t) => t + 1);
      apply(next);
    },
    [apply],
  );
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(marksRef.current);
    setHistoryTick((t) => t + 1);
    apply(prev);
  }, [apply]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(marksRef.current);
    setHistoryTick((t) => t + 1);
    apply(next);
  }, [apply]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  // ---------- Tools ----------
  const [tool, setToolState] = useState<Tool>('select');
  const [shape, setShape] = useState<ShapeKind>('rect');
  const [styles, setStylesState] = useState<ToolStyles>(() => {
    const saved = readLocal<Partial<ToolStyles>>(STYLES_KEY, {});
    return Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([k, v]) => [k, { ...v, ...(saved as Record<string, object>)[k] }])) as ToolStyles;
  });
  const setStyles = (s: ToolStyles) => {
    setStylesState(s);
    writeLocal(STYLES_KEY, s);
  };
  const [selected, setSelected] = useState<{ page: number; id: string } | null>(null);
  const selectedMark = selected ? pageMarks(marks, selected.page).find((m) => m.id === selected.id) ?? null : null;
  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    setSelected(null);
    window.getSelection()?.removeAllRanges();
  }, []);
  const drawing = DRAWING_TOOLS.includes(tool);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;

  // Apple Pencil: once seen, the pencil draws and fingers scroll (unless she asked otherwise).
  const [pen, setPenState] = useState(() => readLocal(PEN_KEY, { seen: false, finger: false }));
  const penMode = pen.seen && !pen.finger;
  const shared = useRef<Shared>({ touches: new Set(), gesture: false, penMode, editing: false, onPen: () => undefined }).current;
  shared.penMode = penMode;
  shared.onPen = () => {
    if (pen.seen) return;
    const next = { ...pen, seen: true };
    setPenState(next);
    writeLocal(PEN_KEY, next);
  };
  const setFingerDraws = (finger: boolean) => {
    const next = { ...pen, finger };
    setPenState(next);
    writeLocal(PEN_KEY, next);
  };

  const onPageChange = useCallback((index: number, next: Annotation[]) => commit(withPage(marksRef.current, index, next)), [commit]);
  const onSelect = useCallback((index: number, id: string | null) => setSelected(id ? { page: index, id } : null), []);

  const changeSelected = (patch: { color?: string; width?: number; size?: number }) => {
    if (!selected || !selectedMark) return;
    const next = { ...selectedMark, ...patch } as Annotation;
    commit(withPage(marksRef.current, selected.page, pageMarks(marksRef.current, selected.page).map((m) => (m.id === next.id ? next : m))));
  };
  const deleteSelected = useCallback(() => {
    if (!selected) return;
    commit(withPage(marksRef.current, selected.page, pageMarks(marksRef.current, selected.page).filter((m) => m.id !== selected.id)));
    setSelected(null);
  }, [commit, selected]);
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      commit(withPage(marksRef.current, selected.page, pageMarks(marksRef.current, selected.page).map((m) => (m.id === selected.id ? translate(m, dx, dy) : m))));
    },
    [commit, selected],
  );

  // ---------- Zoom ----------
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(zoom);
  const [renderZoom, setRenderZoom] = useState(1);
  const pendingAnchor = useRef<(Anchor & { cx: number; cy: number }) | null>(null);
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const gutter = isPhone ? 8 : 32;

  const pageEls = () => [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])];
  const anchorAt = (cx: number, cy: number): Anchor | null => {
    const els = pageEls();
    if (!els.length) return null;
    let best = els[0];
    let bestDist = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const dist = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
        if (!dist) break;
      }
    }
    const r = best.getBoundingClientRect();
    return { index: Number(best.dataset.page), px: (cx - r.left) / zoomRef.current, py: (cy - r.top) / zoomRef.current };
  };
  const applyAnchor = () => {
    const a = pendingAnchor.current;
    const scroller = scrollRef.current;
    if (!a || !scroller) return;
    pendingAnchor.current = null;
    const el = scroller.querySelector<HTMLElement>(`[data-page="${a.index}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    scroller.scrollLeft += r.left + a.px * zoomRef.current - a.cx;
    scroller.scrollTop += r.top + a.py * zoomRef.current - a.cy;
  };
  /** Zooms keeping the page point `anchor` under the screen point (cx, cy). */
  const zoomTo = (z: number, anchor: Anchor | null, cx: number, cy: number) => {
    const next = clampZoom(z);
    pendingAnchor.current = anchor ? { ...anchor, cx, cy } : null;
    if (Math.abs(next - zoomRef.current) < 0.0005) return applyAnchor();
    zoomRef.current = next;
    setZoomState(next);
  };
  const zoomAtCenter = (z: number) => {
    const r = scrollRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    zoomTo(z, anchorAt(cx, cy), cx, cy);
  };
  const fitZoom = () => {
    const w = scrollRef.current?.clientWidth ?? 800;
    const widest = Math.max(...pages.map((p) => p.width), 1);
    return clampZoom((w - gutter * 2) / widest);
  };
  useLayoutEffect(applyAnchor, [zoom]);
  useEffect(() => {
    const t = setTimeout(() => setRenderZoom(zoom), 180);
    return () => clearTimeout(t);
  }, [zoom]);

  // First view: the page width, never huge on a large screen.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (!pages.length || fitted.current) return;
    fitted.current = true;
    const z = isPhone ? fitZoom() : Math.min(fitZoom(), 1.5);
    zoomRef.current = z;
    setZoomState(z);
    setRenderZoom(z);
  });

  // ---------- Which pages are on screen ----------
  const [near, setNear] = useState<Set<number>>(new Set([0]));
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !pages.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        }),
      { root: scroller, rootMargin: '120% 0px' },
    );
    pageEls().forEach((el) => io.observe(el));
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mid = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.4;
        const els = pageEls();
        let idx = 0;
        for (const el of els) if (el.getBoundingClientRect().top <= mid) idx = Number(el.dataset.page);
        setCurrent(idx);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pages.length]);

  const goToPage = (n: number) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${Math.min(pages.length, Math.max(1, n)) - 1}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 12;
  };

  // ---------- Gestures: two fingers pan and pinch; ⌘/ctrl + wheel and trackpad pinch zoom ----------
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  const anchorAtRef = useRef(anchorAt);
  anchorAtRef.current = anchorAt;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number; anchor: Anchor | null } | null = null;
    let pan: { id: number; x: number; y: number } | null = null;
    let locked = false; // after a pinch, until every finger lifts
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      shared.touches.add(e.pointerId);
      if (!drawingRef.current) return; // the browser scrolls natively; Safari's gesture events zoom
      if (pts.size === 2) {
        const m = mid();
        pinch = { dist: m.dist, zoom: zoomRef.current, anchor: anchorAtRef.current(m.x, m.y) };
        shared.gesture = true;
        pan = null;
      } else if (pts.size === 1 && shared.penMode && !locked) {
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const m = mid();
        zoomToRef.current(pinch.zoom * (m.dist / pinch.dist), pinch.anchor, m.x, m.y);
      } else if (pan && pan.id === e.pointerId) {
        el.scrollLeft -= e.clientX - pan.x;
        el.scrollTop -= e.clientY - pan.y;
        pan = { ...pan, x: e.clientX, y: e.clientY };
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      shared.touches.delete(e.pointerId);
      if (pinch && pts.size < 2) {
        pinch = null;
        locked = pts.size > 0;
      }
      if (pan?.id === e.pointerId) pan = null;
      if (!pts.size) {
        locked = false;
        shared.gesture = false;
      }
    };
    // Safari (iPhone, iPad, Mac trackpad) pinch.
    let gStart: { zoom: number; anchor: Anchor | null } | null = null;
    const gesture = (e: Event) => {
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      e.preventDefault();
      if (shared.gesture) return; // two fingers already handled above
      if (e.type === 'gesturestart') gStart = { zoom: zoomRef.current, anchor: anchorAtRef.current(g.clientX, g.clientY) };
      else if (e.type === 'gesturechange' && gStart) zoomToRef.current(gStart.zoom * g.scale, gStart.anchor, g.clientX, g.clientY);
      else gStart = null;
    };
    // Chrome turns a trackpad pinch into ctrl + wheel.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomToRef.current(zoomRef.current * Math.exp(-e.deltaY * 0.01), anchorAtRef.current(e.clientX, e.clientY), e.clientX, e.clientY);
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.addEventListener(t, gesture, { passive: false });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
      for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.removeEventListener(t, gesture);
      el.removeEventListener('wheel', wheel);
    };
  }, [shared]);

  // ---------- Highlighting selected text ----------
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const highlightSelection = useCallback(() => {
    const sel = window.getSelection();
    const scroller = scrollRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !scroller || !scroller.contains(sel.anchorNode)) return false;
    const els = pageEls();
    const byPage = new Map<number, Box[]>();
    for (let i = 0; i < sel.rangeCount; i++) {
      for (const r of sel.getRangeAt(i).getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const el = els.find((p) => {
          const b = p.getBoundingClientRect();
          return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
        });
        if (!el) continue;
        const b = el.getBoundingClientRect();
        const z = zoomRef.current;
        const index = Number(el.dataset.page);
        const list = byPage.get(index) ?? [];
        list.push({ x: (r.left - b.left) / z, y: (r.top - b.top) / z, w: r.width / z, h: r.height / z });
        byPage.set(index, list);
      }
    }
    let next = marksRef.current;
    for (const [index, boxes] of byPage) {
      // Drop the page-sized boxes of whole elements caught in the range; keep the lines.
      const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
      const median = heights[Math.floor(heights.length / 2)];
      const rects = mergeLineRects(boxes.filter((b) => b.h <= median * 2.5));
      if (rects.length) next = withPage(next, index, [...pageMarks(next, index), { id: uid(), type: 'texthl', color: styles.texthl.color, rects }]);
    }
    sel.removeAllRanges();
    setHasTextSelection(false);
    if (next === marksRef.current) return false;
    commit(next);
    return true;
  }, [commit, styles.texthl.color]);

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      setHasTextSelection(Boolean(sel && !sel.isCollapsed && scrollRef.current?.contains(sel.anchorNode)));
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);
  // With a mouse, letting go of a selection in "Resaltar texto" highlights it right away.
  const onScrollerPointerUp = (e: React.PointerEvent) => {
    if (tool === 'texthl' && e.pointerType === 'mouse') setTimeout(highlightSelection, 0);
  };

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (k === '=' || k === '+' || k === '-' || k === '0')) {
        e.preventDefault();
        zoomAtCenter(k === '0' ? fitZoom() : zoomRef.current * (k === '-' ? 1 / 1.2 : 1.2));
        return;
      }
      if (mod || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key.startsWith('Arrow') && selected) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) / zoomRef.current;
        nudgeSelected(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
        return;
      }
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else setTool('select');
        return;
      }
      const t = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (t) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Name, download, delete ----------
  const [name, setName] = useState(doc.name);
  const saveName = async () => {
    const clean = name.trim() || 'Sin título';
    setName(clean);
    if (clean === doc.name) return;
    try {
      await api.updateDocument(doc.id, { name: clean });
      void qc.invalidateQueries({ queryKey: qk.documents });
    } catch (err) {
      toast(`No se pudo renombrar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
  const [exporting, setExporting] = useState(false);
  const downloadAnnotated = async () => {
    if (!pdf || exporting) return;
    setExporting(true);
    try {
      void flush();
      const { exportAnnotatedPdf } = await import('./exportPdf');
      const blob = await exportAnnotatedPdf(await pdf.getData(), marksRef.current, pages.map((p) => p.transform));
      await deliverFile(blob, `${name} (anotado).pdf`);
    } catch (err) {
      toast(`No se pudo preparar el PDF: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(false);
    }
  };
  const downloadOriginal = async () => {
    try {
      await deliverFile(await api.documentFile(doc), `${name}.pdf`);
    } catch (err) {
      toast(`No se pudo descargar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
  const remove = async () => {
    if (!confirm(`¿Borrar "${name}" y sus anotaciones? No se puede deshacer.`)) return;
    pending.current = null;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await api.deleteDocument(doc.id);
    await qc.invalidateQueries({ queryKey: qk.documents });
    navigate('/documentos');
  };

  const menu: MenuItem[] = [
    { label: 'Descargar PDF anotado', icon: <Download size={14} />, onSelect: () => void downloadAnnotated() },
    { label: 'Descargar original', icon: <FileDown size={14} />, onSelect: () => void downloadOriginal() },
    ...(touchDevice() && pen.seen
      ? [
          penMode
            ? { label: 'Dibujar también con el dedo', icon: <Hand size={14} />, onSelect: () => setFingerDraws(true) }
            : { label: 'Solo el lápiz dibuja', icon: <PenLine size={14} />, onSelect: () => setFingerDraws(false) },
        ]
      : []),
    { label: 'Borrar documento', icon: <Trash2 size={14} />, danger: true, onSelect: () => void remove() },
  ];

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const showHighlightButton = hasTextSelection && (tool === 'select' || tool === 'texthl');
  const pageStyle = useMemo(() => ({ padding: `${gutter}px ${gutter}px calc(150px + var(--safe-bottom))` }), [gutter]);

  return (
    <div className="doc-viewer flex h-dvh flex-col bg-page">
      <header
        className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-page px-2 md:px-4"
        style={{ paddingTop: 'var(--safe-top)', minHeight: 'calc(52px + var(--safe-top))' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-3">
          <Link to="/documentos" className="flex h-8 shrink-0 items-center gap-1 rounded-lg pr-2 pl-1 text-[13.5px] font-medium text-ink-2 hover:bg-fill">
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Documentos</span>
          </Link>
          <div className="hidden h-5 w-px bg-line sm:block" />
          <FileText size={16} className="hidden shrink-0 text-ink-2 sm:block" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={160}
            aria-label="Nombre del documento"
            className="doc-name min-w-0 flex-1 rounded-md px-1.5 py-1 text-[14.5px] font-semibold text-ink outline-none hover:bg-fill focus:bg-fill md:max-w-80"
          />
          <SaveStatus status={status} />
        </div>
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          {pages.length > 0 && (
            <div className="hidden items-center gap-1 text-[13px] text-ink-3 md:flex">
              <PageInput current={current + 1} total={pages.length} onGo={goToPage} />
            </div>
          )}
          <div className="hidden items-center md:flex">
            <IconButton label="Alejar" onClick={() => zoomAtCenter(zoomRef.current / 1.2)}>
              <ZoomOut size={17} />
            </IconButton>
            <button type="button" className="h-8 min-w-[52px] rounded-lg px-1.5 text-[13px] font-medium text-ink-2 tabular-nums hover:bg-fill" title="Ajustar al ancho" onClick={() => zoomAtCenter(fitZoom())}>
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Acercar" onClick={() => zoomAtCenter(zoomRef.current * 1.2)}>
              <ZoomIn size={17} />
            </IconButton>
          </div>
          <div className="hidden h-5 w-px bg-line md:block" />
          <IconButton label="Deshacer" onClick={undo} disabled={!canUndo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Rehacer" onClick={redo} disabled={!canRedo}>
            <Redo2 size={17} />
          </IconButton>
          <div className="hidden sm:block">
            <Button icon={exporting ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />} onClick={() => void downloadAnnotated()} disabled={!pdf || exporting}>
              Descargar
            </Button>
          </div>
          <Menu items={menu} />
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className={`doc-scroller${drawing ? ' is-drawing' : ''}`} onPointerUp={onScrollerPointerUp}>
          {loadError ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-[14px] text-ink-3">{loadError}</div>
          ) : !pages.length ? (
            <div className="flex h-full items-center justify-center gap-2 text-[14px] text-ink-3">
              <LoaderCircle size={16} className="animate-spin" /> Abriendo PDF…
            </div>
          ) : (
            <div className="doc-pages" style={pageStyle}>
              {pages.map((p, i) => (
                <PdfPage
                  key={i}
                  index={i}
                  page={p.page}
                  width={p.width}
                  height={p.height}
                  zoom={zoom}
                  renderZoom={renderZoom}
                  active={near.has(i)}
                  marks={pageMarks(marks, i)}
                  tool={tool}
                  shape={shape}
                  styles={styles}
                  selectedId={selected?.page === i ? selected.id : null}
                  shared={shared}
                  onChange={onPageChange}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
        {pages.length > 0 && (
          <div className="doc-page-chip md:hidden">
            {current + 1} / {pages.length}
          </div>
        )}
        {pages.length > 0 && (
          <ToolDock
            tool={tool}
            shape={shape}
            styles={styles}
            selected={tool === 'select' ? selectedMark : null}
            onTool={setTool}
            onShape={setShape}
            onStyles={setStyles}
            onSelectedChange={changeSelected}
            onDeleteSelected={deleteSelected}
            extra={
              showHighlightButton ? (
                <button
                  type="button"
                  className="doc-highlight-btn"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => highlightSelection()}
                >
                  <Highlighter size={16} /> Resaltar
                </button>
              ) : null
            }
          />
        )}
      </div>
    </div>
  );
}

function PageInput({ current, total, onGo }: { current: number; total: number; onGo: (n: number) => void }) {
  const [value, setValue] = useState(String(current));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setValue(String(current));
  }, [current, editing]);
  return (
    <>
      <input
        value={value}
        inputMode="numeric"
        aria-label="Página"
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          onGo(Number(value) || 1);
          (e.target as HTMLInputElement).blur();
        }}
        className="h-7 w-10 rounded-md bg-fill text-center text-[13px] font-medium text-ink tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
      />
      <span>/ {total}</span>
    </>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status === 'idle') return null;
  return (
    <span className="hidden shrink-0 items-center gap-1 text-[12.5px] text-ink-3 sm:flex">
      {status === 'saving' ? <LoaderCircle size={13} className="animate-spin" /> : status === 'saved' ? <Check size={14} /> : null}
      {status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : 'Sin guardar'}
    </span>
  );
}
