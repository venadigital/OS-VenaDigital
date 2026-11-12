import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Circle, CircleCheck, Play, Plus, Square, Timer } from 'lucide-react';
import { Page } from '@/components/Shell';
import { Button, Card, cx, Dot, Label, LiveDot, Skeleton } from '@/components/ui';
import { useAccount } from '@/data/ApiContext';
import { qk, useApiMutation, useClients, useEntries, useNotes, useNow, useStartTimer, useStopTimer } from '@/data/hooks';
import { clock, greeting, hhmm } from '@/lib/format';
import { dayKey, rangeFor } from '@/lib/time';
import { CaptureBar } from '@/features/notas/CaptureBar';
import { useRunningTimer, useTimeData } from '@/features/tiempo/model';
import { TodayAgendaCard } from '@/features/calendario/TodayAgendaCard';
import { dueLabel, pendingItems, type PendingItem } from './pending';
import { ClockWidget, PhotoWidget, WeatherWidget } from './widgets';

export function HomePage() {
  const { user } = useAccount();
  const now = useNow(60_000);

  return (
    <Page>
      <header className="home-head">
        <h1 className="page-title">{`${greeting(now)}, ${user.name}`}</h1>
        <CaptureBar placeholder="Anota una idea, un pendiente o pega un link…" />
      </header>
      <div className="home-widgets">
        <div className="home-row home-row--calm">
          <PhotoWidget now={now} />
          <ClockWidget />
          <WeatherWidget />
        </div>
        <div className="home-row home-row--work">
          <TimerCard />
          <TodayAgendaCard now={now} />
          <PendingCard now={now} />
        </div>
      </div>
    </Page>
  );
}

function TimerCard() {
  const { timer, loading } = useRunningTimer();
  const { tasks, projectById } = useTimeData();
  const start = useStartTimer();
  const stop = useStopTimer();
  const recent = useRecentTasks();
  const [switching, setSwitching] = useState(false);

  return (
    <Card className={cx('timer-card', timer && 'is-running')}>
      <div className="flex items-center justify-between">
        <span className="metric-label"><span className="icon-tile"><Timer size={18} /></span><Label>Tu foco ahora</Label></span>
        {timer && <LiveDot />}
      </div>
      {loading ? (
        <Skeleton className="h-28" />
      ) : timer ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-[17px] font-medium text-ink">{timer.task?.name}</span>
            <span className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
              {timer.project && <Dot color={timer.project.color} size={7} />}
              {timer.project?.name} · desde las {hhmm(new Date(timer.entry.started_at))}
            </span>
          </div>
          <div className="tnum timer-value font-medium text-ink">{clock(timer.seconds)}</div>
          <div className="mt-auto flex gap-2">
            <Button variant="primary" className="flex-1" pill icon={<Square size={12} fill="currentColor" />} disabled={stop.isPending} onClick={() => stop.mutate(undefined)}>
              Detener
            </Button>
            <Button aria-expanded={switching} onClick={() => setSwitching(x => !x)}>Cambiar tarea</Button>
          </div>
          {switching && <label className="flex flex-col gap-2 text-sm">Cambiar a otra tarea
            <select className="ux-select" aria-label="Cambiar tarea activa" value="" disabled={start.isPending} onChange={e => { if(e.target.value) start.mutate(e.target.value, {onSuccess: () => setSwitching(false)}); }}>
              <option value="">Selecciona una tarea…</option>
              {tasks.filter(t => !t.archived && !projectById.get(t.project_id)?.archived && t.id !== timer.task?.id).map(t => <option key={t.id} value={t.id}>{projectById.get(t.project_id)?.name} · {t.name}</option>)}
            </select><span className="text-xs text-ink-3">El tiempo actual se guarda al iniciar la siguiente.</span>
          </label>}
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-3">Nada en curso. Retoma una tarea reciente:</p>
          <div className="flex flex-col gap-1.5">
            {recent.slice(0, 3).map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={start.isPending}
                onClick={() => start.mutate(t.id)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-plane"
              >
                <Dot color={projectById.get(t.project_id)?.color ?? 'var(--color-mute)'} />
                <span className="flex-1 truncate text-[13.5px] text-ink">{t.name}</span>
                <Play size={12} className="text-ink-3" fill="currentColor" />
              </button>
            ))}
            {tasks.length === 0 && (
              <Link to="/tiempo" className="text-[13.5px] font-medium text-accent">
                Crear un proyecto y una tarea →
              </Link>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function PendingCard({ now }: { now: Date }) {
  const notes = useNotes();
  const { tasks, projectById, loading } = useTimeData();
  const clients = useClients().data ?? [];
  const today = dayKey(now);
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<PendingItem | null>(null);
  const update = useApiMutation((api, v: {item: PendingItem; done: boolean}) => v.item.kind === 'nota' ? api.updateNote(v.item.id, { done: v.done }) : api.updateTask(v.item.id, { archived: v.done }), [qk.notes, qk.tasks]);
  const pending = pendingItems(notes.data ?? [], tasks, projectById, now);
  const open = (item: PendingItem) => {
    if (item.kind === 'nota') return navigate(`/notas?nota=${item.id}`);
    const client = clients.find(c => c.project_id === item.project?.id);
    navigate(client ? `/clientes/${client.id}?tab=tareas` : '/tiempo');
  };
  return <Card className="pending-card">
    <div className="section-heading"><h2 className="metric-label"><span className="icon-tile"><CircleCheck size={18}/></span>Pendientes a mano <span className="count-badge">{pending.length}</span></h2><Link to="/notas?vista=hoy" className="text-link">Ver todos <ArrowUpRight size={15}/></Link></div>
    {notes.isLoading || loading ? <Skeleton className="h-28"/> : pending.length ? <div className="pending-list">{pending.slice(0,3).map(item => <div key={item.key} className="pending-row">
      <button type="button" className="pending-check" aria-label={`Completar: ${item.title}`} disabled={update.isPending} onClick={() => update.mutate({item, done:true}, {onSuccess: () => setCompleted(item)})}><Circle size={21}/></button>
      <button type="button" className="pending-content" onClick={() => open(item)}><span>{item.title}</span><small className={item.due && item.due < today ? 'text-crit' : ''}>{dueLabel(item.due, now)}{item.project ? ` · ${item.project.name}` : ''}{item.pinned ? ' · Fijada' : ''}</small></button>
    </div>)}</div> : <p className="text-ink-3">No tienes pendientes. Puedes capturar uno arriba.</p>}
    {completed && <div className="completion-feedback" role="status"><span>Completado: {completed.title.slice(0,50)}{completed.title.length > 50 ? '…' : ''}</span><button type="button" disabled={update.isPending} onClick={() => update.mutate({item:completed,done:false},{onSuccess:()=>setCompleted(null)})}>Deshacer</button></div>}
    <Link to="/notas?vista=hoy&nueva=tarea" className="text-link mt-auto"><Plus size={15}/> Añadir pendiente</Link>
  </Card>;
}

/** Tasks ordered by most recent activity today/this week. */
function useRecentTasks() {
  const { tasks } = useTimeData();
  const { from, to } = useMemo(() => rangeFor('week', new Date()), []);
  const entries = useEntries(from, to).data ?? [];
  const lastUsed = new Map<string, string>();
  for (const e of entries) if (!lastUsed.has(e.task_id) || lastUsed.get(e.task_id)! < e.started_at) lastUsed.set(e.task_id, e.started_at);
  return tasks.filter((t) => !t.archived).sort((a, b) => (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? ''));
}
