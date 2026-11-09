import { useMemo, type ReactNode } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageHeader } from '@/components/Shell';
import { Empty, Skeleton } from '@/components/ui';
import type { CalendarEvent, Note } from '@/data/types';
import { dayKey } from '@/lib/time';
import { eventsOfDay } from '@/features/calendario/model';
import { useAgendaEvents } from '@/features/calendario/useAgendaEvents';
import { useTimeData } from '@/features/tiempo/model';
import { AgendaList } from './AgendaList';
import { type Delivery, deliveriesFor } from './deliveries';
import { useDeliveryRows } from './DeliveryRow';
import { useNotasDrag } from './drag';
import { NotasBack } from './NotasBack';
import { SelectToggle, useSelectionCtx } from './selection';
import { dateOf, groupUpcoming, isTask, orderKeyOf, sortTasks, TASK_VIEWS, taskView, type TaskView, whenDate, withDays } from './tasks';
import { TaskRow } from './TaskRow';
import { useTaskRows } from './useTaskRows';

const EMPTY: Record<TaskView, string> = {
  entrada: 'Entrada vacía',
  hoy: 'Nada para hoy',
  proximo: 'Nada programado',
  cuando: 'Nada por aquí',
  algun: 'Nada por aquí',
  registro: 'Aún no hay tareas hechas',
};

export function TaskPanel({
  view,
  notes,
  listNames,
  now,
  loading,
  onOpen,
}: {
  view: TaskView;
  notes: Note[];
  listNames: Map<string, string>;
  now: Date;
  loading: boolean;
  onOpen: (n: Note) => void;
}) {
  const today = dayKey(now);
  const { actions, shows, rowState } = useTaskRows({ listKey: view, belongs: (n) => isTask(n) && taskView(n, today) === view, onOpen });
  const tasks = sortTasks(notes.filter(shows), view, today);
  const selection = useSelectionCtx();
  const drag = useNotasDrag();
  selection.shown.current = tasks.map((n) => n.id);

  const row = (n: Note) => {
    const state = rowState(n);
    return (
      <TaskRow
        key={n.id}
        note={n}
        {...state}
        place={view}
        now={now}
        listName={n.list_id ? listNames.get(n.list_id) : undefined}
        actions={actions}
        pick={selection.on ? { selected: selection.ids.has(n.id), onToggle: () => selection.toggle(n.id) } : undefined}
        drag={view === 'registro' || state.done ? undefined : drag.row(n)}
      />
    );
  };

  const label = TASK_VIEWS.find((v) => v.id === view)?.label ?? '';
  const dateLine = format(now, "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="notas-tasks">
      <NotasBack selectable={tasks.length > 0} />
      <PageHeader
        eyebrow={view === 'hoy' ? dateLine.charAt(0).toUpperCase() + dateLine.slice(1) : undefined}
        title={label}
        right={tasks.length > 0 || selection.on ? <SelectToggle className="notas-select-wide" /> : undefined}
      />
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : view === 'hoy' ? (
        <TodayList tasks={tasks} row={row} now={now} />
      ) : view === 'proximo' ? (
        <UpcomingList tasks={tasks} row={row} now={now} />
      ) : tasks.length === 0 ? (
        <Empty title={EMPTY[view]} />
      ) : (
        <div className="task-list" {...(view === 'registro' ? {} : drag.group(view, { notes: tasks, order: orderKeyOf(view) }))}>
          {tasks.map(row)}
        </div>
      )}
    </div>
  );
}

type RowOf = (n: Note) => ReactNode;

/** Deliveries of Tiempo can't be chosen with the to-dos: while choosing they stay, faded. */
function Inert({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? (
    <div inert className="task-inert">
      {children}
    </div>
  ) : (
    children
  );
}

/** Today's events, then deliveries due today or late, then the to-dos. */
function TodayList({ tasks, row, now }: { tasks: Note[]; row: RowOf; now: Date }) {
  const dayStart = startOfDay(now).getTime();
  const range = useMemo(() => ({ from: new Date(dayStart), to: addDays(new Date(dayStart), 1) }), [dayStart]);
  const { eventsQ, colorOf } = useAgendaEvents(range.from, range.to);
  const events = eventsOfDay(eventsQ.data ?? [], range.from);
  const time = useTimeData();
  const deliveries = useDeliveryRows('hoy', now, true);
  const due = deliveriesFor(time.tasks, time.projectById, dayKey(now), deliveries.kept).today;
  const selecting = useSelectionCtx().on;
  const drag = useNotasDrag();

  if (!events.length && !due.length && !tasks.length) return <Empty title={EMPTY.hoy} />;
  return (
    <>
      <AgendaList events={events} now={now} colorOf={colorOf} boxed />
      {(due.length > 0 || tasks.length > 0) && (
        <div className="task-list" {...drag.group('hoy', { notes: tasks, order: 'today_sort' })}>
          {due.length > 0 && <Inert on={selecting}>{due.map(deliveries.row)}</Inert>}
          {tasks.map(row)}
        </div>
      )}
    </>
  );
}

type Entry = { kind: 'entrega'; delivery: Delivery } | { kind: 'nota'; note: Note };

/** Each coming day with its events, deliveries and to-dos; then the months after. */
function UpcomingList({ tasks, row, now }: { tasks: Note[]; row: RowOf; now: Date }) {
  const dayStart = startOfDay(now).getTime();
  const range = useMemo(() => ({ from: addDays(new Date(dayStart), 1), to: addDays(new Date(dayStart), 8) }), [dayStart]);
  const { eventsQ, colorOf } = useAgendaEvents(range.from, range.to);
  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (let d = range.from; d < range.to; d = addDays(d, 1)) {
      const list = eventsOfDay(eventsQ.data ?? [], d);
      if (list.length) byDay.set(dayKey(d), list);
    }
    return byDay;
  }, [eventsQ.data, range]);
  const time = useTimeData();
  const deliveries = useDeliveryRows('proximo', now, false);
  const due = deliveriesFor(time.tasks, time.projectById, dayKey(now), deliveries.kept).upcoming;
  const selecting = useSelectionCtx().on;
  const drag = useNotasDrag();

  const entries: Entry[] = [...due.map((delivery) => ({ kind: 'entrega' as const, delivery })), ...tasks.map((note) => ({ kind: 'nota' as const, note }))];
  const groups = withDays(
    groupUpcoming(entries, (e) => (e.kind === 'entrega' ? e.delivery.due : dateOf(e.note)), now),
    [...eventsByDay.keys()],
    now,
  );

  if (groups.length === 0) return <Empty title={EMPTY.proximo} />;
  return (
    <>
      {groups.map((g) => {
        const notes = g.tasks.flatMap((e) => (e.kind === 'nota' ? [e.note] : []));
        // A day takes to-dos from other days; a month only reorders its own, it has no day to give.
        const target = drag.group(`proximo:${g.key}`, { notes, order: 'sort', joins: g.day ? whenDate(g.key) : undefined, fixed: !g.day });
        return (
          <section key={g.key} className="task-group" aria-label={g.day ? `${g.title} ${g.day}` : g.title} {...target}>
            <h2 className="task-day">
              {g.day ? (
                <>
                  <span className="task-day-num tnum">{g.day}</span>
                  <span className="task-day-name">{g.title}</span>
                </>
              ) : (
                <span className="task-day-month">{g.title}</span>
              )}
            </h2>
            {g.day && <AgendaList events={eventsByDay.get(g.key) ?? []} now={now} colorOf={colorOf} />}
            {g.tasks.length > 0 && (
              <div className="task-list">
                {g.tasks.map((e) => (e.kind === 'entrega' ? <Inert key={e.delivery.task.id} on={selecting}>{deliveries.row(e.delivery)}</Inert> : row(e.note)))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
