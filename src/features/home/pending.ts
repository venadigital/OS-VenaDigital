// "Pendientes a mano" on Inicio: to-do notes plus Tiempo tasks with a due date, today's first.
import { differenceInCalendarDays } from 'date-fns';
import { dayKey, fromDayKey } from '@/lib/time';
import { dayLabel, relDays } from '@/features/clientes/model';
import type { Note, Project, Task } from '@/data/types';

export type PendingItem = {
  key: string;
  kind: 'nota' | 'tarea';
  id: string;
  title: string;
  due: string | null;
  pinned: boolean;
  project?: Project;
};

/** Today, then overdue (latest first), then upcoming (nearest first), then undated (pinned first). */
export function pendingItems(notes: Note[], tasks: Task[], projectById: Map<string, Project>, now: Date): PendingItem[] {
  const today = dayKey(now);
  const items: PendingItem[] = [
    ...notes
      .filter((n) => n.type === 'hacer' && !n.done)
      .map((n): PendingItem => ({ key: `nota:${n.id}`, kind: 'nota', id: n.id, title: n.body, due: n.due_date, pinned: n.pinned })),
    ...tasks
      .filter((t) => !t.archived && t.due_date && !projectById.get(t.project_id)?.archived)
      .map((t): PendingItem => ({ key: `tarea:${t.id}`, kind: 'tarea', id: t.id, title: t.name, due: t.due_date!, pinned: false, project: projectById.get(t.project_id) })),
  ];
  const rank = (due: string | null) => (due == null ? 3 : due === today ? 0 : due < today ? 1 : 2);
  return items.sort((a, b) => {
    const r = rank(a.due) - rank(b.due);
    if (r) return r;
    if (a.due && b.due && a.due !== b.due) return rank(a.due) === 1 ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due);
    return Number(b.pinned) - Number(a.pinned);
  });
}

/** "Hoy", "Mañana", "Vencido ayer", "Mar 20 oct" or "Sin fecha". */
export function dueLabel(due: string | null, now: Date): string {
  if (!due) return 'Sin fecha';
  const days = differenceInCalendarDays(fromDayKey(due), now);
  if (days < 0) return `Vencido ${relDays(days)}`;
  if (days <= 1) return days === 0 ? 'Hoy' : 'Mañana';
  const label = dayLabel(due);
  return label[0].toUpperCase() + label.slice(1);
}
