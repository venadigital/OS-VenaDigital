import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageHeader } from '@/components/Shell';
import { Empty, Skeleton } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { Note, NoteInput } from '@/data/types';
import { dayKey } from '@/lib/time';
import { NotasBack } from './NotasBack';
import { isTask, sortTasks, TASK_VIEWS, taskTitle, taskView, type TaskView, upcomingGroups } from './tasks';
import { TaskRow, type TaskActions } from './TaskRow';

/** How long a checked to-do stays in place before moving to Registro (or back). */
const LINGER_MS = 1400;

const EMPTY: Record<TaskView, string> = {
  entrada: 'Entrada vacía',
  hoy: 'Nada para hoy',
  proximo: 'Nada programado',
  cuando: 'Nada por aquí',
  algun: 'Nada por aquí',
  registro: 'Aún no hay tareas hechas',
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function TaskPanel({ view, notes, now, loading, onOpen }: { view: TaskView; notes: Note[]; now: Date; loading: boolean; onOpen: (n: Note) => void }) {
  const today = dayKey(now);
  // A to-do being checked keeps its row, in the view it was checked from, until it has had time to read as done.
  const [settling, setSettling] = useState<Record<string, { done: boolean; view: TaskView }>>({});
  const lastToggle = useRef<Record<string, number>>({});
  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');

  const tasks = useMemo(
    () => sortTasks(notes.filter((n) => isTask(n) && (taskView(n, today) === view || settling[n.id]?.view === view)), view, today),
    [notes, view, today, settling],
  );

  const toggle = (n: Note) => {
    const next = !(settling[n.id]?.done ?? n.done);
    const turn = (lastToggle.current[n.id] ?? 0) + 1;
    lastToggle.current[n.id] = turn;
    setSettling((s) => ({ ...s, [n.id]: { done: next, view } }));
    const saved = update.mutateAsync({ id: n.id, patch: { done: next } }).catch(() => undefined);
    void Promise.all([saved, wait(LINGER_MS)]).then(() => {
      if (lastToggle.current[n.id] !== turn) return;
      setSettling((s) => {
        const rest = { ...s };
        delete rest[n.id];
        return rest;
      });
    });
  };

  const actions: TaskActions = {
    onToggle: toggle,
    onOpen,
    onPatch: (n, patch) => update.mutate({ id: n.id, patch }),
    onDelete: (n) => {
      if (confirm(`¿Borrar "${taskTitle(n.body) || 'esta tarea'}"?`)) remove.mutate(n.id);
    },
  };

  const row = (n: Note) => {
    const state = settling[n.id];
    const done = state?.done ?? n.done;
    return <TaskRow key={n.id} note={n} done={done} leaving={Boolean(state) && taskView({ ...n, done }, today) !== view} view={view} now={now} actions={actions} />;
  };

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
