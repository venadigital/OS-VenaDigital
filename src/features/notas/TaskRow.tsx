import { Archive, Check, Flag, Image as ImageIcon, Layers, LayoutGrid, ListChecks, MoreHorizontal, Pin, PinOff, Star, Text, Trash2 } from 'lucide-react';
import { cx, Menu, type MenuItem } from '@/components/ui';
import type { Note, NoteInput } from '@/data/types';
import { relativeDay } from '@/lib/format';
import { dayKey } from '@/lib/time';
import type { RowDrag } from './drag';
import { carriedLabel, completedAt, dateLabel, deadlineLabel, taskNotes, taskTitle, type TaskView, whenBucket, whenDate, whenOf } from './tasks';

export type TaskActions = {
  onToggle: (n: Note) => void;
  onOpen: (n: Note) => void;
  onPatch: (n: Note, patch: NoteInput) => void;
  onDelete: (n: Note) => void;
};

/** A view of Notas, or the page of an area or project. */
export type RowPlace = TaskView | 'lista';

function rowMenu(note: Note, done: boolean, now: Date, { onPatch, onDelete }: TaskActions): MenuItem[] {
  const remove: MenuItem = { label: 'Borrar', icon: <Trash2 size={14} />, danger: true, onSelect: () => onDelete(note) };
  if (done) return [remove];
  const today = dayKey(now);
  const { due_date, bucket } = whenOf(note);
  const move: MenuItem[] = [];
  if (due_date !== today) move.push({ label: 'Para hoy', icon: <Star size={14} />, onSelect: () => onPatch(note, whenDate(today)) });
  if (due_date || bucket !== 'cuando_sea') move.push({ label: 'Cuando sea', icon: <Layers size={14} />, onSelect: () => onPatch(note, whenBucket('cuando_sea')) });
  if (due_date || bucket !== 'algun_dia') move.push({ label: 'Algún día', icon: <Archive size={14} />, onSelect: () => onPatch(note, whenBucket('algun_dia')) });
  return [
    ...move,
    { label: note.pinned ? 'Desfijar' : 'Fijar arriba', icon: note.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => onPatch(note, { pinned: !note.pinned }) },
    { label: 'Mover al muro', icon: <LayoutGrid size={14} />, onSelect: () => onPatch(note, { type: 'nota', list_id: null, section_id: null }) },
    remove,
  ];
}

/** "Hoy", "Lun 9" or "Algún día", for a row in a list that mixes every date. */
function plannedLabel(note: Note, now: Date): string | null {
  if (note.due_date) return dateLabel(note.due_date, now);
  return note.bucket === 'algun_dia' ? 'Algún día' : null;
}

/** While choosing several: the whole row picks it. */
export type RowPick = { selected: boolean; onToggle: () => void };

export function TaskRow({
  note,
  done,
  leaving,
  place,
  now,
  listName,
  actions,
  pick,
  drag,
}: {
  note: Note;
  done: boolean;
  leaving: boolean;
  place: RowPlace;
  now: Date;
  /** The area or project it belongs to, when the row is not already inside it. */
  listName?: string;
  actions: TaskActions;
  pick?: RowPick;
  drag?: RowDrag;
}) {
  const title = taskTitle(note.body) || 'Sin título';
  const steps = note.checklist.length;
  const flag = note.deadline && !done ? deadlineLabel(note.deadline, now) : null;
  const finished = done && note.done && (place === 'registro' || place === 'lista') ? relativeDay(new Date(completedAt(note)), now) : null;
  const carried = place === 'hoy' ? carriedLabel(note, now) : null;
  const planned = place === 'lista' && !done ? plannedLabel(note, now) : null;
  const details = [listName, finished, carried].filter(Boolean).join(' · ');

  const aside = (inline: boolean) => (
    <>
      {planned && <span className={cx('task-flag', inline ? 'task-flag-inline' : 'task-flag-side')}>{planned}</span>}
      {flag && (
        <span className={cx('task-flag', inline ? 'task-flag-inline' : 'task-flag-side', flag.late && 'is-late')}>
          <Flag size={13} aria-hidden />
          {flag.text}
        </span>
      )}
    </>
  );

  const content = (
    <>
      <span className="task-line">
        <span className="task-title">{title}</span>
        {note.pinned && !done && <Pin size={13} className="task-icon" aria-label="Fijada" />}
        {taskNotes(note.body) && <Text size={14} className="task-icon" aria-label="Tiene notas" />}
        {steps > 0 && (
          <span className="task-steps-count">
            <ListChecks size={14} className="task-icon" aria-label="Checklist" />
            {note.checklist.filter((s) => s.done).length}/{steps}
          </span>
        )}
        {note.image_path && <ImageIcon size={14} className="task-icon" aria-label="Tiene imagen" />}
        {note.type === 'investigar' && <span className="task-chip">Por investigar</span>}
      </span>
      {(details || flag || planned) && (
        <span className="task-sub">
          {details && <span>{details}</span>}
          {aside(true)}
        </span>
      )}
    </>
  );

  if (pick) {
    return (
      <button
        type="button"
        className={cx('task-row is-picking', done && 'is-done', pick.selected && 'is-picked')}
        aria-pressed={pick.selected}
        aria-label={`Seleccionar: ${title}`}
        onClick={pick.onToggle}
      >
        <span className="task-check" aria-hidden>
          <span className="task-box">{done && <Check size={14} strokeWidth={3} />}</span>
        </span>
        <span className="task-main">{content}</span>
        {aside(false)}
        <span className="task-pick" aria-hidden>
          {pick.selected && <Check size={14} strokeWidth={3} />}
        </span>
      </button>
    );
  }

  return (
    <div className={cx('task-row', done && 'is-done', leaving && 'is-leaving', drag && 'is-draggable')} {...drag}>
      <button type="button" className="task-check" aria-pressed={done} aria-label={`${done ? 'Marcar pendiente' : 'Marcar hecha'}: ${title}`} onClick={() => actions.onToggle(note)}>
        <span className="task-box">{done && <Check size={14} strokeWidth={3} aria-hidden />}</span>
      </button>
      <button type="button" className="task-main" onClick={() => actions.onOpen(note)}>
        {content}
      </button>
      {aside(false)}
      <Menu
        items={rowMenu(note, done, now, actions)}
        trigger={
          <button type="button" className="task-more" aria-label={`Opciones: ${title}`}>
            <MoreHorizontal size={18} aria-hidden />
          </button>
        }
      />
    </div>
  );
}
