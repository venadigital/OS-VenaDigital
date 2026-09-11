import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNow, useProjects, useRunning, useTasks } from '@/data/hooks';
import type { Project, Task, TimeEntry } from '@/data/types';
import { overlapMinutes } from '@/lib/time';

const OPEN_KEY = 'vena-os-open-projects';

function readOpen(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    if (Array.isArray(v)) return new Set(v.filter((x): x is string => typeof x === 'string'));
  } catch {
    // storage unavailable
  }
  return new Set();
}

/** Projects unfolded in "Proyectos y tareas". All folded by default; remembered per device (localStorage). */
export function useOpenProjects() {
  const [open, setOpen] = useState(readOpen);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {
      // storage unavailable
    }
  }, [open]);
  const toggle = useCallback(
    (id: string) =>
      setOpen((s) => {
        const next = new Set(s);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const expand = useCallback((id: string) => setOpen((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  return { open, toggle, expand };
}

export function useTimeData() {
  const projects = useProjects();
  const tasks = useTasks();
  const projectById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]);
  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data]);
  return {
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    projectById,
    taskById,
    loading: projects.isLoading || tasks.isLoading,
  };
}

export type RunningTimer = {
  entry: TimeEntry;
  task?: Task;
  project?: Project;
  seconds: number;
};

/** The running entry with its task/project and a live elapsed counter. */
export function useRunningTimer(): { timer: RunningTimer | null; loading: boolean } {
  const running = useRunning();
  const { taskById, projectById } = useTimeData();
  const entry = running.data ?? null;
  const now = useNow(1000, Boolean(entry));
  if (!entry) return { timer: null, loading: running.isLoading };
  const task = taskById.get(entry.task_id);
  const project = task ? projectById.get(task.project_id) : undefined;
  const seconds = Math.max(0, (now.getTime() - new Date(entry.started_at).getTime()) / 1000);
  return { timer: { entry, task, project, seconds }, loading: false };
}

export type ProjectTotal = { project: Project; minutes: number; tasks: Map<string, number> };

/** Minutes per project (and per task) inside [from, to). */
export function totalsByProject(
  entries: TimeEntry[],
  from: Date,
  to: Date,
  now: Date,
  taskById: Map<string, Task>,
  projectById: Map<string, Project>,
): { total: number; byProject: ProjectTotal[] } {
  const map = new Map<string, ProjectTotal>();
  let total = 0;
  for (const e of entries) {
    const task = taskById.get(e.task_id);
    const project = task ? projectById.get(task.project_id) : undefined;
    if (!task || !project) continue;
    const m = overlapMinutes(e, from, to, now);
    if (m <= 0) continue;
    total += m;
    const pt = map.get(project.id) ?? { project, minutes: 0, tasks: new Map<string, number>() };
    pt.minutes += m;
    pt.tasks.set(task.id, (pt.tasks.get(task.id) ?? 0) + m);
    map.set(project.id, pt);
  }
  return { total, byProject: [...map.values()].sort((a, b) => b.minutes - a.minutes) };
}
