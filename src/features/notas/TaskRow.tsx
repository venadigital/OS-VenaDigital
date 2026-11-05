import { Archive, Check, Flag, Image as ImageIcon, Layers, LayoutGrid, ListChecks, MoreHorizontal, Pin, PinOff, Star, Text, Trash2 } from 'lucide-react';
import { cx, Menu, type MenuItem } from '@/components/ui';
import type { Note, NoteInput } from '@/data/types';
import { relativeDay } from '@/lib/format';
import { dayKey } from '@/lib/time';
import { carriedLabel, completedAt, deadlineLabel, taskNotes, taskTitle, type TaskView, whenBucket, whenDate } from './tasks';

export type TaskActions = {
  onToggle: (n: Note) => void;
  onOpen: (n: Note) => void;
  onPatch: (n: Note, patch: NoteInput) => void;
  onDelete: (n: Note) => void;
};

function rowMenu(note: Note, view: TaskView, now: Date, { onPatch, onDelete }: TaskActions): MenuItem[] {
  const remove: MenuItem = { label: 'Borrar', icon: <Trash2 size={14} />, danger: true, onSelect: () => onDelete(note) };
  if (view === 'registro') return [remove];
  const move: MenuItem[] = [];
  if (view !== 'hoy') move.push({ label: 'Para hoy', icon: <Star size={14} />, onSelect: () => onPatch(note, whenDate(dayKey(now))) });
  if (view !== 'cuando') move.push({ label: 'Cuando sea', icon: <Layers size={14} />, onSelect: () => onPatch(note, whenBucket('cuando_sea')) });
  if (view !== 'algun') move.push({ label: 'Algún día', icon: <Archive size={14} />, onSelect: () => onPatch(note, whenBucket('algun_dia')) });
  return [
    ...move,
    { label: note.pinned ? 'Desfijar' : 'Fijar arriba', icon: note.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => onPatch(note, { pinned: !note.pinned }) },
    { label: 'Mover al muro', icon: <LayoutGrid size={14} />, onSelect: () => onPatch(note, { type: 'nota' }) },
    remove,
  ];
}

export function TaskRow({ note, done, leaving, view, now, actions }: { note: Note; done: boolean; leaving: boolean; view: TaskView; now: Date; actions: TaskActions }) {
  const title = taskTitle(note.body) || 'Sin título';
  const steps = note.checklist.length;
  const flag = note.deadline && !done ? deadlineLabel(note.deadline, now) : null;
  const detail = view === 'registro' ? relativeDay(new Date(completedAt(note)), now) : view === 'hoy' ? carriedLabel(note, now) : null;
  const flagNode = flag && (
    <>
      <Flag size={13} aria-hidden />
      {flag.text}
    </>
  );

  return (
    <div className={cx('task-row', done && 'is-done', leaving && 'is-leaving')}>
      <button type="button" className="task-check" aria-pressed={done} aria-label={`${done ? 'Marcar pendiente' : 'Marcar hecha'}: ${title}`} onClick={() => actions.onToggle(note)}>
        <span className="task-box">{done && <Check size={14} strokeWidth={3} aria-hidden />}</span>
      </button>
      <button type="button" className="task-main" onClick={() => actions.onOpen(note)}>
        <span className="task-line">
          <span className="task-title">{title}</span>
          {note.pinned && view !== 'registro' && <Pin size={13} className="task-icon" aria-label="Fijada" />}
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
        {(detail || flag) && (
          <span className="task-sub">
            {detail && <span>{detail}</span>}
            {flag && <span className={cx('task-flag task-flag-inline', flag.late && 'is-late')}>{flagNode}</span>}
          </span>
        )}
      </button>
      {flag && <span className={cx('task-flag task-flag-side', flag.late && 'is-late')}>{flagNode}</span>}
      <Menu
        items={rowMenu(note, view, now, actions)}
        trigger={
          <button type="button" className="task-more" aria-label={`Opciones: ${title}`}>
            <MoreHorizontal size={18} aria-hidden />
          </button>
        }
      />
    </div>
  );
}
