// Choosing several to-dos at once, and the bar at the bottom with what to do with them.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowRight, CalendarDays, Check, LayoutGrid, ListChecks, MoreHorizontal, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react';
import { cx } from '@/components/ui';
import { qk, useApiMutation, usePatchNotes } from '@/data/hooks';
import type { Note, NoteInput, NoteList } from '@/data/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { dayKey, fromDayKey } from '@/lib/time';
import { listTree, type Progress } from './lists';
import { ProgressRing } from './ProgressRing';
import { tomorrow, weekend, whenBucket, whenDate } from './tasks';

export type Selection = {
  on: boolean;
  ids: ReadonlySet<string>;
  start: () => void;
  stop: () => void;
  toggle: (id: string) => void;
  choose: (ids: string[]) => void;
  /** The to-dos the open view shows, for "Seleccionar todas". The view sets it while rendering. */
  shown: RefObject<string[]>;
};

const NONE: ReadonlySet<string> = new Set();

/** A selection for one place of Notas: it ends by itself when another view or list opens. */
export function useSelection(place: string): Selection {
  const [state, setState] = useState<{ place: string; ids: ReadonlySet<string> } | null>(null);
  const shown = useRef<string[]>([]);
  const on = state?.place === place;
  return {
    on,
    ids: on ? state.ids : NONE,
    start: () => setState({ place, ids: new Set() }),
    stop: () => setState(null),
    toggle: (id) =>
      setState((s) => {
        if (!s || s.place !== place) return s;
        const ids = new Set(s.ids);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { place, ids };
      }),
    choose: (ids) => setState((s) => (s && s.place === place ? { place, ids: new Set(ids) } : s)),
    shown,
  };
}

const Ctx = createContext<Selection | null>(null);
export const SelectionProvider = Ctx.Provider;

export function useSelectionCtx(): Selection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSelectionCtx needs SelectionProvider');
  return ctx;
}

export const selectedLabel = (n: number) => `${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}`;

/** "Seleccionar", or "Listo" while choosing. */
export function SelectToggle({ className }: { className?: string }) {
  const selection = useSelectionCtx();
  return (
    <button type="button" className={cx('notas-select', selection.on && 'is-on', className)} onClick={selection.on ? selection.stop : selection.start}>
      {selection.on ? 'Listo' : 'Seleccionar'}
    </button>
  );
}

type Pop = 'cuando' | 'mover' | 'mas';
type Item = { label: string; hint?: string; icon?: ReactNode; indent?: boolean; strong?: boolean; run: () => void };

/** The bar with what to do with the chosen to-dos. Each action ends the selection. */
export function SelectionBar({
  selection,
  notes,
  lists,
  progress,
  now,
  hasTimer,
}: {
  selection: Selection;
  notes: Note[];
  lists: NoteList[];
  progress: Map<string, Progress>;
  now: Date;
  hasTimer: boolean;
}) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [x, setX] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const patch = usePatchNotes();
  const remove = useApiMutation((api, ids: string[]) => Promise.all(ids.map((id) => api.deleteNote(id))), [qk.notes], 'No se pudo borrar');
  const chosen = notes.filter((n) => selection.ids.has(n.id));
  const count = chosen.length;

  // Centred under the open view, beside the list of views.
  useLayoutEffect(() => {
    const content = document.querySelector('.notas-content');
    if (!content) return;
    const place = () => {
      const r = content.getBoundingClientRect();
      setX(r.left + r.width / 2);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(content);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pop) setPop(null);
      else selection.stop();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop, selection]);

  const apply = (p: NoteInput) => {
    patch.mutate(chosen.map((n) => ({ id: n.id, patch: p })));
    setPop(null);
    selection.stop();
  };

  const today = dayKey(now);
  // "Jue 5": the weekday and day, without the month.
  const short = (date: string) => {
    const label = format(fromDayKey(date), 'EEE d', { locale: es }).replace(/\./g, '');
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const cuando: Item[] = [
    { label: 'Hoy', hint: short(today), run: () => apply({ ...whenDate(today), today_sort: null }) },
    { label: 'Mañana', hint: short(tomorrow(now)), run: () => apply(whenDate(tomorrow(now))) },
    { label: 'Este fin de semana', hint: short(weekend(now)), run: () => apply(whenDate(weekend(now))) },
    { label: 'Cuando sea', run: () => apply(whenBucket('cuando_sea')) },
    { label: 'Algún día', run: () => apply(whenBucket('algun_dia')) },
  ];

  const tree = listTree(lists);
  const listItem = (l: NoteList, indent = false): Item => ({
    label: l.name,
    indent,
    icon: <ProgressRing progress={progress.get(l.id)} />,
    run: () => apply({ list_id: l.id, section_id: null, sort: null }),
  });
  const mover: Item[] = [
    ...(chosen.some((n) => n.list_id) ? [{ label: 'Sin lista', run: () => apply({ list_id: null, section_id: null }) }] : []),
    ...tree.loose.map((l) => listItem(l)),
    ...tree.areas.flatMap(({ area, projects }) => [
      { label: area.name, strong: true, run: () => apply({ list_id: area.id, section_id: null, sort: null }) },
      ...projects.map((p) => listItem(p, true)),
    ]),
  ];

  const allDone = count > 0 && chosen.every((n) => n.done);
  const allPinned = count > 0 && chosen.every((n) => n.pinned);
  const shown = selection.shown.current;
  const mas: Item[] = [
    allDone
      ? { label: 'Marcar pendientes', icon: <RotateCcw size={15} />, run: () => apply({ done: false }) }
      : { label: 'Marcar hechas', icon: <Check size={15} />, run: () => apply({ done: true }) },
    allPinned
      ? { label: 'Desfijar', icon: <PinOff size={15} />, run: () => apply({ pinned: false }) }
      : { label: 'Fijar arriba', icon: <Pin size={15} />, run: () => apply({ pinned: true }) },
    { label: 'Mover al muro', icon: <LayoutGrid size={15} />, run: () => apply({ type: 'nota', list_id: null, section_id: null }) },
    ...(shown.length > count
      ? [{ label: 'Seleccionar todas', icon: <ListChecks size={15} />, run: () => (selection.choose(shown), setPop(null)) }]
      : []),
  ];

  const erase = () => {
    setPop(null);
    if (!confirm(count === 1 ? '¿Borrar esta tarea?' : `¿Borrar estas ${count} tareas?`)) return;
    remove.mutate(chosen.map((n) => n.id));
    selection.stop();
  };

  const toggle = (p: Pop) => setPop((open) => (open === p ? null : p));
  const menu = (items: Item[], label: string, extra?: ReactNode) => (
    <div role="menu" aria-label={label} className="select-pop">
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" className={cx('select-pop-item', it.indent && 'is-indented', it.strong && 'is-strong')} onClick={it.run}>
          {it.icon}
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          {it.hint && <span className="select-pop-hint">{it.hint}</span>}
        </button>
      ))}
      {extra}
    </div>
  );

  const action = (p: Pop | 'borrar', label: string, icon: ReactNode, run: () => void) => (
    <button
      type="button"
      className={cx('select-action', pop === p && 'is-open', p === 'mas' && 'is-more')}
      aria-label={p === 'mas' ? 'Más acciones' : undefined}
      aria-expanded={p === 'borrar' ? undefined : pop === p}
      disabled={count === 0 && p !== 'mas'}
      onClick={run}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div ref={root} className={cx('select-bar-wrap', hasTimer && 'has-timer')} style={{ '--bar-x': x === null ? '50%' : `${x}px` } as CSSProperties}>
      {pop === 'cuando' &&
        menu(
          cuando,
          'Cuándo',
          <label className="select-pop-item">
            <span className="min-w-0 flex-1">Elegir fecha…</span>
            <input
              type="date"
              aria-label="Elegir fecha"
              className="task-pill-date"
              onChange={(e) => e.target.value && apply(whenDate(e.target.value))}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Browsers that refuse it still open their own picker on tap.
                }
              }}
            />
          </label>,
        )}
      {pop === 'mover' && menu(mover, 'Mover a')}
      {pop === 'mas' && menu(mas, 'Más acciones')}
      <div role="toolbar" aria-label="Acciones de la selección" className="select-bar">
        <span className="select-count tnum">{selectedLabel(count)}</span>
        {action('cuando', 'Cuándo', <CalendarDays size={17} aria-hidden />, () => toggle('cuando'))}
        {action('mover', 'Mover', <ArrowRight size={17} aria-hidden />, () => toggle('mover'))}
        {action('borrar', 'Borrar', <Trash2 size={17} aria-hidden />, erase)}
        {action('mas', 'Más', <MoreHorizontal size={18} aria-hidden />, () => toggle('mas'))}
      </div>
    </div>
  );
}
