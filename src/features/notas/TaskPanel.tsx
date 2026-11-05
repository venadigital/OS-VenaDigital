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
import { NotasBack } from './NotasBack';
import { dateOf, groupUpcoming, isTask, sortTasks, TASK_VIEWS, taskView, type TaskView, withDays } from './tasks';
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

  const row = (n: Note) => (
    <TaskRow key={n.id} note={n} {...rowState(n)} place={view} now={now} listName={n.list_id ? listNames.get(n.list_id) : undefined} actions={actions} />
  );

  const label = TASK_VIEWS.find((v) => v.id === view)?.label ?? '';
  const dateLine = format(now, "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="notas-tasks">
      <NotasBack />
      <PageHeader eyebrow={view === 'hoy' ? dateLine.charAt(0).toUpperCase() + dateLine.slice(1) : undefined} title={label} />
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
        <div className="task-list">{tasks.map(row)}</div>
      )}
    </div>
  );
}

type RowOf = (n: Note) => ReactNode;

/** Today's events, then deliveries due today or late, then the to-dos. */
function TodayList({ tasks, row, now }: { tasks: Note[]; row: RowOf; now: Date }) {
  const dayStart = startOfDay(now).getTime();
  const range = useMemo(() => ({ from: new Date(dayStart), to: addDays(new Date(dayStart), 1) }), [dayStart]);
  const { eventsQ, colorOf } = useAgendaEvents(range.from, range.to);
  const events = eventsOfDay(eventsQ.data ?? [], range.from);
  const time = useTimeData();
  const deliveries = useDeliveryRows('hoy', now, true);
  const due = deliveriesFor(time.tasks, time.projectById, dayKey(now), deliveries.kept).today;

  if (!events.length && !due.length && !tasks.length) return <Empty title={EMPTY.hoy} />;
  return (
    <>
      <AgendaList events={events} now={now} colorOf={colorOf} boxed />
      {(due.length > 0 || tasks.length > 0) && (
        <div className="task-list">
          {due.map(deliveries.row)}
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

  const entries: Entry[] = [...due.map((delivery) => ({ kind: 'entrega' as const, delivery })), ...tasks.map((note) => ({ kind: 'nota' as const, note }))];
  const groups = withDays(
    groupUpcoming(entries, (e) => (e.kind === 'entrega' ? e.delivery.due : dateOf(e.note)), now),
    [...eventsByDay.keys()],
    now,
  );

  if (groups.length === 0) return <Empty title={EMPTY.proximo} />;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="task-group" aria-label={g.day ? `${g.title} ${g.day}` : g.title}>
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
          {g.tasks.length > 0 && <div className="task-list">{g.tasks.map((e) => (e.kind === 'entrega' ? deliveries.row(e.delivery) : row(e.note)))}</div>}
        </section>
      ))}
    </>
  );
}
