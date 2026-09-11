import { Circle, CircleCheck, ExternalLink, Link2, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Note } from '@/data/types';
import { cx, Dot, Menu } from '@/components/ui';
import { relativeDay } from '@/lib/format';
import { fromDayKey } from '@/lib/time';
import { typeMeta } from './model';

export type NoteActions = {
  onEdit?: (n: Note) => void;
  onTogglePin?: (n: Note) => void;
  onToggleDone?: (n: Note) => void;
  onDelete?: (n: Note) => void;
};

function PageSkeleton() {
  return (
    <div className="flex h-[88px] flex-col gap-[7px] overflow-hidden rounded-[10px] bg-fill px-3.5 py-3">
      <div className="flex gap-[5px]">
        <span className="h-1.5 w-1.5 rounded-full bg-bar" />
        <span className="h-1.5 w-1.5 rounded-full bg-bar" />
        <span className="h-1.5 w-1.5 rounded-full bg-bar" />
      </div>
      <div className="h-[9px] w-[62%] rounded-[3px] bg-bar" />
      <div className="h-[5px] w-[88%] rounded-[3px] bg-line-2" />
      <div className="h-[5px] w-[76%] rounded-[3px] bg-line-2" />
    </div>
  );
}

export function NoteCard({ note, imageUrl, compact, ...actions }: { note: Note; imageUrl?: string; compact?: boolean } & NoteActions) {
  const t = typeMeta(note.type);
  const created = new Date(note.created_at);
  const due = note.due_date ? fromDayKey(note.due_date) : null;
  const isQuote = note.type === 'inspiracion' && !note.image_path && note.body.length <= 60;

  const menu = (
    <Menu
      items={[
        ...(actions.onEdit ? [{ label: 'Editar', icon: <Pencil size={14} />, onSelect: () => actions.onEdit!(note) }] : []),
        ...(actions.onTogglePin
          ? [{ label: note.pinned ? 'Desfijar' : 'Fijar arriba', icon: note.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => actions.onTogglePin!(note) }]
          : []),
        ...(note.url ? [{ label: 'Abrir link', icon: <ExternalLink size={14} />, onSelect: () => window.open(note.url!, '_blank', 'noopener') }] : []),
        ...(actions.onDelete ? [{ label: 'Borrar', icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.onDelete!(note) }] : []),
      ]}
    />
  );

  return (
    <article
      className={cx(
        'group relative flex flex-col gap-2.5 rounded-[14px] border',
        compact ? 'px-3.5 py-3' : 'px-4 py-3.5',
        note.type === 'link' ? 'border-line' : 'border-[var(--note-edge)]',
        note.done && 'opacity-60',
      )}
      style={{ background: t.tint }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-ink-2">
          <Dot color={t.dot} size={7} />
          <span className="truncate">{t.label}</span>
        </span>
        <div className="-my-1.5 -mr-1.5 flex items-center gap-0.5">
          {note.pinned && !compact && <Pin size={14} className="text-ink-3" />}
          <div className={cx(!compact && 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100')}>{menu}</div>
        </div>
      </div>

      {note.type === 'link' && note.url ? (
        <a href={note.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2.5">
          {!compact &&
            (note.link_image ? (
              <img src={note.link_image} alt="" loading="lazy" className="h-[110px] w-full rounded-[10px] object-cover" referrerPolicy="no-referrer" />
            ) : (
              <PageSkeleton />
            ))}
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              <Link2 size={13} strokeWidth={2} />
              {note.link_site}
            </span>
            <span className="text-[14px] leading-[19px] font-semibold break-words text-ink">{note.link_title || note.url}</span>
            {note.link_description && <span className="line-clamp-3 text-[13px] leading-[18px] text-ink-2">{note.link_description}</span>}
            {note.body && <span className="text-[13px] leading-[18px] text-ink-2">{note.body}</span>}
          </span>
        </a>
      ) : (
        <>
          {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="max-h-72 w-full rounded-[10px] object-cover" />}
          {note.body && (
            <p
              className={cx(
                'break-words whitespace-pre-line text-ink',
                isQuote ? 'text-[21px] leading-[26px] font-bold tracking-[-0.015em] text-balance' : 'text-[14px] leading-5 text-pretty',
                note.done && 'line-through decoration-ink-4',
                compact && 'line-clamp-6',
              )}
            >
              {note.body}
            </p>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
        <span>{due ? `Para el ${format(due, "EEEE d", { locale: es })}` : relativeDay(created)}</span>
        {note.type === 'hacer' && actions.onToggleDone && (
          <button
            type="button"
            aria-label={note.done ? 'Marcar pendiente' : 'Marcar hecha'}
            title={note.done ? 'Marcar pendiente' : 'Marcar hecha'}
            onClick={() => actions.onToggleDone!(note)}
            className="-m-1.5 p-1.5 text-ink-4 hover:text-ink-2"
          >
            {note.done ? <CircleCheck size={16} className="text-good" /> : <Circle size={16} />}
          </button>
        )}
      </div>
    </article>
  );
}
