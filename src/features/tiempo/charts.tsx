import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Project, Task, TimeEntry } from '@/data/types';
import { durShort, dur, hhmm } from '@/lib/format';
import { daysIn, overlapMinutes } from '@/lib/time';
import { Dot } from '@/components/ui';

type Lookup = { taskById: Map<string, Task>; projectById: Map<string, Project> };

/** Sessions of one day laid out on an hour axis. */
export function DayTimeline({ entries, day, now, taskById, projectById }: { entries: TimeEntry[]; day: Date; now: Date } & Lookup) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const blocks = entries
    .map((e) => {
      const s = Math.max(new Date(e.started_at).getTime(), dayStart.getTime());
      const end = Math.min(e.ended_at ? new Date(e.ended_at).getTime() : now.getTime(), dayEnd.getTime());
      const task = taskById.get(e.task_id);
      const project = task ? projectById.get(task.project_id) : undefined;
      return { e, s, end, task, project };
    })
    .filter((b) => b.end > b.s);

  const hourOf = (t: number) => (t - dayStart.getTime()) / 3_600_000;
  const showNow = isSameDay(day, now);
  const first = Math.min(8, ...blocks.map((b) => Math.floor(hourOf(b.s))));
  const last = Math.max(18, ...blocks.map((b) => Math.ceil(hourOf(b.end))), showNow ? Math.ceil(hourOf(now.getTime())) : 0);
  const span = Math.max(1, last - first);
  const pct = (h: number) => `${(((h - first) / span) * 100).toFixed(3)}%`;
  const hours = Array.from({ length: span + 1 }, (_, i) => first + i);
  const step = span > 14 ? 2 : 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-3.5">
        {showNow && (
          <span className="absolute -translate-x-1/2 text-[11px] font-semibold text-ink" style={{ left: pct(hourOf(now.getTime())) }}>
            Ahora
          </span>
        )}
      </div>
      <div className="relative h-[42px]">
        {hours.map((h) => (
          <div key={h} className="absolute inset-y-0 w-px bg-rule" style={{ left: pct(h) }} />
        ))}
        {blocks.map((b) => (
          <div
            key={b.e.id}
            title={`${b.task?.name ?? ''} · ${b.project?.name ?? ''}\n${hhmm(new Date(b.s))} – ${b.e.ended_at ? hhmm(new Date(b.end)) : 'ahora'} · ${dur((b.end - b.s) / 60000)}`}
            className="absolute top-1.5 h-[30px] rounded"
            style={{
              left: pct(hourOf(b.s)),
              width: `calc(${(((b.end - b.s) / 3_600_000 / span) * 100).toFixed(3)}% - 2px)`,
              minWidth: 3,
              background: b.project?.color ?? 'var(--color-mute)',
            }}
          />
        ))}
        {showNow && <div className="absolute inset-y-0 -ml-px w-0.5 rounded-sm bg-ink" style={{ left: pct(hourOf(now.getTime())) }} />}
      </div>
      <div className="relative h-4">
        {hours
          .filter((h, i) => i % step === 0 || h === last)
          .map((h, i, arr) => (
            <span
              key={h}
              className="tnum absolute text-[11px] text-ink-3"
              style={{ left: pct(h), transform: `translateX(${i === 0 ? '0' : i === arr.length - 1 ? '-100%' : '-50%'})` }}
            >
              {h}:00
            </span>
          ))}
      </div>
    </div>
  );
}

/** Minutes per day stacked by project (week / month views). */
export function StackedColumns({
  entries,
  from,
  to,
  now,
  taskById,
  projectById,
  projects,
}: { entries: TimeEntry[]; from: Date; to: Date; now: Date; projects: Project[] } & Lookup) {
  const days = useMemo(() => daysIn(from, to), [from, to]);
  const data = useMemo(
    () =>
      days.map((d) => {
        const dFrom = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dTo = new Date(dFrom.getTime() + 86_400_000);
        const perProject = new Map<string, number>();
        for (const e of entries) {
          const task = taskById.get(e.task_id);
          if (!task || !projectById.has(task.project_id)) continue;
          const m = overlapMinutes(e, dFrom, dTo, now);
          if (m > 0) perProject.set(task.project_id, (perProject.get(task.project_id) ?? 0) + m);
        }
        return { d, perProject, total: [...perProject.values()].reduce((a, b) => a + b, 0) };
      }),
    [days, entries, taskById, projectById, now],
  );

  const max = Math.max(60, ...data.map((x) => x.total));
  const W = 1000;
  const H = 190;
  const base = 158;
  const top = 18;
  const slot = W / data.length;
  const bw = Math.min(24, slot * 0.6);
  const k = (base - top) / max;
  const order = projects.map((p) => p.id);
  const monthly = data.length > 10;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Tiempo por día">
      <line x1={0} x2={W} y1={base} y2={base} className="stroke-mute" strokeWidth={1} />
      {data.map(({ d, perProject, total }, i) => {
        const x = i * slot + slot / 2 - bw / 2;
        const segs = order.filter((id) => (perProject.get(id) ?? 0) > 0).map((id) => ({ id, v: perProject.get(id)!, color: projectById.get(id)!.color }));
        let y = base;
        const today = isSameDay(d, now);
        const label = monthly ? format(d, 'd') : format(d, 'EEE', { locale: es }).replace('.', '');
        const showLabel = !monthly || d.getDate() === 1 || d.getDate() % 5 === 0 || today;
        return (
          <g key={d.toISOString()}>
            <title>{`${format(d, "EEEE d 'de' MMMM", { locale: es })}: ${dur(total)}`}</title>
            {segs.map((s, j) => {
              const h = Math.max(1, s.v * k - (j ? 2 : 0));
              const yTop = y - h;
              const isTop = j === segs.length - 1;
              const r = isTop ? Math.min(4, h) : 0;
              const path = `M${x} ${y} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + bw - r} Q${x + bw} ${yTop} ${x + bw} ${yTop + r} V${y} Z`;
              y = yTop - 2;
              return <path key={s.id} d={path} fill={s.color} />;
            })}
            {today && total > 0 && (
              <text x={x + bw / 2} y={base - total * k - 8} textAnchor="middle" fontSize={11} fontWeight={600} className="tnum fill-ink-2">
                {durShort(total)}
              </text>
            )}
            {showLabel && (
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize={11} fontWeight={today ? 600 : 400} className={today ? 'fill-ink' : 'fill-ink-3'}>
                {today && !monthly ? 'Hoy' : label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ProjectLegend({ items }: { items: { project: Project; minutes: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-2">
      {items.map(({ project, minutes }) => (
        <span key={project.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <Dot color={project.color} size={7} />
          {project.name}
          <span className="tnum font-semibold text-ink">{durShort(minutes)}</span>
        </span>
      ))}
    </div>
  );
}
