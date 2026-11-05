// The drawing bar: tools over the live page, marks that scroll with it, and the camera. It runs
// in the frame that scrolls, inside a shadow root so the page and the bar don't affect each
// other. Marks exist only here: what stays is what gets captured.
import type { Annotation, InkPoint, ShapeKind } from '@/data/types';
import {
  arrowHead,
  constrainShape,
  DEFAULT_STYLES,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_OPACITY,
  hitTest,
  hitTop,
  INK_COLORS,
  inkOutline,
  linePath,
  MARKER_WIDTHS,
  PEN_WIDTHS,
  polygonPath,
  SHAPE_WIDTHS,
  simplify,
  TEXT_BASELINE,
  TEXT_FONT,
  TEXT_LINE,
  TEXT_SIZES,
  textLines,
  textWidth,
  uid,
  type ToolStyles,
} from '@/features/documentos/model';
import { ICONS } from './icons';
import { OVERLAY_CSS } from './overlay-css';

declare const chrome: any; // eslint-disable-line @typescript-eslint/no-explicit-any

type Tool = 'hand' | 'pen' | 'marker' | 'eraser' | 'text' | 'shape' | 'capture';
type TextMark = Extract<Annotation, { type: 'text' }>;
type Rect = { left: number; top: number; width: number; height: number };
type Status = { status: 'idle' | 'saving' | 'saved' | 'error'; message?: string };

const SVG = 'http://www.w3.org/2000/svg';
const MIN_MARQUEE = 8;
const SAVED_MS = 7000;
const SHAPE_ICONS: Record<ShapeKind, string> = { rect: 'square', ellipse: 'circle', line: 'slash', arrow: 'move-up-right' };
const SHAPE_LABELS: Record<ShapeKind, string> = { rect: 'Rectángulo', ellipse: 'Círculo', line: 'Línea', arrow: 'Flecha' };
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'hand', label: 'Usar la página', key: 'V' },
  { id: 'pen', label: 'Lápiz', key: 'P' },
  { id: 'marker', label: 'Resaltador', key: 'H' },
  { id: 'eraser', label: 'Borrador', key: 'E' },
  { id: 'text', label: 'Texto', key: 'T' },
  { id: 'shape', label: 'Formas', key: 'R' },
  { id: 'capture', label: 'Captura', key: 'C' },
];
const TOOL_ICONS: Record<Exclude<Tool, 'shape'>, string> = { hand: 'mouse-pointer-2', pen: 'pen-line', marker: 'highlighter', eraser: 'eraser', text: 'type', capture: 'camera' };

// ---------- Small DOM helpers ----------
function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function icon(name: string, size = 19): SVGElement {
  const root = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const [tag, attrs] of ICONS[name] ?? []) root.append(svg(tag, attrs));
  return root;
}
function button(className: string, label: string, content: Node | string, onClick: () => void, pressed?: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', label);
  b.title = label;
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
  b.append(content);
  b.addEventListener('click', onClick);
  return b;
}

/** A mark as SVG, in the page's coordinates. */
function markNode(a: Annotation, faded = false, live = false): SVGElement {
  const opacity = faded ? 0.25 : 1;
  switch (a.type) {
    case 'ink':
      return svg('path', { d: polygonPath(inkOutline(a, !live)), fill: a.color, opacity });
    case 'marker':
      return svg('path', { d: linePath(a.points), fill: 'none', stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: faded ? 0.12 : HIGHLIGHT_OPACITY });
    case 'rect':
      return svg('rect', { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1), fill: 'none', stroke: a.color, 'stroke-width': a.width, 'stroke-linejoin': 'round', opacity });
    case 'ellipse':
      return svg('ellipse', { cx: (a.x1 + a.x2) / 2, cy: (a.y1 + a.y2) / 2, rx: Math.abs(a.x2 - a.x1) / 2, ry: Math.abs(a.y2 - a.y1) / 2, fill: 'none', stroke: a.color, 'stroke-width': a.width, opacity });
    case 'line':
    case 'arrow': {
      const g = svg('g', { fill: 'none', stroke: a.color, 'stroke-width': a.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity });
      g.append(svg('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }));
      if (a.type === 'arrow') {
        const [h1, h2] = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width);
        g.append(svg('polyline', { points: `${h1.join(',')} ${a.x2},${a.y2} ${h2.join(',')}` }));
      }
      return g;
    }
    case 'text': {
      const t = svg('text', { fill: a.color, 'font-size': a.size, 'font-family': TEXT_FONT, opacity });
      t.style.whiteSpace = 'pre';
      textLines(a.text).forEach((line, i) => {
        const span = svg('tspan', { x: a.x, y: a.y + a.size * (TEXT_BASELINE + i * TEXT_LINE) });
        span.textContent = line || ' ';
        t.append(span);
      });
      return t;
    }
    default:
      return svg('g');
  }
}

function start() {
  const shared = globalThis as unknown as { __venaOverlay?: boolean; __venaCapture?: { element?: () => Element | null } };
  if (shared.__venaOverlay) return;
  shared.__venaOverlay = true;
  document.querySelector('vena-overlay')?.remove(); // left by a previous load of the extension
  const scroller = shared.__venaCapture?.element?.() ?? null;
  const root = () => document.scrollingElement ?? document.documentElement;

  // ---------- Structure ----------
  const host = document.createElement('vena-overlay');
  for (const [k, v] of Object.entries({ all: 'initial', display: 'block', position: 'fixed', inset: '0', 'z-index': '2147483647', 'pointer-events': 'none' })) host.style.setProperty(k, v, 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(OVERLAY_CSS);
  shadow.adoptedStyleSheets = [sheet];

  const surface = document.createElement('div');
  const marksSvg = svg('svg');
  marksSvg.setAttribute('class', 'marks');
  const layer = svg('g');
  const marksGroup = svg('g');
  const liveGroup = svg('g');
  layer.append(marksGroup, liveGroup);
  marksSvg.append(layer);
  surface.append(marksSvg);
  const dock = document.createElement('div');
  dock.className = 'dock';
  const toastEl = document.createElement('div');
  toastEl.className = 'bar toast hidden';
  const stylesEl = document.createElement('div');
  const toolsEl = document.createElement('div');
  toolsEl.className = 'bar tools';
  toolsEl.setAttribute('role', 'toolbar');
  toolsEl.setAttribute('aria-label', 'Herramientas de dibujo');
  dock.append(toastEl, stylesEl, toolsEl);
  shadow.append(surface, dock);
  document.documentElement.append(host);

  // ---------- State ----------
  let tool: Tool = 'pen';
  let shape: ShapeKind = 'rect';
  let styles: ToolStyles = DEFAULT_STYLES;
  let marks: Annotation[] = [];
  let undoStack: Annotation[][] = [];
  let redoStack: Annotation[][] = [];
  let busy = false;
  let confirmingClose = false;
  let saving = 0;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  chrome.storage?.local.get(['overlayStyles', 'overlayShape']).then((saved: { overlayStyles?: Partial<ToolStyles>; overlayShape?: ShapeKind }) => {
    if (saved.overlayStyles) styles = { ...styles, ...saved.overlayStyles };
    if (saved.overlayShape) shape = saved.overlayShape;
    renderDock();
  }).catch(() => undefined);
  const remember = () => void chrome.storage?.local.set({ overlayStyles: styles, overlayShape: shape }).catch(() => undefined);

  // ---------- Where things are ----------
  const area = (): Rect => {
    if (!scroller) return { left: 0, top: 0, width: root().clientWidth, height: root().clientHeight };
    const r = scroller.getBoundingClientRect();
    const left = Math.max(0, r.left + scroller.clientLeft);
    const top = Math.max(0, r.top + scroller.clientTop);
    return { left, top, width: Math.min(innerWidth, left + scroller.clientWidth) - left, height: Math.min(innerHeight, top + scroller.clientHeight) - top };
  };
  const scrolled = (): [number, number] => (scroller ? [scroller.scrollLeft, scroller.scrollTop] : [scrollX, scrollY]);
  const toPage = (clientX: number, clientY: number): [number, number] => {
    const r = area();
    const [sx, sy] = scrolled();
    return [clientX - r.left + sx, clientY - r.top + sy];
  };
  const place = () => {
    const r = area();
    surface.style.left = `${r.left}px`;
    surface.style.top = `${r.top}px`;
    surface.style.width = `${r.width}px`;
    surface.style.height = `${r.height}px`;
    const [sx, sy] = scrolled();
    layer.setAttribute('transform', `translate(${-sx} ${-sy})`);
  };
  const scrollSource: EventTarget = scroller ?? window;

  // ---------- Marks and history ----------
  const renderMarks = (fading?: Set<string>) => marksGroup.replaceChildren(...marks.map((m) => markNode(m, fading?.has(m.id))));
  const commit = (next: Annotation[]) => {
    undoStack.push(marks);
    redoStack = [];
    marks = next;
    renderMarks();
    renderDock();
  };
  const undo = () => {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(marks);
    marks = prev;
    renderMarks();
    renderDock();
  };
  const redo = () => {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(marks);
    marks = next;
    renderMarks();
    renderDock();
  };

  // ---------- The bar ----------
  const setTool = (t: Tool) => {
    closeEditor();
    cancelMarquee();
    tool = t;
    surface.className = `surface ${t === 'hand' ? 'off' : t}`;
    confirmingClose = false;
    renderDock();
  };
  const setStyle = <K extends keyof ToolStyles>(key: K, patch: Partial<ToolStyles[K]>) => {
    styles = { ...styles, [key]: { ...styles[key], ...patch } };
    remember();
    renderDock();
  };
  const sep = () => {
    const s = document.createElement('span');
    s.className = 'sep';
    return s;
  };
  const swatches = (colors: string[], value: string, onChange: (c: string) => void, custom = false) => {
    const group = document.createElement('div');
    group.className = 'swatches';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Color');
    for (const c of colors) {
      const b = button('swatch', `Color ${c}`, '', () => onChange(c), value === c);
      b.style.background = c;
      group.append(b);
    }
    if (custom) {
      const label = document.createElement('label');
      label.className = 'swatch custom';
      label.title = 'Otro color';
      const own = !colors.includes(value);
      if (own) {
        label.style.background = value;
        label.setAttribute('aria-pressed', 'true');
      }
      const input = document.createElement('input');
      input.type = 'color';
      input.value = value;
      input.setAttribute('aria-label', 'Otro color');
      input.addEventListener('change', () => onChange(input.value));
      label.append(input);
      group.append(label);
    }
    return group;
  };
  const widths = (list: number[], value: number, onChange: (w: number) => void) => {
    const group = document.createElement('div');
    group.className = 'group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Grosor');
    const max = Math.max(...list);
    for (const w of list) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.width = dot.style.height = `${4 + (w / max) * 14}px`;
      group.append(button('mini', `Grosor ${w}`, dot, () => onChange(w), value === w));
    }
    return group;
  };

  const renderStyles = () => {
    stylesEl.replaceChildren();
    stylesEl.className = 'bar styles';
    if (confirmingClose) {
      const text = document.createElement('span');
      text.textContent = '¿Cerrar y borrar los trazos?';
      stylesEl.append(
        text,
        button('action', 'Seguir dibujando', 'Seguir', () => {
          confirmingClose = false;
          renderDock();
        }),
        button('action primary', 'Cerrar y borrar', 'Cerrar', stop),
      );
      return;
    }
    switch (tool) {
      case 'pen':
        stylesEl.append(swatches(INK_COLORS, styles.pen.color, (color) => setStyle('pen', { color }), true), sep(), widths(PEN_WIDTHS, styles.pen.width, (width) => setStyle('pen', { width })));
        return;
      case 'marker':
        stylesEl.append(swatches(HIGHLIGHT_COLORS, styles.marker.color, (color) => setStyle('marker', { color })), sep(), widths(MARKER_WIDTHS, styles.marker.width, (width) => setStyle('marker', { width })));
        return;
      case 'shape': {
        const kinds = document.createElement('div');
        kinds.className = 'group';
        for (const k of Object.keys(SHAPE_ICONS) as ShapeKind[]) {
          kinds.append(
            button('mini', SHAPE_LABELS[k], icon(SHAPE_ICONS[k], 16), () => {
              shape = k;
              remember();
              renderDock();
            }, shape === k),
          );
        }
        stylesEl.append(kinds, sep(), swatches(INK_COLORS, styles.shape.color, (color) => setStyle('shape', { color }), true), sep(), widths(SHAPE_WIDTHS, styles.shape.width, (width) => setStyle('shape', { width })));
        return;
      }
      case 'text': {
        const sizes = document.createElement('div');
        sizes.className = 'group';
        TEXT_SIZES.forEach((s, i) => {
          const letter = document.createElement('span');
          letter.textContent = 'A';
          letter.style.fontSize = `${11 + i * 3}px`;
          letter.style.fontWeight = '600';
          sizes.append(button('mini', `Tamaño ${s}`, letter, () => setStyle('text', { size: s }), styles.text.size === s));
        });
        stylesEl.append(swatches(INK_COLORS, styles.text.color, (color) => setStyle('text', { color }), true), sep(), sizes);
        return;
      }
      case 'eraser': {
        const clear = button('action', 'Borrar todo', 'Borrar todo', () => commit([]));
        clear.prepend(icon('trash-2', 15));
        clear.disabled = !marks.length;
        stylesEl.append(clear);
        return;
      }
      case 'capture': {
        const screen = button('action', 'Capturar la pantalla', 'Pantalla', () => requestShot('visible'));
        screen.prepend(icon('maximize', 15));
        const whole = button('action', 'Capturar la página completa', 'Completo', () => requestShot('page'));
        whole.prepend(icon('scroll-text', 15));
        stylesEl.append(screen, whole);
        return;
      }
      default:
        stylesEl.className = 'hidden-bar';
    }
  };
  const renderDock = () => {
    renderStyles();
    const buttons = TOOLS.map((t) => button('tool', `${t.label} · ${t.key}`, icon(t.id === 'shape' ? SHAPE_ICONS[shape] : TOOL_ICONS[t.id]), () => setTool(t.id), tool === t.id));
    const undoBtn = button('tool', 'Deshacer', icon('undo-2'), undo);
    undoBtn.disabled = !undoStack.length;
    const redoBtn = button('tool', 'Rehacer', icon('redo-2'), redo);
    redoBtn.disabled = !redoStack.length;
    toolsEl.replaceChildren(...buttons, sep(), undoBtn, redoBtn, sep(), button('tool', 'Cerrar', icon('x'), requestClose));
  };

  const showToast = (content: (Node | string)[], ms?: number) => {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.replaceChildren(...content);
    toastEl.classList.remove('hidden');
    toastEl.hidden = false;
    if (ms) {
      toastTimer = setTimeout(() => {
        toastEl.classList.add('hidden');
        toastEl.hidden = true;
      }, ms);
    }
  };
  const hideToast = () => {
    toastEl.classList.add('hidden');
    toastEl.hidden = true;
  };
  hideToast();

  const onStatus = ({ status, message }: Status) => {
    if (status === 'idle') {
      if (!saving) hideToast();
      return;
    }
    if (status === 'saving') {
      saving += 1;
      const spin = icon('loader-circle', 15);
      spin.setAttribute('class', 'spin');
      showToast([spin, 'Guardando en el OS…']);
      return;
    }
    if (status === 'saved') {
      saving = Math.max(0, saving - 1);
      if (saving) return;
      const ok = icon('check', 15);
      ok.setAttribute('class', 'good');
      const link = button('link', 'Ver capturas', 'Ver capturas', () => void chrome.runtime.sendMessage({ type: 'open-captures' }));
      showToast([ok, 'Guardada', link], SAVED_MS);
      return;
    }
    saving = Math.max(0, saving - 1);
    const alert = icon('circle-alert', 15);
    alert.setAttribute('class', 'crit');
    showToast([alert, message ?? 'No se pudo guardar.'], SAVED_MS * 2);
  };

  // ---------- Text boxes ----------
  let editor: HTMLTextAreaElement | null = null;
  let finishEditor: (() => void) | null = null;
  const closeEditor = () => finishEditor?.();
  const openEditor = (mark: TextMark, isNew: boolean) => {
    const [sx, sy] = scrolled();
    const area = document.createElement('textarea');
    area.className = 'editor';
    area.value = mark.text;
    area.setAttribute('aria-label', 'Texto');
    area.spellcheck = true;
    area.style.left = `${mark.x - sx}px`;
    area.style.top = `${mark.y - sy}px`;
    area.style.fontSize = `${mark.size}px`;
    area.style.lineHeight = String(TEXT_LINE);
    area.style.fontFamily = TEXT_FONT;
    area.style.color = mark.color;
    const fit = () => {
      const lines = textLines(area.value || ' ');
      area.style.width = `${Math.max(mark.size * 2, ...lines.map((l) => textWidth(l, mark.size))) + mark.size}px`;
      area.style.height = `${lines.length * mark.size * TEXT_LINE}px`;
    };
    fit();
    area.addEventListener('input', fit);
    let done = false;
    finishEditor = () => {
      if (done) return;
      done = true;
      const text = area.value;
      area.remove();
      editor = null;
      finishEditor = null;
      const others = marks.filter((m) => m.id !== mark.id);
      if (text.trim()) commit([...others, { ...mark, text }]);
      else if (!isNew) commit(others);
      else renderMarks();
    };
    area.addEventListener('blur', () => finishEditor?.());
    area.addEventListener('pointerdown', (e) => e.stopPropagation());
    area.addEventListener('keydown', (e) => {
      e.stopPropagation(); // what is typed isn't a shortcut, for the bar or for the site
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        area.blur();
      }
    });
    for (const type of ['keyup', 'keypress', 'input'] as const) area.addEventListener(type, (e) => e.stopPropagation());
    if (!isNew) marksGroup.replaceChildren(...marks.filter((m) => m.id !== mark.id).map((m) => markNode(m)));
    surface.append(area);
    editor = area;
    area.focus({ preventScroll: true });
    area.setSelectionRange(area.value.length, area.value.length);
  };

  // ---------- Drawing ----------
  type Drag =
    | { kind: 'draw'; pointer: number; mark: Annotation }
    | { kind: 'erase'; pointer: number; ids: Set<string>; last: [number, number] }
    | { kind: 'marquee'; pointer: number; x0: number; y0: number; x1: number; y1: number };
  let drag: Drag | null = null;
  let marqueeEl: HTMLDivElement | null = null;
  const tolerance = (e: PointerEvent) => (e.pointerType === 'touch' ? 14 : 7);

  const showMarquee = (d: Extract<Drag, { kind: 'marquee' }>) => {
    if (!marqueeEl) {
      marqueeEl = document.createElement('div');
      marqueeEl.className = 'marquee';
      shadow.append(marqueeEl);
    }
    marqueeEl.style.left = `${Math.min(d.x0, d.x1)}px`;
    marqueeEl.style.top = `${Math.min(d.y0, d.y1)}px`;
    marqueeEl.style.width = `${Math.abs(d.x1 - d.x0)}px`;
    marqueeEl.style.height = `${Math.abs(d.y1 - d.y0)}px`;
  };
  function cancelMarquee() {
    marqueeEl?.remove();
    marqueeEl = null;
    if (drag?.kind === 'marquee') drag = null;
  }

  surface.addEventListener('pointerdown', (e) => {
    if (busy || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (editor) {
      closeEditor(); // the click only closes the open box
      return;
    }
    e.preventDefault();
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone; the gesture still works without capture
    }
    const [x, y] = toPage(e.clientX, e.clientY);
    const point: InkPoint = [x, y, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
    const id = uid();
    switch (tool) {
      case 'pen':
        drag = { kind: 'draw', pointer: e.pointerId, mark: { id, type: 'ink', color: styles.pen.color, width: styles.pen.width, points: [point], pressure: e.pointerType === 'pen' } };
        break;
      case 'marker':
        drag = { kind: 'draw', pointer: e.pointerId, mark: { id, type: 'marker', color: styles.marker.color, width: styles.marker.width, points: [point] } };
        break;
      case 'shape':
        drag = { kind: 'draw', pointer: e.pointerId, mark: { id, type: shape, color: styles.shape.color, width: styles.shape.width, x1: x, y1: y, x2: x, y2: y } };
        break;
      case 'eraser':
        drag = { kind: 'erase', pointer: e.pointerId, ids: new Set(marks.filter((m) => hitTest(m, x, y, tolerance(e))).map((m) => m.id)), last: [x, y] };
        renderMarks(drag.ids);
        break;
      case 'capture':
        drag = { kind: 'marquee', pointer: e.pointerId, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
        showMarquee(drag);
        break;
      case 'text': {
        const hit = hitTop(marks.filter((m) => m.type === 'text'), x, y, tolerance(e));
        if (hit?.type === 'text') openEditor(hit, false);
        else openEditor({ id, type: 'text', color: styles.text.color, size: styles.text.size, x, y: y - styles.text.size * 0.62, text: '' }, true);
        break;
      }
    }
  });
  surface.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    if (d.kind === 'marquee') {
      d.x1 = e.clientX;
      d.y1 = e.clientY;
      showMarquee(d);
      return;
    }
    const [x, y] = toPage(e.clientX, e.clientY);
    if (d.kind === 'erase') {
      const tol = tolerance(e);
      const mid: [number, number] = [(x + d.last[0]) / 2, (y + d.last[1]) / 2];
      for (const m of marks) if (hitTest(m, x, y, tol) || hitTest(m, mid[0], mid[1], tol)) d.ids.add(m.id);
      d.last = [x, y];
      renderMarks(d.ids);
      return;
    }
    const m = d.mark;
    if (m.type === 'ink' || m.type === 'marker') {
      const events = e.getCoalescedEvents?.() ?? [];
      const pts = (events.length ? events : [e]).map((ev): InkPoint => {
        const [px, py] = toPage(ev.clientX, ev.clientY);
        return [px, py, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5];
      });
      d.mark = { ...m, points: [...m.points, ...pts] };
    } else if (m.type === 'rect' || m.type === 'ellipse' || m.type === 'line' || m.type === 'arrow') {
      const [x2, y2] = e.shiftKey ? constrainShape(m.type, m.x1, m.y1, x, y) : [x, y];
      d.mark = { ...m, x2, y2 };
    }
    liveGroup.replaceChildren(markNode(d.mark, false, true));
  });
  surface.addEventListener('pointerup', (e) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    drag = null;
    liveGroup.replaceChildren();
    if (d.kind === 'marquee') {
      cancelMarquee();
      const r = area();
      const left = Math.max(r.left, Math.min(d.x0, d.x1));
      const top = Math.max(r.top, Math.min(d.y0, d.y1));
      const right = Math.min(r.left + r.width, Math.max(d.x0, d.x1));
      const bottom = Math.min(r.top + r.height, Math.max(d.y0, d.y1));
      if (right - left >= MIN_MARQUEE && bottom - top >= MIN_MARQUEE) requestShot('region', { left, top, width: right - left, height: bottom - top });
      return;
    }
    if (d.kind === 'erase') {
      if (d.ids.size) commit(marks.filter((m) => !d.ids.has(m.id)));
      else renderMarks();
      return;
    }
    const m = d.mark;
    if (m.type === 'ink' || m.type === 'marker') return commit([...marks, { ...m, points: simplify(m.points) }]);
    if (m.type === 'rect' || m.type === 'ellipse' || m.type === 'line' || m.type === 'arrow') {
      if (Math.abs(m.x2 - m.x1) < 4 && Math.abs(m.y2 - m.y1) < 4) return;
      commit([...marks, m]);
    }
  });
  surface.addEventListener('pointercancel', () => {
    drag = null;
    liveGroup.replaceChildren();
    cancelMarquee();
    renderMarks();
  });
  // While drawing the bar has the pointer, but the page still scrolls under it.
  surface.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      (scroller ?? root()).scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'instant' });
    },
    { passive: false },
  );

  // ---------- Capture ----------
  function requestShot(mode: 'region' | 'visible' | 'page', box?: Rect) {
    if (busy) return;
    closeEditor();
    busy = true;
    surface.classList.add('off');
    void chrome.runtime.sendMessage({ type: 'shot', mode, box, kind: scroller ? 'element' : 'document' }).catch(() => {
      finishShot();
      onStatus({ status: 'error', message: 'La extensión se actualizó. Recarga la página.' });
    });
  }
  const hideForPhoto = () =>
    new Promise<void>((resolve) => {
      dock.classList.add('hidden');
      toastEl.classList.add('hidden');
      cancelMarquee();
      // Until it's really gone from the screen. A hidden frame gets no frames, so it has a limit.
      const done = () => setTimeout(resolve, 40);
      const timer = setTimeout(done, 200);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearTimeout(timer);
          done();
        }),
      );
    });
  function finishShot() {
    busy = false;
    dock.classList.remove('hidden');
    surface.className = `surface ${tool === 'hand' ? 'off' : tool}`;
  }

  // ---------- Keyboard ----------
  const onKey = (e: KeyboardEvent) => {
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (busy) {
      if (e.key === 'Escape') {
        handled();
        void chrome.runtime.sendMessage({ type: 'cancel' });
      }
      return;
    }
    if (tool === 'hand') return; // the page is in use: its keys are its own
    const t = e.composedPath()[0] as HTMLElement;
    if (t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName)) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      handled();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      handled();
      if (drag?.kind === 'marquee') cancelMarquee();
      else setTool('hand');
      return;
    }
    const match = TOOLS.find((x) => x.key.toLowerCase() === k);
    if (match) {
      handled();
      setTool(match.id);
    }
  };

  // ---------- Opening and closing ----------
  const onMessage = (msg: { type: string } & Status, _sender: unknown, respond: (v: unknown) => void) => {
    if (msg.type === 'prepare') {
      void hideForPhoto().then(() => respond(true));
      return true;
    }
    if (msg.type === 'restore') finishShot();
    else if (msg.type === 'status') onStatus(msg);
    else if (msg.type === 'close') requestClose();
    return false;
  };
  function requestClose() {
    if (!marks.length) return stop();
    confirmingClose = true;
    renderDock();
  }
  function stop() {
    closeEditor();
    chrome.runtime.onMessage.removeListener(onMessage);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    scrollSource.removeEventListener('scroll', place);
    host.remove();
    delete shared.__venaOverlay;
  }

  chrome.runtime.onMessage.addListener(onMessage);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  scrollSource.addEventListener('scroll', place, { passive: true });
  surface.className = 'surface pen';
  place();
  renderDock();
}

start();
