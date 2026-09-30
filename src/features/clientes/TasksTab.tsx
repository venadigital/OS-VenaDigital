// Ficha · Proyecto y tareas: the client's Tiempo project, its tasks, deliveries and hours.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, differenceInCalendarDays, startOfMonth } from 'date-fns';
import { Play, Plus, Square, Timer } from 'lucide-react';
import { Button, Card, Dot, Empty, IconButton, LiveDot, Menu, Segmented } from '@/components/ui';
import { qk, useApiMutation, useStartTimer, useStopTimer, useTaskEntries } from '@/data/hooks';
import type { Client, Task } from '@/data/types';
import { clock } from '@/lib/format';
import { nextColor } from '@/lib/palette';
import { fromDayKey } from '@/lib/time';
import { useRunningTimer, useTimeData } from '@/features/tiempo/model';
import { ClientTaskDialog } from './dialogs';
import { dayLabel, hm, minutesByTask, relDays, type ClientSummary } from './model';

/** Minutes per task this month and all time, plus each task's last session. */
export function useTaskTotals(s: ClientSummary, now: Date) {
  const ids = useMemo(() => s.tasks.map((t) => t.id).sort(), [s.tasks]);
  const q = useTaskEntries(ids);
  return useMemo(() => {
    const entries = q.data ?? [];
    const from = startOfMonth(now);
    const month = minutesByTask(entries, from, addMonths(from, 1), now);
    const all = minutesByTask(entries, new Date(0), new Date(8.64e15), now);
    const last = new Map<string, string>();
    for (const e of entries) if ((last.get(e.task_id) ?? '') < e.started_at) last.set(e.task_id, e.started_at);
    let total = 0;
    for (const m of all.values()) total += m;
    return { month, all, last, total, loading: q.isLoading && ids.length > 0 };
  }, [q.data, q.isLoading, ids.length, now]);
}

type Filter = 'abiertas' | 'entrega' | 'hechas' | 'todas';

export function TasksTab({ s, now, clients }: { s: ClientSummary; now: Date; from: Date; to: Date; clients: Client[] }) {
  const [filter, setFilter] = useState<Filter>('abiertas');
  const [dialog, setDialog] = useState<{ open: boolean; task?: Task }>({ open: false });
  const totals = useTaskTotals(s, now);
  const { timer } = useRunningTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const { projects } = useTimeData();
  const setDone = useApiMutation((api, v: { id: string; archived: boolean }) => api.updateTask(v.id, { archived: v.archived }), [qk.tasks]);
  const remove = useApiMutation((api, id: string) => api.deleteTask(id), [qk.tasks, ['entries']], 'No se pudo borrar');
  const createProject = useApiMutation(
    async (api) => {
      const p = await api.createProject({ name: s.client.name.slice(0, 80), color: nextColor(projects.map((x) => x.color)) });
      await api.updateClient(s.client.id, { project_id: p.id });
    },
    [qk.projects, qk.clients],
  );

  if (!s.project) {
    const taken = new Set(clients.map((c) => c.project_id));
    const free = projects.filter((p) => !p.archived && !taken.has(p.id)).length;
    return (
      <Empty
        icon={<Timer size={28} />}
        title="Este cliente no tiene proyecto en Tiempo"
        action={
          <Button variant="primary" icon={<Plus size={16} />} disabled={createProject.isPending} onClick={() => createProject.mutate(undefined)}>
            Crear proyecto «{s.client.name}»
          </Button>
        }
      >
        Un cliente, un proyecto: sus tareas y sus horas viven allí.{free > 0 ? ' También puedes unir uno que ya exista desde Editar cliente.' : ''}
      </Empty>
    );
  }

  const open = s.tasks.filter((t) => !t.archived);
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.name.localeCompare(b.name, 'es');
  const rows = s.tasks
    .filter((t) => (filter === 'abiertas' ? !t.archived : filter === 'entrega' ? !t.archived && t.due_date : filter === 'hechas' ? t.archived : true))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || byDue(a, b));

  return (
    <>
      <Card as="section" className="cl-project cl-lilac">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <span className="icon-tile" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--stay-lilac)', borderColor: 'var(--stay-lilac-line)' }}>
            <Timer size={19} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <Dot color={s.project.color} />
              <span className="truncate text-[17px] font-medium">Proyecto en Tiempo: {s.project.name}</span>
            </span>
          </span>
        </div>
        <div className="cl-stat"><span className="cl-cap">Este mes</span><b>{hm(s.monthMinutes)}</b></div>
        <div className="cl-stat"><span className="cl-cap">Total</span><b>{totals.loading ? '…' : hm(totals.total)}</b></div>
        <div className="cl-stat">
          <span className="cl-cap">Tareas</span>
          <b>{s.tasks.length} <span className="text-[14px] font-normal tracking-normal text-ink-3">· {open.length} abiertas</span></b>
        </div>
        <Link to="/tiempo" className="os-button inline-flex h-10 items-center rounded-full border border-[var(--stay-lilac-line)] px-4 text-[14px] font-medium">
          Abrir en Tiempo
        </Link>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: 'abiertas', label: 'Abiertas' },
            { value: 'entrega', label: 'Con entrega' },
            { value: 'hechas', label: 'Hechas' },
            { value: 'todas', label: 'Todas' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
            Nueva tarea
          </Button>
        </div>
      </div>

      <Card as="section" className="!p-0">
        {rows.length === 0 ? (
          <div className="p-6">
            <Empty title={filter === 'hechas' ? 'Nada hecho todavía' : 'Sin tareas aquí'}>
              {filter === 'entrega' ? 'Ponle fecha de entrega a una tarea para verla aquí.' : 'Crea una tarea y cronometra su tiempo.'}
            </Empty>
          </div>
        ) : (
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Tarea</th>
                  <th>Estado</th>
                  <th>Entrega</th>
                  <th className="is-num">Este mes</th>
                  <th className="is-num">Total</th>
                  <th style={{ width: 84 }}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const running = timer?.entry.task_id === t.id;
                  const month = totals.month.get(t.id) ?? 0;
                  const all = totals.all.get(t.id) ?? 0;
                  const last = totals.last.get(t.id);
                  const lastDays = last ? differenceInCalendarDays(now, new Date(last)) : null;
                  const dueDays = t.due_date ? differenceInCalendarDays(fromDayKey(t.due_date), now) : null;
                  return (
                    <tr key={t.id}>
                      <td>
                        <button type="button" className={`cl-cell-link ${t.archived ? '!text-ink-2' : ''}`} onClick={() => setDialog({ open: true, task: t })}>
                          {t.name}
                        </button>
                        <span className="cl-cap block">{lastDays == null ? 'Sin tiempo registrado' : `Última sesión ${lastDays === 0 ? 'hoy' : lastDays === 1 ? 'ayer' : `hace ${lastDays} días`}`}</span>
                      </td>
                      <td>
                        {running && timer ? (
                          <LiveDot label={`En curso · ${clock(timer.seconds)}`} />
                        ) : t.archived ? (
                          <span className="cl-pill">Hecha</span>
                        ) : all > 0 ? (
                          <span className="cl-pill is-lilac">En curso</span>
                        ) : (
                          <span className="cl-pill is-gray">Pendiente</span>
                        )}
                      </td>
                      <td>
                        {t.due_date && dueDays != null ? (
                          t.archived ? (
                            <span className="cl-cap">{dayLabel(t.due_date)}</span>
                          ) : (
                            <span className={dueDays < 0 ? 'cl-pill is-crit' : dueDays <= 3 ? 'cl-pill is-amber' : 'cl-pill is-gray'} title={relDays(dueDays)}>
                              {dayLabel(t.due_date)}
                            </span>
                          )
                        ) : (
                          <span className="cl-cap">Sin fecha</span>
                        )}
                      </td>
                      <td className="is-num">{month ? hm(month) : <span className="text-ink-3">—</span>}</td>
                      <td className="is-num">{all ? hm(all) : <span className="text-ink-3">—</span>}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {!t.archived &&
                            (running ? (
                              <IconButton label={`Detener ${t.name}`} variant="danger" size={32} onClick={() => stop.mutate(undefined)}>
                                <Square size={11} fill="currentColor" />
                              </IconButton>
                            ) : (
                              <IconButton label={`Iniciar ${t.name}`} variant="round" size={32} disabled={start.isPending} onClick={() => start.mutate(t.id)}>
                                <Play size={12} fill="currentColor" />
                              </IconButton>
                            ))}
                          <Menu
                            items={[
                              { label: 'Editar', onSelect: () => setDialog({ open: true, task: t }) },
                              t.archived
                                ? { label: 'Reabrir', onSelect: () => setDone.mutate({ id: t.id, archived: false }) }
                                : { label: 'Marcar como hecha', onSelect: () => setDone.mutate({ id: t.id, archived: true }) },
                              { label: 'Borrar', danger: true, onSelect: () => confirm(`¿Borrar "${t.name}" y sus registros de tiempo?`) && remove.mutate(t.id) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClientTaskDialog open={dialog.open} onClose={() => setDialog({ open: false })} projectId={s.project.id} task={dialog.task} />
    </>
  );
}
