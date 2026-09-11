import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Play, Plus, Square, Timer, Trash2 } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, CardHead, cx, Dot, Empty, IconButton, Label, LiveDot, Menu, Segmented, Select, Skeleton } from '@/components/ui';
import { qk, useApiMutation, useEntries, useNow, usePrices, useSessions, useStartTimer, useStopTimer } from '@/data/hooks';
import type { Project, Task, TimeEntry } from '@/data/types';
import { clock, dur, hhmm, longDate, usd } from '@/lib/format';
import { projectForFolder, sessionCost } from '@/lib/pricing';
import { isCurrent, RANGE_LABELS, rangeFor, rangeLabel, shiftAnchor, type RangeMode } from '@/lib/time';
import { DayTimeline, ProjectLegend, StackedColumns } from './charts';
import { EntryDialog, ProjectDialog, TaskDialog } from './dialogs';
import { totalsByProject, useOpenProjects, useRunningTimer, useTimeData } from './model';

export function TiempoPage() {
  const [mode, setMode] = useState<RangeMode>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [projectFilter, setProjectFilter] = useState('all');
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task; projectId?: string }>({ open: false });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: Project }>({ open: false });
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const openProjects = useOpenProjects();

  const { from, to } = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);
  const data = useTimeData();
  const entriesQ = useEntries(from, to);
  const { timer } = useRunningTimer();
  const now = useNow(timer ? 15_000 : 60_000);

  const visibleEntries = useMemo(() => {
    const all = entriesQ.data ?? [];
    if (projectFilter === 'all') return all;
    return all.filter((e) => data.taskById.get(e.task_id)?.project_id === projectFilter);
  }, [entriesQ.data, projectFilter, data.taskById]);

  const totals = useMemo(
    () => totalsByProject(visibleEntries, from, to, now, data.taskById, data.projectById),
    [visibleEntries, from, to, now, data.taskById, data.projectById],
  );

  // AI spent in the work folder linked to each project (Consumo IA sessions).
  const sessionsQ = useSessions(from, to);
  const pricesQ = usePrices();
  const aiByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessionsQ.data ?? []) {
      const p = projectForFolder(s.project, data.projects);
      if (p) m.set(p.id, (m.get(p.id) ?? 0) + sessionCost(s, pricesQ.data ?? []).cost);
    }
    return m;
  }, [sessionsQ.data, pricesQ.data, data.projects]);

  const current = isCurrent(mode, anchor, now);
  const eyebrow = mode === 'day' ? longDate(anchor) : rangeLabel(mode, anchor, now);
  const noSetup = !data.loading && data.projects.length === 0;

  return (
    <Page>
      <PageHeader
        eyebrow={eyebrow}
        title="Tiempo"
        right={
          <>
            <Segmented
              options={(['day', 'week', 'month'] as RangeMode[]).map((m) => ({ value: m, label: RANGE_LABELS[m] }))}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setAnchor(new Date());
              }}
            />
            <div className="flex h-[34px] items-center gap-0.5 rounded-lg border border-line-2 bg-surface px-1">
              <IconButton label="Anterior" size={26} onClick={() => setAnchor((a) => shiftAnchor(mode, a, -1))}>
                <ChevronLeft size={16} />
              </IconButton>
              <button type="button" className="px-1 text-[13.5px] font-medium text-ink" onClick={() => setAnchor(new Date())} title="Volver a hoy">
                {rangeLabel(mode, anchor, now)}
              </button>
              <IconButton label="Siguiente" size={26} disabled={current} onClick={() => setAnchor((a) => shiftAnchor(mode, a, 1))}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
            <div className="w-[190px]">
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-[34px] rounded-lg text-[13.5px]">
                <option value="all">Todos los proyectos</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button icon={<Plus size={16} />} onClick={() => setTaskDialog({ open: true })}>
              Nueva tarea
            </Button>
          </>
        }
      />

      {noSetup ? (
        <Empty
          icon={<Timer size={28} />}
          title="Empieza por un proyecto"
          action={
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setProjectDialog({ open: true })}>
              Crear proyecto
            </Button>
          }
        >
          Las tareas viven dentro de proyectos (clientes, Academia, Contenidos…). El tiempo se suma por proyecto.
        </Empty>
      ) : (
        <>
          <TimerBar tasks={data.tasks} projects={data.projects} onNewTask={() => setTaskDialog({ open: true })} />

          <Card>
            {mode === 'day' ? (
              <>
                <CardHead title="Línea del día" right={<ProjectLegend items={totals.byProject.map((t) => ({ project: t.project, minutes: t.minutes }))} />} />
                {entriesQ.isLoading ? (
                  <Skeleton className="h-16" />
                ) : (
                  <DayTimeline entries={visibleEntries} day={anchor} now={now} taskById={data.taskById} projectById={data.projectById} />
                )}
              </>
            ) : (
              <>
                <CardHead
                  title={mode === 'week' ? 'Por día' : 'Por día del mes'}
                  right={<ProjectLegend items={totals.byProject.map((t) => ({ project: t.project, minutes: t.minutes }))} />}
                />
                <StackedColumns
                  entries={visibleEntries}
                  from={from}
                  to={to}
                  now={now}
                  taskById={data.taskById}
                  projectById={data.projectById}
                  projects={data.projects}
                />
              </>
            )}
          </Card>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-5">
              <ProjectBars total={totals.total} byProject={totals.byProject} aiByProject={aiByProject} label={`Tiempo por proyecto · ${rangeLabel(mode, anchor, now).toLowerCase()}`} sessions={visibleEntries.length} />
              <EntriesCard
                entries={visibleEntries}
                mode={mode}
                from={from}
                to={to}
                now={now}
                taskById={data.taskById}
                projectById={data.projectById}
                onEdit={setEditing}
                loading={entriesQ.isLoading}
              />
            </div>
            <ProjectsPanel
              projects={data.projects}
              tasks={data.tasks}
              todayTotals={totals}
              open={openProjects.open}
              onToggle={openProjects.toggle}
              onNewProject={() => setProjectDialog({ open: true })}
              onEditProject={(p) => setProjectDialog({ open: true, project: p })}
              onNewTask={(projectId) => setTaskDialog({ open: true, projectId })}
              onEditTask={(t) => setTaskDialog({ open: true, task: t })}
              rangeText={mode === 'day' && current ? 'Hoy' : rangeLabel(mode, anchor, now)}
            />
          </div>
        </>
      )}

      <TaskDialog
        open={taskDialog.open}
        task={taskDialog.task}
        defaultProjectId={taskDialog.projectId}
        projects={data.projects}
        onClose={() => setTaskDialog({ open: false })}
        onCreated={(t) => openProjects.expand(t.project_id)}
      />
      <ProjectDialog open={projectDialog.open} project={projectDialog.project} projects={data.projects} onClose={() => setProjectDialog({ open: false })} />
      <EntryDialog entry={editing} onClose={() => setEditing(null)} tasks={data.tasks} projects={data.projects} />
    </Page>
  );
}

function TimerBar({ tasks, projects, onNewTask }: { tasks: Task[]; projects: Project[]; onNewTask: () => void }) {
  const { timer } = useRunningTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const [picked, setPicked] = useState('');
  const activeTasks = tasks.filter((t) => !t.archived);
  const groups = projects.filter((p) => !p.archived).map((p) => ({ p, ts: activeTasks.filter((t) => t.project_id === p.id) })).filter((g) => g.ts.length);

  const taskPicker = (value: string, onChange: (id: string) => void, placeholder: string) => (
    <div className="relative min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Elegir tarea"
      >
        <option value="">{placeholder}</option>
        {groups.map(({ p, ts }) => (
          <optgroup key={p.id} label={p.name}>
            {ts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="pointer-events-none flex items-center gap-1.5 truncate text-base font-semibold text-ink">
        <span className="truncate">{placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-ink-3" />
      </div>
    </div>
  );

  if (timer) {
    return (
      <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface py-3.5 pr-4 pl-5 shadow-[0_1px_3px_rgb(var(--shade)/0.05)] sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-good" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {taskPicker('', (id) => id && id !== timer.task?.id && start.mutate(id), timer.task?.name ?? 'Tarea')}
            <div className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
              {timer.project && <Dot color={timer.project.color} size={7} />}
              <span className="truncate">
                {timer.project?.name} · en curso desde las {hhmm(new Date(timer.entry.started_at))}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="tnum text-[30px] font-semibold tracking-[-0.02em] text-ink">{clock(timer.seconds)}</span>
          <Button variant="danger" size="lg" icon={<Square size={14} fill="currentColor" />} onClick={() => stop.mutate(undefined)} disabled={stop.isPending}>
            Detener
          </Button>
        </div>
      </div>
    );
  }

  const pickedTask = activeTasks.find((t) => t.id === picked);
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface py-3.5 pr-4 pl-5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-line-2" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {groups.length ? (
            taskPicker(picked, setPicked, pickedTask?.name ?? '¿En qué vas a trabajar?')
          ) : (
            <button type="button" onClick={onNewTask} className="text-left text-base font-semibold text-ink">
              Crea tu primera tarea
            </button>
          )}
          <span className="text-[12.5px] text-ink-3">{pickedTask ? projects.find((p) => p.id === pickedTask.project_id)?.name : 'Elige una tarea y arranca el cronómetro'}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <span className="tnum text-[30px] font-semibold tracking-[-0.02em] text-ink-4">00:00:00</span>
        <Button variant="primary" size="lg" icon={<Play size={14} fill="currentColor" />} disabled={!picked || start.isPending} onClick={() => start.mutate(picked)}>
          Iniciar
        </Button>
      </div>
    </div>
  );
}

function ProjectBars({
  total,
  byProject,
  aiByProject,
  label,
  sessions,
}: {
  total: number;
  byProject: { project: Project; minutes: number; tasks: Map<string, number> }[];
  aiByProject: Map<string, number>;
  label: string;
  sessions: number;
}) {
  const max = Math.max(1, ...byProject.map((b) => b.minutes));
  return (
    <Card>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label>{label}</Label>
          <div className="text-[40px] leading-[48px] font-semibold tracking-[-0.03em] text-ink md:text-[48px] md:leading-[54px]">{dur(total)}</div>
        </div>
        <div className="pb-2 text-[13px] text-ink-3">
          {byProject.length} {byProject.length === 1 ? 'proyecto' : 'proyectos'} · {sessions} {sessions === 1 ? 'sesión' : 'sesiones'}
        </div>
      </div>
      {byProject.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Sin tiempo registrado en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {byProject.map(({ project, minutes, tasks }) => (
            <div key={project.id} className="grid h-11 grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-[210px_minmax(0,1fr)_140px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <Dot color={project.color} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-medium text-ink">{project.name}</span>
                  <span className="text-xs text-ink-3">
                    {tasks.size} {tasks.size === 1 ? 'tarea' : 'tareas'}
                    {(aiByProject.get(project.id) ?? 0) > 0 && ` · IA ${usd(aiByProject.get(project.id)!)}`}
                  </span>
                </div>
              </div>
              <div className="h-3.5">
                <div className="h-3.5 rounded-r" style={{ width: `${(minutes / max) * 100}%`, background: project.color, minWidth: 3 }} />
              </div>
              <div className="flex items-baseline justify-end gap-2 text-[13.5px]">
                <span className="tnum font-semibold text-ink">{dur(minutes)}</span>
                <span className="tnum w-9 text-right text-ink-3">{Math.round((minutes / Math.max(total, 1)) * 100)} %</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function EntriesCard({
  entries,
  mode,
  from,
  to,
  now,
  taskById,
  projectById,
  onEdit,
  loading,
}: {
  entries: TimeEntry[];
  mode: RangeMode;
  from: Date;
  to: Date;
  now: Date;
  taskById: Map<string, Task>;
  projectById: Map<string, Project>;
  onEdit: (e: TimeEntry) => void;
  loading: boolean;
}) {
  const start = useStartTimer();
  const stop = useStopTimer();
  const remove = useApiMutation((api, id: string) => api.deleteEntry(id), [qk.running, ['entries']], 'No se pudo borrar');
  const [limit, setLimit] = useState(30);
  const sorted = [...entries].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const shown = sorted.slice(0, limit);
  let lastDay = '';

  return (
    <Card>
      <CardHead title="Registros" right={<span className="text-[13px] text-ink-3">{entries.length} sesiones</span>} />
      {loading ? (
        <Skeleton className="h-40" />
      ) : entries.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Aún no hay registros en este periodo.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_100px_64px] gap-4 border-b border-line pb-2 text-xs font-medium text-ink-3 md:grid">
            <span>Tarea</span>
            <span>Horario</span>
            <span className="text-right">Duración</span>
            <span />
          </div>
          {shown.map((e) => {
            const task = taskById.get(e.task_id);
            const project = task ? projectById.get(task.project_id) : undefined;
            const running = !e.ended_at;
            const startD = new Date(e.started_at);
            const dayLabel = format(startD, "EEEE d 'de' MMMM", { locale: es });
            const header = mode !== 'day' && dayLabel !== lastDay ? dayLabel : null;
            lastDay = dayLabel;
            const minutes = Math.max(0, ((e.ended_at ? new Date(e.ended_at) : now).getTime() - startD.getTime()) / 60000);
            const clipped = startD < from || (e.ended_at ? new Date(e.ended_at) > to : false);
            return (
              <div key={e.id}>
                {header && <div className="pt-3 pb-1 text-xs font-semibold text-ink-3 first-letter:uppercase">{header}</div>}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-rule py-2.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_150px_100px_64px]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Dot color={project?.color ?? 'var(--color-mute)'} />
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-2.5">
                        <span className="truncate text-[14px] text-ink">{task?.name ?? 'Tarea eliminada'}</span>
                        {running && <LiveDot />}
                      </div>
                      <span className="truncate text-xs text-ink-3">
                        {project?.name}
                        <span className="md:hidden">
                          {' · '}
                          {hhmm(startD)} – {running ? 'ahora' : hhmm(new Date(e.ended_at!))}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="tnum hidden text-[13.5px] text-ink-2 md:block">
                    {hhmm(startD)} – {running ? 'ahora' : hhmm(new Date(e.ended_at!))}
                    {clipped && <span className="text-ink-4"> *</span>}
                  </div>
                  <div className="tnum text-right text-[13.5px] font-semibold text-ink">{dur(minutes)}</div>
                  <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                    {running ? (
                      <IconButton label="Detener" variant="danger" size={28} onClick={() => stop.mutate(undefined)}>
                        <Square size={11} fill="currentColor" />
                      </IconButton>
                    ) : (
                      <IconButton label="Continuar esta tarea" variant="round" size={28} onClick={() => task && start.mutate(task.id)} disabled={!task}>
                        <Play size={11} fill="currentColor" />
                      </IconButton>
                    )}
                    <Menu
                      items={[
                        { label: 'Editar horario', icon: <Pencil size={14} />, onSelect: () => onEdit(e) },
                        {
                          label: 'Borrar registro',
                          icon: <Trash2 size={14} />,
                          danger: true,
                          onSelect: () => confirm('¿Borrar este registro?') && remove.mutate(e.id),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {sorted.length > limit && (
            <Button variant="ghost" className="mt-2 self-center" onClick={() => setLimit((l) => l + 50)}>
              Ver más
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function ProjectsPanel({
  projects,
  tasks,
  todayTotals,
  open,
  onToggle,
  onNewProject,
  onEditProject,
  onNewTask,
  onEditTask,
  rangeText,
}: {
  projects: Project[];
  tasks: Task[];
  todayTotals: { byProject: { project: Project; minutes: number; tasks: Map<string, number> }[] };
  open: Set<string>;
  onToggle: (projectId: string) => void;
  onNewProject: () => void;
  onEditProject: (p: Project) => void;
  onNewTask: (projectId?: string) => void;
  onEditTask: (t: Task) => void;
  rangeText: string;
}) {
  const { timer } = useRunningTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const [showArchived, setShowArchived] = useState(false);
  const archiveProject = useApiMutation((api, v: { id: string; archived: boolean }) => api.updateProject(v.id, { archived: v.archived }), [qk.projects]);
  const deleteProject = useApiMutation((api, id: string) => api.deleteProject(id), [qk.projects, qk.tasks, qk.running, ['entries']]);
  const archiveTask = useApiMutation((api, v: { id: string; archived: boolean }) => api.updateTask(v.id, { archived: v.archived }), [qk.tasks]);
  const deleteTask = useApiMutation((api, id: string) => api.deleteTask(id), [qk.tasks, qk.running, ['entries']]);

  const minutesFor = (p: Project) => todayTotals.byProject.find((b) => b.project.id === p.id);
  const visible = projects.filter((p) => showArchived || !p.archived);
  const archivedCount = projects.filter((p) => p.archived).length;

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHead
        title="Proyectos y tareas"
        right={
          <button type="button" onClick={onNewProject} className="flex items-center gap-1 text-[13px] font-medium text-accent">
            <Plus size={14} strokeWidth={2.2} />
            Proyecto
          </button>
        }
      />
      <button
        type="button"
        onClick={() => onNewTask()}
        className="flex h-[38px] items-center gap-2 rounded-[10px] border border-line-2 bg-surface px-3 text-left text-[13.5px] text-ink-4 hover:bg-plane"
      >
        <Plus size={16} className="text-ink-3" />
        Nueva tarea…
      </button>
      <div className="-mt-1.5 flex flex-col">
        {visible.map((p, gi) => {
          const pm = minutesFor(p);
          const ts = tasks.filter((t) => t.project_id === p.id && (showArchived || !t.archived));
          const isOpen = open.has(p.id);
          return (
            <div key={p.id} className={cx('flex flex-col', isOpen && 'pb-1', gi > 0 && 'border-t border-rule')}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onToggle(p.id)}
                  aria-expanded={isOpen}
                  className="group flex h-10 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronRight
                    size={14}
                    strokeWidth={2.2}
                    className={cx('-mr-0.5 -ml-1 shrink-0 text-ink-3 transition-transform group-hover:text-ink', isOpen && 'rotate-90')}
                  />
                  <Dot color={p.color} />
                  <span className={cx('truncate text-[13px] font-semibold', p.archived ? 'text-ink-3' : 'text-ink')}>
                    {p.name}
                    {p.archived && ' (archivado)'}
                  </span>
                  {ts.length > 0 && <span className="tnum shrink-0 text-xs text-ink-4">{ts.length}</span>}
                  <span className="ml-auto flex shrink-0 items-center gap-2 pl-1">
                    {timer?.task?.project_id === p.id && <LiveDot hideLabel />}
                    {pm && (
                      <span className="tnum text-xs text-ink-3" title={rangeText}>
                        {dur(pm.minutes)}
                      </span>
                    )}
                  </span>
                </button>
                <Menu
                  items={[
                    { label: 'Nueva tarea aquí', icon: <Plus size={14} />, onSelect: () => onNewTask(p.id) },
                    { label: 'Editar proyecto', icon: <Pencil size={14} />, onSelect: () => onEditProject(p) },
                    { label: p.archived ? 'Restaurar' : 'Archivar', onSelect: () => archiveProject.mutate({ id: p.id, archived: !p.archived }) },
                    {
                      label: 'Borrar proyecto',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => confirm(`¿Borrar "${p.name}" con sus tareas y registros? No se puede deshacer.`) && deleteProject.mutate(p.id),
                    },
                  ]}
                />
              </div>
              {isOpen && ts.length === 0 && <div className="pb-2 pl-8 text-xs text-ink-4">Sin tareas</div>}
              {isOpen && ts.map((t) => {
                const running = timer?.task?.id === t.id;
                const m = pm?.tasks.get(t.id) ?? 0;
                return (
                  <div key={t.id} className="flex min-h-[46px] items-center gap-2.5 pl-8">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={cx('truncate text-[13.5px] font-medium', t.archived ? 'text-ink-3' : 'text-ink')}>{t.name}</span>
                      <span className={cx('tnum text-xs', running ? 'text-ink-2' : 'text-ink-3')}>
                        {running ? `En curso · ${clock(timer!.seconds)}` : m ? `${rangeText} ${dur(m)}` : 'Sin registros'}
                      </span>
                    </div>
                    <Menu
                      items={[
                        { label: 'Editar tarea', icon: <Pencil size={14} />, onSelect: () => onEditTask(t) },
                        { label: t.archived ? 'Restaurar' : 'Archivar', onSelect: () => archiveTask.mutate({ id: t.id, archived: !t.archived }) },
                        {
                          label: 'Borrar tarea',
                          icon: <Trash2 size={14} />,
                          danger: true,
                          onSelect: () => confirm(`¿Borrar "${t.name}" y sus registros?`) && deleteTask.mutate(t.id),
                        },
                      ]}
                    />
                    {running ? (
                      <IconButton label="Detener" variant="danger" size={32} onClick={() => stop.mutate(undefined)}>
                        <Square size={12} fill="currentColor" />
                      </IconButton>
                    ) : (
                      <IconButton label={`Iniciar ${t.name}`} variant="round" size={32} onClick={() => start.mutate(t.id)} disabled={t.archived}>
                        <Play size={12} fill="currentColor" />
                      </IconButton>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12.5px] leading-[17px] text-ink-3">
        <span>Al iniciar otra tarea, la que está en curso se detiene sola.</span>
        {archivedCount > 0 && (
          <button type="button" className="shrink-0 font-medium text-ink-2" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? 'Ocultar archivados' : `Archivados (${archivedCount})`}
          </button>
        )}
      </div>
    </Card>
  );
}

