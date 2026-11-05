import { useNavigate } from 'react-router-dom';
import { Check, Flag, Play } from 'lucide-react';
import { cx } from '@/components/ui';
import { qk, useApiMutation, useClients, useRunning, useStartTimer } from '@/data/hooks';
import type { Delivery } from './deliveries';
import { deadlineLabel } from './tasks';
import { useSettling } from './useTaskRows';

/** Rows of Tiempo deliveries in a list of Notas: check them off, start the timer or go to them. */
export function useDeliveryRows(listKey: string, now: Date, withDeadline: boolean) {
  const navigate = useNavigate();
  const clients = useClients().data ?? [];
  const runningTask = useRunning().data?.task_id ?? null;
  const start = useStartTimer();
  const { settle, stateOf, kept } = useSettling(listKey);
  const update = useApiMutation((api, v: { id: string; archived: boolean }) => api.updateTask(v.id, { archived: v.archived }), [qk.tasks]);

  const open = (d: Delivery) => {
    const client = clients.find((c) => c.project_id === d.task.project_id);
    navigate(client ? `/clientes/${client.id}?tab=tareas` : '/tiempo');
  };

  return {
    /** Deliveries just checked stay on screen a moment, even after Tiempo drops them. */
    kept,
    row: (d: Delivery) => {
      const state = stateOf(d.task.id);
      const done = state?.done ?? d.task.archived;
      return (
        <DeliveryRow
          key={`entrega:${d.task.id}`}
          delivery={d}
          done={done}
          leaving={Boolean(state) && done}
          running={runningTask === d.task.id}
          flag={withDeadline && !done ? deadlineLabel(d.due, now) : null}
          onToggle={() => settle(d.task.id, !done, () => update.mutateAsync({ id: d.task.id, archived: !done }))}
          onOpen={() => open(d)}
          onStart={() => start.mutate(d.task.id)}
        />
      );
    },
  };
}

function DeliveryRow({
  delivery,
  done,
  leaving,
  running,
  flag,
  onToggle,
  onOpen,
  onStart,
}: {
  delivery: Delivery;
  done: boolean;
  leaving: boolean;
  running: boolean;
  flag: { text: string; late: boolean } | null;
  onToggle: () => void;
  onOpen: () => void;
  onStart: () => void;
}) {
  const { task, project } = delivery;
  const flagNode = (inline: boolean) =>
    flag && (
      <span className={cx('task-flag', inline ? 'task-flag-inline' : 'task-flag-side', flag.late && 'is-late')}>
        <Flag size={13} aria-hidden />
        {flag.text}
      </span>
    );
  return (
    <div className={cx('task-row', done && 'is-done', leaving && 'is-leaving')}>
      <button type="button" className="task-check" aria-pressed={done} aria-label={`${done ? 'Marcar pendiente' : 'Marcar hecha'}: ${task.name}`} onClick={onToggle}>
        <span className="task-box">{done && <Check size={14} strokeWidth={3} aria-hidden />}</span>
      </button>
      <button type="button" className="task-main" onClick={onOpen}>
        <span className="task-line">
          <span className="task-title">{task.name}</span>
          <span className="task-chip is-delivery">Entrega</span>
        </span>
        {(project || flag) && (
          <span className="task-sub">
            {project && <span>{project.name}</span>}
            {flagNode(true)}
          </span>
        )}
      </button>
      {flagNode(false)}
      {running ? (
        <span className="task-live">En curso</span>
      ) : (
        !done && (
          <button type="button" className="task-timer" aria-label={`Iniciar cronómetro: ${task.name}`} title="Iniciar cronómetro" onClick={onStart}>
            <Play size={13} fill="currentColor" aria-hidden />
          </button>
        )
      )}
    </div>
  );
}
