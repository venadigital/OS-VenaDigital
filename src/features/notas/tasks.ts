// The to-do layer of Notas: which view each "Por hacer" or "Por investigar" belongs to and how it reads.
import { addDays, differenceInCalendarDays, format, getDay, isSameYear, nextSaturday } from 'date-fns';
import { es } from 'date-fns/locale';
import { dayLabel, relDays } from '@/features/clientes/model';
import { dayKey, fromDayKey } from '@/lib/time';
import type { ChecklistItem, Note, NoteBucket, NoteInput, NoteType } from '@/data/types';

export type TaskView = 'entrada' | 'hoy' | 'proximo' | 'cuando' | 'algun' | 'registro';
export type NotasView = TaskView | 'muro';
export type TaskType = Extract<NoteType, 'hacer' | 'investigar'>;

export const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: 'entrada', label: 'Entrada' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'proximo', label: 'Próximo' },
  { id: 'cuando', label: 'Cuando sea' },
  { id: 'algun', label: 'Algún día' },
  { id: 'registro', label: 'Registro' },
];

export const parseView = (v: string | null): NotasView | null => (v === 'muro' || TASK_VIEWS.some((t) => t.id === v) ? (v as NotasView) : null);

export const isTask = (n: Pick<Note, 'type'>) => n.type === 'hacer' || n.type === 'investigar';

/** The one view a to-do shows up in. Anything due today or late goes to Hoy, whatever else it says. */
export function taskView(n: Pick<Note, 'done' | 'due_date' | 'deadline' | 'bucket'>, today: string): TaskView {
  if (n.done) return 'registro';
  if ((n.due_date && n.due_date <= today) || (n.deadline && n.deadline <= today)) return 'hoy';
  if (n.due_date) return 'proximo';
  if (n.bucket === 'algun_dia') return 'algun';
  if (n.deadline) return 'proximo';
  return n.bucket === 'cuando_sea' ? 'cuando' : 'entrada';
}

export const noteView = (n: Note, today: string): NotasView => (isTask(n) ? taskView(n, today) : 'muro');

/** The first line of a to-do is its title; the rest are its notes. */
export function taskTitle(body: string): string {
  const i = body.indexOf('\n');
  return (i < 0 ? body : body.slice(0, i)).trim();
}
export function taskNotes(body: string): string {
  const i = body.indexOf('\n');
  return i < 0 ? '' : body.slice(i + 1).trim();
}
export const joinTask = (title: string, notes: string) => [title.trim(), notes.trim()].filter(Boolean).join('\n');

// ---------------------------------------------------------------- cuándo
export type When = Pick<Note, 'due_date' | 'bucket'>;

/** A dated to-do has left Entrada: clearing its date later must not send it back there. */
export const whenDate = (date: string): When => ({ due_date: date, bucket: 'cuando_sea' });
export const whenBucket = (bucket: NoteBucket): When => ({ due_date: null, bucket });

/** Where a to-do created from a view starts. */
export function defaultWhen(view: NotasView, today: string): When {
  if (view === 'hoy') return whenDate(today);
  if (view === 'cuando') return whenBucket('cuando_sea');
  if (view === 'algun') return whenBucket('algun_dia');
  return whenBucket('entrada');
}

export const tomorrow = (now: Date) => dayKey(addDays(now, 1));

/** Today on a weekend; otherwise the coming Saturday. */
export function weekend(now: Date): string {
  const day = getDay(now);
  return dayKey(day === 0 || day === 6 ? now : nextSaturday(now));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hoy", "Mañana", "Vie 6 nov" for a date. */
export function dateLabel(date: string, now: Date): string {
  const days = differenceInCalendarDays(fromDayKey(date), now);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return capitalize(dayLabel(date));
}

export function whenLabel(w: When, now: Date): string {
  if (w.due_date) return dateLabel(w.due_date, now);
  return { entrada: 'Entrada', cuando_sea: 'Cuando sea', algun_dia: 'Algún día' }[w.bucket];
}

/** "Desde ayer" for a to-do planned for a day that already went by. */
export function carriedLabel(n: Pick<Note, 'due_date'>, now: Date): string | null {
  if (!n.due_date) return null;
  const days = differenceInCalendarDays(fromDayKey(n.due_date), now);
  return days < 0 ? `Desde ${relDays(days)}` : null;
}

// ---------------------------------------------------------------- fecha límite
export function deadlineLabel(deadline: string, now: Date): { text: string; late: boolean } {
  const days = differenceInCalendarDays(fromDayKey(deadline), now);
  if (days < 0) return { text: `Venció ${relDays(days)}`, late: true };
  if (days === 0) return { text: 'Vence hoy', late: true };
  if (days === 1) return { text: 'Vence mañana', late: false };
  return { text: `Faltan ${days} días`, late: false };
}

// ---------------------------------------------------------------- listas
const byPinThenNewest = (a: Note, b: Note) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at);
const dateOf = (n: Note) => n.due_date ?? n.deadline ?? '';

export const completedAt = (n: Note) => n.completed_at ?? n.updated_at;

/** Late deadlines first in Hoy, the latest done first in Registro, otherwise pinned and then newest. */
export function sortTasks(tasks: Note[], view: TaskView, today: string): Note[] {
  const list = [...tasks];
  if (view === 'registro') return list.sort((a, b) => completedAt(b).localeCompare(completedAt(a)));
  if (view === 'hoy') {
    const late = (n: Note) => Number(Boolean(n.deadline && n.deadline <= today));
    return list.sort((a, b) => late(b) - late(a) || byPinThenNewest(a, b));
  }
  return list.sort(byPinThenNewest);
}

export type UpcomingGroup = { key: string; day?: number; title: string; tasks: Note[] };

/** One group per day for the next week, then one per month. */
export function upcomingGroups(tasks: Note[], now: Date): UpcomingGroup[] {
  const groups = new Map<string, UpcomingGroup>();
  const sorted = [...tasks].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || byPinThenNewest(a, b));
  for (const n of sorted) {
    const date = fromDayKey(dateOf(n));
    const soon = differenceInCalendarDays(date, now) <= 7;
    const key = soon ? dateOf(n) : format(date, 'yyyy-MM');
    const title = capitalize(format(date, soon ? 'EEEE' : isSameYear(date, now) ? 'MMMM' : 'MMMM yyyy', { locale: es }));
    const group = groups.get(key) ?? { key, day: soon ? date.getDate() : undefined, title, tasks: [] };
    group.tasks.push(n);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export type ViewCounts = Record<TaskView, number> & { late: number; muro: number };

export function viewCounts(notes: Note[], today: string): ViewCounts {
  const counts: ViewCounts = { entrada: 0, hoy: 0, proximo: 0, cuando: 0, algun: 0, registro: 0, late: 0, muro: 0 };
  for (const n of notes) {
    if (!isTask(n)) {
      counts.muro += 1;
      continue;
    }
    counts[taskView(n, today)] += 1;
    if (!n.done && n.deadline && n.deadline <= today) counts.late += 1;
  }
  return counts;
}

// ---------------------------------------------------------------- checklist
export const newStep = (): ChecklistItem => ({ id: Math.random().toString(36).slice(2, 10), text: '', done: false });
export const cleanSteps = (steps: ChecklistItem[]): ChecklistItem[] =>
  steps.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);

/** Everything the to-do form edits, ready to save. */
export function taskPatch(v: { type: TaskType; title: string; notes: string; when: When; deadline: string; steps: ChecklistItem[] }): NoteInput {
  return { type: v.type, body: joinTask(v.title, v.notes), ...v.when, deadline: v.deadline || null, checklist: cleanSteps(v.steps) };
}
