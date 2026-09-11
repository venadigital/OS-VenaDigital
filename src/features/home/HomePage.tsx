import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Play, Plus, Settings2, Shapes, Square } from 'lucide-react';
import { Page, PageHeader, ThemeButton } from '@/components/Shell';
import { Button, Card, cx, Dot, IconButton, Label, LiveDot, Menu, Pill, Skeleton } from '@/components/ui';
import { useAccount } from '@/data/ApiContext';
import { qk, useApiMutation, useBoards, useEntries, useNoteImages, useNotes, useNow, useStartTimer, useStopTimer } from '@/data/hooks';
import { clock, dur, greeting, hhmm, longDate, monthName, ratio, relativeDay, usd } from '@/lib/format';
import { rangeFor } from '@/lib/time';
import { CaptureBar } from '@/features/notas/NotasPage';
import { NoteCard } from '@/features/notas/NoteCard';
import { totalsByProject, useRunningTimer, useTimeData } from '@/features/tiempo/model';
import { useConsumo } from '@/features/consumo/model';
import type { NoteInput } from '@/data/types';

export function HomePage() {
  const { user } = useAccount();
  const navigate = useNavigate();
  const now = useNow(60_000);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <span className="flex-1">{longDate(now)}</span>
            {/* On the phone there is no sidebar: theme and settings live here. */}
            <span className="-my-2 -mr-2 flex md:hidden">
              <ThemeButton size={34} />
              <IconButton label="Ajustes" onClick={() => navigate('/ajustes')}>
                <Settings2 size={17} />
              </IconButton>
            </span>
          </>
        }
        title={`${greeting(now)}, ${user.name}`}
        right={
          <Menu
            align="right"
            trigger={
              <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />}>
                Nuevo
              </Button>
            }
            items={[
              { label: 'Nota', onSelect: () => navigate('/notas?nueva=1') },
              { label: 'Tarea', onSelect: () => navigate('/tiempo') },
              { label: 'Tablero', onSelect: () => navigate('/tableros?nuevo=1') },
            ]}
          />
        }
      />
      <CaptureBar placeholder="Anota una idea, un pendiente o pega un link…" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TimerCard />
        <TodayCard now={now} />
        <AiCard now={now} />
      </div>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PinnedNotes />
        <RecentBoards />
      </div>
    </Page>
  );
}

function CardTop({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[13px] font-medium text-ink-2">{title}</span>
      {to && (
        <Link to={to} className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium whitespace-nowrap text-ink-2 hover:text-ink">
          {link}
          <ChevronRight size={14} className="text-ink-3" />
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

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label>Tiempo</Label>
        {timer && <LiveDot />}
      </div>
      {loading ? (
        <Skeleton className="h-28" />
      ) : timer ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold text-ink">{timer.task?.name}</span>
            <span className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
              {timer.project && <Dot color={timer.project.color} size={7} />}
              {timer.project?.name} · desde las {hhmm(new Date(timer.entry.started_at))}
            </span>
          </div>
          <div className="tnum text-[44px] leading-[48px] font-semibold tracking-[-0.025em] text-ink">{clock(timer.seconds)}</div>
          <div className="mt-auto flex gap-2">
            <Button variant="danger" className="flex-1" pill icon={<Square size={12} fill="currentColor" />} onClick={() => stop.mutate(undefined)}>
              Detener
            </Button>
            <Link to="/tiempo">
              <Button>Cambiar tarea</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-3">Nada en curso. Retoma una tarea reciente:</p>
          <div className="flex flex-col gap-1.5">
            {recent.slice(0, 3).map((t) => (
              <button
                key={t.id}
                type="button"
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
    <Card>
      <CardTop title="Hoy" to="/tiempo" link="Ver tiempo" />
      <div className="flex flex-col gap-0.5">
        <div className="text-[30px] leading-9 font-semibold tracking-[-0.02em] text-ink">{dur(totals.total)}</div>
        <div className="text-[12.5px] text-ink-3">
          {totals.byProject.length} {totals.byProject.length === 1 ? 'proyecto' : 'proyectos'} · {(entries.data ?? []).length}{' '}
          {(entries.data ?? []).length === 1 ? 'sesión' : 'sesiones'}
        </div>
      </div>
      {totals.total > 0 ? (
        <>
          <div className="flex h-2.5 w-full gap-0.5">
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
    <Card>
      <CardTop title="Consumo IA" to="/consumo" link="Ver consumo" />
      {loading ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <div className="text-[30px] leading-9 font-semibold tracking-[-0.02em] text-ink">{usd(summary.cost)}</div>
            <div className="text-[12.5px] text-ink-3">
              Valor a precio API · {monthName(now)}
              {summary.unpriced.length > 0 && ` · ${summary.unpriced.length} ${summary.unpriced.length === 1 ? 'modelo' : 'modelos'} sin precio`}
            </div>
          </div>
          {values.length > 0 ? (
            <div className="flex h-11 items-end gap-1.5" aria-hidden>
              {values.map((v, i) => (
                <div
                  key={i}
                  className="w-3.5 rounded-t-[2px]"
                  style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: i === values.length - 1 ? 'var(--accent)' : 'var(--color-bar)' }}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Sin datos todavía: instala el colector desde Consumo IA.</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 text-[13px] text-ink-2">
            <span>{monthly > 0 ? `Pagas ${usd(monthly).replace(',00', '')}/mes en suscripciones` : 'Agrega tus suscripciones'}</span>
            {r !== null && <Pill>Rinde {ratio(r)}</Pill>}
          </div>
        </>
      )}
    </Card>
  );
}

function PinnedNotes() {
  const notesQ = useNotes();
  const notes = notesQ.data ?? [];
  const pinned = notes.filter((n) => n.pinned);
  const shown = (pinned.length ? pinned : notes).slice(0, 3);
  const paths = shown.map((n) => n.image_path).filter((p): p is string => Boolean(p));
  const images = useNoteImages(paths).data ?? {};
  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-[22px] items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{pinned.length ? 'Notas fijadas' : 'Notas recientes'}</h2>
        <Link to="/notas" className="flex items-center gap-0.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          Todas las notas <ChevronRight size={14} className="text-ink-3" />
        </Link>
      </div>
      {notesQ.isLoading ? (
        <Skeleton className="h-36" />
      ) : shown.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-ink-3">Tus notas fijadas aparecen aquí.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
          {shown.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              compact
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
  const boards = (boardsQ.data ?? []).slice(0, 3);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-[22px] items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Tableros recientes</h2>
        <Link to="/tableros" className="flex items-center gap-0.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          Todos <ChevronRight size={14} className="text-ink-3" />
        </Link>
      </div>
      {boardsQ.isLoading ? (
        <Skeleton className="h-36" />
      ) : boards.length === 0 ? (
        <Link to="/tableros?nuevo=1" className="rounded-[14px] border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-ink-3 hover:bg-plane">
          Crea tu primer tablero →
        </Link>
      ) : (
        <div className="flex flex-col rounded-[14px] border border-line bg-surface py-1">
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
