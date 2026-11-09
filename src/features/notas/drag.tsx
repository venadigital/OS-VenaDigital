// Dragging a to-do: to another place in its list, to another day or section, or onto a view or list on the side.
// It runs outside React while it moves (the row, the line and the copy that follows the pointer are
// changed directly), so nothing re-renders until it is dropped.
import { createContext, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { type NotePatch, usePatchNotes } from '@/data/hooks';
import type { Note, NoteInput } from '@/data/types';
import { indexIn, type OrderKey, placeAt } from './order';

/**
 * A list of rows a to-do can be dropped into: what it holds as it shows, what joining it changes,
 * and whether it only takes its own rows (a month of Próximo has no day to give).
 */
export type DropGroup = { notes: Note[]; order: OrderKey; joins?: NoteInput; fixed?: boolean };

export type RowDrag = { onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void; 'data-drag-id': string };

type DragContext = {
  /** Props for a row that can be dragged. */
  row: (note: Note) => RowDrag;
  /** Props for the element around a group of rows; call it while rendering. */
  group: (key: string, group: DropGroup) => { 'data-drop-group': string };
};

const Ctx = createContext<DragContext | null>(null);

export function useNotasDrag(): DragContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotasDrag needs NotasDrag');
  return ctx;
}

type Live = { enabled: boolean; dropOn: (place: string, note: Note) => NoteInput | null; save: (patches: NotePatch[]) => void };

/**
 * Lets the rows inside it be dragged. `dropOn` says what dropping a to-do on a view or list on the
 * side (an element with `data-drop-place`) changes, or null when it is already there.
 */
export function NotasDrag({ enabled, dropOn, children }: { enabled: boolean; dropOn: Live['dropOn']; children: ReactNode }) {
  const patch = usePatchNotes('No se pudo mover');
  const live = useRef<Live>({ enabled, dropOn, save: patch.mutate });
  live.current = { enabled, dropOn, save: patch.mutate };
  const ghost = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [drag] = useState(() => dragController(live, ghost, line));
  useEffect(() => () => drag.cancel(), [drag]);

  return (
    <Ctx.Provider value={drag.context}>
      {children}
      {createPortal(
        <div aria-hidden className="task-drag-layer">
          <div ref={line} className="task-drop-line">
            <i />
            <span />
          </div>
          <div ref={ghost} className="task-ghost" />
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

/** How long a finger rests on a row before it lifts, so that scrolling still works. */
const HOLD_MS = 380;
const SLOP_TOUCH = 8;
const SLOP_MOUSE = 5;
const EDGE = 80;

type Target = { kind: 'group'; key: string; index: number } | { kind: 'place'; key: string };

type Session = {
  note: Note;
  el: HTMLElement;
  pointerId: number;
  touch: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  active: boolean;
  hold?: number;
  frame?: number;
  target: Target | null;
  placeEl: HTMLElement | null;
  origin: string | null;
};

function dragController(live: RefObject<Live>, ghost: RefObject<HTMLDivElement | null>, line: RefObject<HTMLDivElement | null>) {
  const groups = new Map<string, DropGroup>();
  let session: Session | null = null;

  const hideLine = () => {
    if (line.current) line.current.style.display = 'none';
  };
  const showLine = (top: number, left: number, width: number) => {
    const l = line.current;
    if (!l) return;
    l.style.display = 'flex';
    l.style.width = `${width}px`;
    l.style.transform = `translate(${left}px, ${top - 5}px)`;
  };
  const markPlace = (s: Session, el: HTMLElement | null) => {
    if (s.placeEl === el) return;
    s.placeEl?.classList.remove('is-drop-target');
    el?.classList.add('is-drop-target');
    s.placeEl = el;
  };

  /** Finds what is under the pointer and shows where the to-do would land. */
  const aim = (s: Session) => {
    const under = document.elementFromPoint(s.x, s.y);
    const place = under?.closest<HTMLElement>('[data-drop-place]');
    if (place) {
      const key = place.dataset.dropPlace as string;
      const ok = live.current.dropOn(key, s.note) !== null;
      markPlace(s, ok ? place : null);
      s.target = ok ? { kind: 'place', key } : null;
      hideLine();
      return;
    }
    markPlace(s, null);
    const groupEl = under?.closest<HTMLElement>('[data-drop-group]');
    const key = groupEl?.dataset.dropGroup;
    const group = key ? groups.get(key) : undefined;
    if (!groupEl || !key || !group || (group.fixed && key !== s.origin)) {
      s.target = null;
      hideLine();
      return;
    }
    const rects = [...groupEl.querySelectorAll<HTMLElement>('[data-drag-id]')].filter((r) => r !== s.el).map((r) => r.getBoundingClientRect());
    const index = rects.filter((r) => r.top + r.height / 2 < s.y).length;
    s.target = { kind: 'group', key, index };
    // Back where it was: its own empty place already says so.
    if (key === s.origin && indexIn(group.notes, s.note) === index) {
      hideLine();
      return;
    }
    const box = rects[0] ?? groupEl.getBoundingClientRect();
    const prev = rects[index - 1];
    const next = rects[index];
    const top = prev && next ? (prev.bottom + next.top) / 2 : next ? next.top - 1 : prev ? prev.bottom + 1 : groupEl.getBoundingClientRect().bottom - 4;
    showLine(top, box.left, box.width);
  };

  // Over a view or list on the side the copy shrinks and steps aside, so the place under the pointer shows.
  const follow = (s: Session) => {
    aim(s);
    const g = ghost.current;
    if (!g) return;
    const aside = s.target?.kind === 'place';
    g.classList.toggle('is-aside', aside);
    const [dx, dy] = aside ? [-16, -12] : [s.dx, s.dy];
    g.style.transform = `translate(${s.x - dx}px, ${s.y - dy}px) rotate(-0.6deg)`;
  };

  /** What dropping it there changes; nothing when it is where it was. */
  const landing = (s: Session): NotePatch[] => {
    const target = s.target;
    if (!target) return [];
    if (target.kind === 'place') {
      const p = live.current.dropOn(target.key, s.note);
      return p ? [{ id: s.note.id, patch: p }] : [];
    }
    const group = groups.get(target.key);
    if (!group) return [];
    const same = target.key === s.origin;
    if (same && indexIn(group.notes, s.note) === target.index) return [];
    const placed = placeAt(group.notes, s.note, target.index, group.order);
    if (same || !group.joins) return placed;
    return placed.map((p) => (p.id === s.note.id ? { ...p, patch: { ...group.joins, ...p.patch } } : p));
  };

  const lift = (s: Session) => {
    s.active = true;
    const rect = s.el.getBoundingClientRect();
    s.dx = s.x0 - rect.left;
    s.dy = s.y0 - rect.top;
    const g = ghost.current;
    if (g) {
      const copy = s.el.cloneNode(true) as HTMLElement;
      copy.removeAttribute('data-drag-id');
      g.replaceChildren(copy);
      g.style.width = `${rect.width}px`;
      g.style.display = 'block';
    }
    s.el.classList.add('is-drag-origin');
    document.body.classList.add('is-dragging-task');
    if (s.touch && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(8);
    follow(s);
    // Near the top or bottom of the screen the page scrolls along.
    const tick = () => {
      if (session !== s) return;
      const bottom = window.innerHeight - (s.touch ? EDGE + 60 : EDGE);
      const speed = s.y < EDGE ? (s.y - EDGE) / 4 : s.y > bottom ? (s.y - bottom) / 4 : 0;
      if (speed) {
        window.scrollBy(0, Math.max(-24, Math.min(24, speed)));
        aim(s);
      }
      s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);
  };

  const finish = (drop: boolean) => {
    const s = session;
    if (!s) return;
    session = null;
    window.clearTimeout(s.hold);
    if (s.frame) cancelAnimationFrame(s.frame);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('contextmenu', onContextMenu);
    if (!s.active) return;

    s.el.classList.remove('is-drag-origin');
    document.body.classList.remove('is-dragging-task');
    markPlace(s, null);
    hideLine();
    if (ghost.current) {
      ghost.current.style.display = 'none';
      ghost.current.replaceChildren();
    }
    // The click that ends a drag with the mouse must not open the row.
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    if (drop) {
      const patches = landing(s);
      if (patches.length) live.current.save(patches);
    }
  };

  function onMove(e: PointerEvent) {
    const s = session;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (s.active) return follow(s);
    const moved = Math.hypot(s.x - s.x0, s.y - s.y0);
    if (s.touch && moved > SLOP_TOUCH) finish(false);
    else if (!s.touch && moved > SLOP_MOUSE) lift(s);
  }
  function onUp(e: PointerEvent) {
    if (session && e.pointerId === session.pointerId) finish(true);
  }
  function onCancel() {
    finish(false);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') finish(false);
  }
  // While a row is lifted the finger moves it, not the page.
  function onTouchMove(e: TouchEvent) {
    if (session?.active) e.preventDefault();
  }
  function onContextMenu(e: Event) {
    e.preventDefault();
  }

  const context: DragContext = {
    row: (note) => ({
      'data-drag-id': note.id,
      onPointerDown: (e) => {
        if (!live.current.enabled || session || e.button !== 0 || !e.isPrimary) return;
        if ((e.target as HTMLElement).closest('.task-check, .task-more, a, input')) return;
        const el = e.currentTarget;
        const s: Session = {
          note,
          el,
          pointerId: e.pointerId,
          touch: e.pointerType !== 'mouse',
          x0: e.clientX,
          y0: e.clientY,
          x: e.clientX,
          y: e.clientY,
          dx: 0,
          dy: 0,
          active: false,
          target: null,
          placeEl: null,
          origin: el.closest<HTMLElement>('[data-drop-group]')?.dataset.dropGroup ?? null,
        };
        session = s;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
        if (s.touch) {
          document.addEventListener('touchmove', onTouchMove, { passive: false });
          document.addEventListener('contextmenu', onContextMenu);
          s.hold = window.setTimeout(() => session === s && lift(s), HOLD_MS);
        }
      },
    }),
    group: (key, group) => {
      groups.set(key, group);
      return { 'data-drop-group': key };
    },
  };

  return { context, cancel: () => finish(false) };
}
