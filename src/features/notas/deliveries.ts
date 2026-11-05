// Tiempo tasks with a delivery date, shown beside the to-dos of Hoy and Próximo.
import type { Project, Task } from '@/data/types';

export type Delivery = { task: Task; due: string; project?: Project };

/**
 * Open deliveries of active projects: due today or late, and coming up, by date.
 * `keep` holds on to ones just checked off, so their row can still read as done.
 */
export function deliveriesFor(
  tasks: Task[],
  projectById: Map<string, Project>,
  today: string,
  keep: (taskId: string) => boolean = () => false,
): { today: Delivery[]; upcoming: Delivery[] } {
  const open = tasks
    .filter((t) => (!t.archived || keep(t.id)) && t.due_date && !projectById.get(t.project_id)?.archived)
    .map((t): Delivery => ({ task: t, due: t.due_date!, project: projectById.get(t.project_id) }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.task.name.localeCompare(b.task.name));
  return { today: open.filter((d) => d.due <= today), upcoming: open.filter((d) => d.due > today) };
}
