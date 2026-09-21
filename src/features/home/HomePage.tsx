import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChartNoAxesColumnIncreasing, ChevronRight, Circle, CircleCheck, Play, Plus, Shapes, Sparkles, Square, Timer } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, cx, Dot, Label, LiveDot, Pill, Skeleton } from '@/components/ui';
import { useAccount } from '@/data/ApiContext';
import { qk, useApiMutation, useBoards, useEntries, useNoteImages, useNotes, useNow, useStartTimer, useStopTimer } from '@/data/hooks';
import { clock, dur, greeting, hhmm, longDate, monthName, ratio, relativeDay, usd } from '@/lib/format';
import { dayKey, rangeFor } from '@/lib/time';
import { useWorkspaceView } from '@/lib/workspaceView';
import { CaptureBar } from '@/features/notas/NotasPage';
import { NoteCard } from '@/features/notas/NoteCard';
import { totalsByProject, useRunningTimer, useTimeData } from '@/features/tiempo/model';
import { useConsumo } from '@/features/consumo/model';
import type { Note, NoteInput } from '@/data/types';

export function HomePage() {
  const { user } = useAccount();
  const now = useNow(60_000);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <span className="flex-1">{longDate(now)}</span>
          </>
        }
        title={`${greeting(now)}, ${user.name}`}
      />
      <CaptureBar placeholder="Anota una idea, un pendiente o pega un link…" />
      <div className="home-workspace">
        <TimerCard />
        <PendingCard now={now} />
      </div>
      <div className="home-lower">
        <PinnedNotes />
        <RecentBoards />
      </div>
      <section className="home-summary" aria-label="Resumen de actividad">
        <h2 className="section-title">Tu actividad, de un vistazo</h2>
        <div className="home-summary-grid"><TodayCard now={now} /><AiCard now={now} /></div>
      </section>
    </Page>
  );
}

function CardTop({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="metric-label"><span className="icon-tile">{title === 'Hoy' ? <ChartNoAxesColumnIncreasing size={18} /> : <Sparkles size={18} />}</span>{title}</span>
      {to && (
        <Link to={to} className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:text-ink">
          {link}
          <ArrowUpRight size={15} className="text-ink-3" />
        </Link>
      )}
    </div>
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
    <Card className="timer-card">
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
  const today = dayKey(now);
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<Note | null>(null);
  const update = useApiMutation((api, v: {id: string; done: boolean}) => api.updateNote(v.id, { done: v.done }), [qk.notes]);
  const pending = (notes.data ?? []).filter(n => n.type === 'hacer' && !n.done)
    .sort((a,b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || Number(b.pinned) - Number(a.pinned));
  return <Card className="pending-card">
    <div className="section-heading"><h2 className="metric-label"><span className="icon-tile"><CircleCheck size={18}/></span>Pendientes a mano <span className="count-badge">{pending.length}</span></h2><Link to="/notas?pendientes=1" className="text-link">Ver todos <ArrowUpRight size={15}/></Link></div>
    {notes.isLoading ? <Skeleton className="h-28"/> : pending.length ? <div className="pending-list">{pending.slice(0,3).map(n => <div key={n.id} className="pending-row">
      <button type="button" className="pending-check" aria-label={`Completar: ${n.body}`} disabled={update.isPending} onClick={() => update.mutate({id:n.id, done:true}, {onSuccess: () => setCompleted(n)})}><Circle size={21}/></button>
      <button type="button" className="pending-content" onClick={() => navigate(`/notas?nota=${n.id}`)}><span>{n.body}</span><small className={n.due_date && n.due_date < today ? 'text-crit' : ''}>{n.due_date ? n.due_date < today ? `Vencido · ${n.due_date}` : n.due_date === today ? 'Para hoy' : `Para el ${n.due_date}` : 'Sin fecha'}{n.pinned ? ' · Fijada' : ''}</small></button>
    </div>)}</div> : <p className="text-ink-3">No tienes pendientes. Puedes capturar uno arriba.</p>}
    {completed && <div className="completion-feedback" role="status"><span>Completado: {completed.body.slice(0,50)}{completed.body.length > 50 ? '…' : ''}</span><button type="button" disabled={update.isPending} onClick={() => update.mutate({id:completed.id,done:false},{onSuccess:()=>setCompleted(null)})}>Deshacer</button></div>}
    <Link to="/notas?nueva=1&pendientes=1" className="text-link mt-auto"><Plus size={15}/> Añadir pendiente</Link>
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

function TodayCard({ now }: { now: Date }) {
  const { from, to } = rangeFor('day', now);
  const entries = useEntries(from, to);
  const { taskById, projectById } = useTimeData();
  const { timer } = useRunningTimer();
  const live = useNow(30_000, Boolean(timer));
  const totals = totalsByProject(entries.data ?? [], from, to, live, taskById, projectById);
  const top = totals.byProject.slice(0, 3);
  const rest = totals.byProject.slice(3);
  const restMin = rest.reduce((s, x) => s + x.minutes, 0);

  return (
    <Card className="today-card">
      <CardTop title="Hoy" to="/tiempo" link="Ver tiempo" />
      <div className="flex flex-col gap-0.5">
        <div className="metric-value text-ink">{dur(totals.total)}</div>
        <div className="text-[12.5px] text-ink-3">
          {totals.byProject.length} {totals.byProject.length === 1 ? 'proyecto' : 'proyectos'} · {(entries.data ?? []).length}{' '}
          {(entries.data ?? []).length === 1 ? 'sesión' : 'sesiones'}
        </div>
      </div>
      {totals.total > 0 ? (
        <>
          <div className="today-track flex h-2.5 w-full gap-0.5">
            {totals.byProject.map((b, i) => (
              <div
                key={b.project.id}
                className={cx(i === 0 && 'rounded-l', i === totals.byProject.length - 1 && 'rounded-r')}
                style={{ flexGrow: b.minutes, flexBasis: 0, background: b.project.color }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-[7px]">
            {top.map((b) => (
              <div key={b.project.id} className="flex items-center gap-2 text-[13px]">
                <Dot color={b.project.color} />
                <span className="flex-1 truncate text-ink">{b.project.name}</span>
                <span className="tnum text-ink-2">{dur(b.minutes)}</span>
              </div>
            ))}
            {rest.length > 0 && (
              <div className="flex items-center gap-2 text-[13px] text-ink-3">
                <span className="w-2" />
                <span className="flex-1">{rest.length} más</span>
                <span className="tnum">{dur(restMin)}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-[13.5px] text-ink-3">Aún no registras tiempo hoy.</p>
      )}
    </Card>
  );
}

function AiCard({ now }: { now: Date }) {
  const { from, to } = rangeFor('month', now);
  const { summary, monthly, ratio: r, loading } = useConsumo(from, to, 'month');
  const days = [...summary.byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const values = days.map(([, m]) => [...m.values()].reduce((s, v) => s + v, 0)).slice(-14);
  const max = Math.max(...values, 0.01);

  return (
    <Card className="ai-card">
      <CardTop title="Consumo IA" to="/consumo" link="Ver consumo" />
      {loading ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <div className="metric-value text-ink">{usd(summary.cost)}</div>
            <div className="text-[12.5px] text-ink-3">
              Valor a precio API · {monthName(now)}
              {summary.unpriced.length > 0 && ` · ${summary.unpriced.length} ${summary.unpriced.length === 1 ? 'modelo' : 'modelos'} sin precio`}
            </div>
          </div>
          {values.length > 0 ? (
            <div className="ai-sparkline flex h-14 items-end gap-1.5" aria-hidden>
              {values.map((v, i) => (
                <div
                  key={i}
                  className="w-3.5 rounded-t-[2px]"
                  style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: i === values.length - 1 ? 'var(--stay-lime)' : i % 3 === 0 ? 'var(--stay-lilac)' : 'var(--color-bar)' }}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Sin datos todavía: instala el colector desde Consumo IA.</p>
          )}
          <div className="metric-footer mt-auto flex items-center justify-between gap-2 text-[13px] text-ink-2">
            <span>{monthly > 0 ? `Pagas ${usd(monthly).replace(',00', '')}/mes en suscripciones` : 'Agrega tus suscripciones'}</span>
            {r !== null && <Pill>Rinde {ratio(r)}</Pill>}
          </div>
        </>
      )}
    </Card>
  );
}

function PinnedNotes() {
  const navigate = useNavigate();
  const notesQ = useNotes();
  const notes = (notesQ.data ?? []).filter(n => n.type !== 'hacer');
  const pinned = notes.filter((n) => n.pinned);
  const shown = (pinned.length ? pinned : notes).slice(0, 2);
  const paths = shown.map((n) => n.image_path).filter((p): p is string => Boolean(p));
  const images = useNoteImages(paths).data ?? {};
  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-[22px] items-center justify-between">
        <h2 className="text-[17px] font-medium text-ink">{pinned.length ? 'Notas fijadas' : 'Notas recientes'}</h2>
        <Link to="/notas" className="flex items-center gap-0.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          Todas las notas <ArrowUpRight size={15} className="text-ink-3" />
        </Link>
      </div>
      {notesQ.isLoading ? (
        <Skeleton className="h-36" />
      ) : shown.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-ink-3">Tus notas fijadas aparecen aquí.</p>
      ) : (
        <div className="home-notes-grid">
          {shown.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              compact
              onEdit={(x) => navigate(`/notas?nota=${x.id}`)}
              imageUrl={n.image_path ? images[n.image_path] : undefined}
              onToggleDone={(x) => update.mutate({ id: x.id, patch: { done: !x.done } })}
              onTogglePin={(x) => update.mutate({ id: x.id, patch: { pinned: !x.pinned } })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentBoards() {
  const boardsQ = useBoards();
  const { favorites } = useWorkspaceView();
  const saved = (boardsQ.data ?? []).filter(b => favorites.includes(b.id));
  const boards = (saved.length ? saved : boardsQ.data ?? []).slice(0, 3);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-[22px] items-center justify-between">
        <h2 className="text-[17px] font-medium text-ink">{saved.length ? 'Tableros favoritos' : 'Tableros recientes'}</h2>
        <Link to="/tableros" className="flex items-center gap-0.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          Todos <ArrowUpRight size={15} className="text-ink-3" />
        </Link>
      </div>
      {boardsQ.isLoading ? (
        <Skeleton className="h-36" />
      ) : boards.length === 0 ? (
        <Link to="/tableros?nuevo=1" className="rounded-[14px] border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-ink-3 hover:bg-plane">
          Crea tu primer tablero →
        </Link>
      ) : (
        <div className="recent-boards flex flex-col rounded-[18px] border border-line bg-surface py-1">
          {boards.map((b, i) => (
            <Link key={b.id} to={`/tableros/${b.id}`} className={cx('flex items-center gap-3.5 px-3 py-2.5 hover:bg-plane', i > 0 && 'border-t border-rule')}>
              <div className="dots-bg flex h-[50px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line">
                {b.thumbnail ? <img src={b.thumbnail} alt="" className="board-thumb h-full w-full object-contain" /> : <Shapes size={18} className="text-ink-4" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium text-ink">{b.name}</span>
                <span className="text-[12.5px] text-ink-3">Editado {relativeDay(new Date(b.updated_at)).toLowerCase()}</span>
              </div>
              <ChevronRight size={16} className="text-ink-4" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
