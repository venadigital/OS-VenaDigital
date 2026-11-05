import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageHeader } from '@/components/Shell';
import { Empty, Skeleton } from '@/components/ui';
import type { Note } from '@/data/types';
import { dayKey } from '@/lib/time';
import { NotasBack } from './NotasBack';
import { isTask, sortTasks, TASK_VIEWS, taskView, type TaskView, upcomingGroups } from './tasks';
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
      ) : tasks.length === 0 ? (
        <Empty title={EMPTY[view]} />
      ) : view === 'proximo' ? (
        upcomingGroups(tasks, now).map((g) => (
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
            <div className="task-list">{g.tasks.map(row)}</div>
          </section>
        ))
      ) : (
        <div className="task-list">{tasks.map(row)}</div>
      )}
    </div>
  );
}
