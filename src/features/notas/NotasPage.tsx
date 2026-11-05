import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, CalendarDays, Inbox, Layers, LayoutGrid, NotebookPen, Pin, Plus, Search, SquareCheck, Star, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, cx, Dot, Empty, Skeleton } from '@/components/ui';
import { norm } from '@/lib/text';
import { dayKey } from '@/lib/time';
import { qk, useApiMutation, useNoteImages, useNotes, useNow } from '@/data/hooks';
import type { Note, NoteInput, NoteType } from '@/data/types';
import { useRunningTimer } from '@/features/tiempo/model';
import { CaptureBar } from './CaptureBar';
import { NoteCard } from './NoteCard';
import { isDraft, NoteDialog } from './NoteDialog';
import { NotasBack } from './NotasBack';
import { NOTE_TYPES, type NoteDraft } from './model';
import { TaskDialog, type TaskDraft } from './TaskDialog';
import { TaskPanel } from './TaskPanel';
import { defaultWhen, isTask, noteView, type NotasView, parseView, TASK_VIEWS, type TaskView, viewCounts, type ViewCounts } from './tasks';

const VIEW_ICONS: Record<TaskView, { icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; tint: string }> = {
  entrada: { icon: Inbox, tint: 'var(--note-link)' },
  hoy: { icon: Star, tint: 'var(--note-hacer)' },
  proximo: { icon: CalendarDays, tint: 'var(--note-investigar)' },
  cuando: { icon: Layers, tint: 'var(--note-investigar)' },
  algun: { icon: Archive, tint: 'var(--note-inspiracion)' },
  registro: { icon: SquareCheck, tint: 'var(--note-link)' },
};

export function NotasPage() {
  const notesQ = useNotes();
  const notes = useMemo(() => notesQ.data ?? [], [notesQ.data]);
  const now = useNow(60_000);
  const today = dayKey(now);
  const { timer } = useRunningTimer();
  const [params, setParams] = useSearchParams();
  const chosen = parseView(params.get('vista'));
  // Beside the list of views there is always a view open; on a phone the list is its own screen.
  const view: NotasView = chosen ?? 'hoy';
  const [editing, setEditing] = useState<Note | NoteDraft | null>(null);
  const [task, setTask] = useState<Note | TaskDraft | null>(null);

  const open = (n: Note) => (isTask(n) ? setTask(n) : setEditing(n));

  // Links from Inicio and the search: `nueva` opens a blank form, `nota` opens that note where it lives.
  useEffect(() => {
    const nueva = params.get('nueva');
    const id = params.get('nota');
    if (!nueva && !id) return;
    const next = new URLSearchParams(params);
    next.delete('nueva');
    if (nueva === 'tarea') {
      setTask({ draft: true, when: defaultWhen(chosen ?? 'entrada', today) });
    } else if (nueva) {
      setEditing({ draft: true, type: 'nota', body: '' });
      next.set('vista', 'muro');
    }
    if (id) {
      if (!notesQ.data) return;
      const n = notes.find((x) => x.id === id);
      if (n) {
        open(n);
        next.set('vista', noteView(n, today));
      }
      next.delete('nota');
    }
    setParams(next, { replace: true });
  }, [params, setParams, notes, notesQ.data, chosen, today]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, chosen]);

  const counts = useMemo(() => viewCounts(notes, today), [notes, today]);
  const imagePaths = useMemo(() => notes.map((n) => n.image_path).filter((p): p is string => Boolean(p)), [notes]);
  const images = useNoteImages(imagePaths).data ?? {};

  return (
    <Page className="notas-page">
      <div className="notas-layout" data-open={Boolean(chosen)}>
        <NotasNav view={view} counts={counts} />
        <div className="notas-content">
          {view === 'muro' ? (
            <MuroView notes={notes} loading={notesQ.isLoading} images={images} onEdit={setEditing} />
          ) : (
            <TaskPanel view={view} notes={notes} now={now} loading={notesQ.isLoading} onOpen={open} />
          )}
        </div>
      </div>

      {view !== 'muro' && (
        <button type="button" className={cx('notas-fab', timer && 'has-timer')} aria-label="Nueva tarea" onClick={() => setTask({ draft: true, when: defaultWhen(view, today) })}>
          <Plus size={24} aria-hidden />
        </button>
      )}

      <TaskDialog task={task} imageUrl={task && !('draft' in task) && task.image_path ? images[task.image_path] : undefined} onClose={() => setTask(null)} />
      <NoteDialog note={editing} onClose={() => setEditing(null)} imageUrl={editing && !isDraft(editing) && editing.image_path ? images[editing.image_path] : undefined} />
    </Page>
  );
}

function NotasNav({ view, counts }: { view: NotasView; counts: ViewCounts }) {
  return (
    <aside className="notas-nav">
      <h1 className="notas-nav-title page-title">Notas</h1>
      <nav aria-label="Vistas de Notas" className="notas-nav-list">
        {TASK_VIEWS.map((v) => {
          const { icon: Icon, tint } = VIEW_ICONS[v.id];
          const count = v.id === 'entrada' || v.id === 'hoy' ? counts[v.id] : 0;
          return (
            <Link key={v.id} to={`/notas?vista=${v.id}`} aria-current={view === v.id ? 'page' : undefined} className="notas-nav-link">
              <span className="notas-nav-tile" style={{ background: tint }}>
                <Icon size={15} aria-hidden />
              </span>
              <span className="flex-1">{v.label}</span>
              {v.id === 'hoy' && counts.late > 0 && (
                <span className="notas-nav-late" aria-label={`${counts.late} con fecha límite vencida`}>
                  {counts.late}
                </span>
              )}
              {count > 0 && <span className="notas-nav-count tnum">{count}</span>}
            </Link>
          );
        })}
      </nav>
      <Link to="/notas?vista=muro" aria-current={view === 'muro' ? 'page' : undefined} className="notas-nav-link notas-nav-wall">
        <span className="notas-nav-tile" style={{ background: 'var(--note-nota)' }}>
          <LayoutGrid size={15} aria-hidden />
        </span>
        <span className="flex-1">Muro</span>
        {counts.muro > 0 && <span className="notas-nav-count tnum">{counts.muro}</span>}
      </Link>
    </aside>
  );
}

type WallFilter = 'all' | NoteType;
const WALL_TYPES = NOTE_TYPES.filter((t) => !isTask({ type: t.value }));

function MuroView({ notes, loading, images, onEdit }: { notes: Note[]; loading: boolean; images: Record<string, string>; onEdit: (n: Note | NoteDraft) => void }) {
  const [filter, setFilter] = useState<WallFilter>('all');
  const [query, setQuery] = useState('');
  const wall = useMemo(() => notes.filter((n) => !isTask(n)), [notes]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: wall.length };
    for (const n of wall) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [wall]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return wall.filter(
      (n) =>
        (filter === 'all' || n.type === filter) &&
        (!q || [n.body, n.link_title, n.link_description, n.url, n.link_site].some((s) => s && norm(s).includes(q))),
    );
  }, [wall, filter, query]);

  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);

  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');
  const actions = {
    onEdit,
    onTogglePin: (n: Note) => update.mutate({ id: n.id, patch: { pinned: !n.pinned } }),
    onDelete: (n: Note) => confirm('¿Borrar esta nota?') && remove.mutate(n.id),
  };

  return (
    <>
      <NotasBack />
      <PageHeader
        title="Muro"
        right={
          <label className="flex h-[34px] w-full items-center gap-2 rounded-lg bg-fill px-2.5 text-ink-3 sm:w-60">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el muro"
              aria-label="Buscar en el muro"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
            />
            {query && (
              <button type="button" aria-label="Limpiar" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </label>
        }
      />

      <div className="flex flex-col gap-4">
        <CaptureBar defaultType={filter === 'inspiracion' ? 'inspiracion' : 'nota'} types={['nota', 'inspiracion']} placeholder="Escribe algo o pega un link…" onMore={onEdit} />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Chip on={filter === 'all'} onClick={() => setFilter('all')} label="Todas" count={counts.all} />
          {WALL_TYPES.map((t) => (
            <Chip key={t.value} on={filter === t.value} onClick={() => setFilter(t.value)} label={t.label} count={counts[t.value] ?? 0} dot={t.dot} />
          ))}
        </div>
        {(query || filter !== 'all') && (
          <div className="collection-toolbar">
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty icon={<NotebookPen size={28} />} title={wall.length ? 'Nada coincide' : 'Tu muro está vacío'}>
          {wall.length ? 'Prueba con otra búsqueda o filtro.' : 'Escribe arriba una idea o pega un link.'}
        </Empty>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                <Pin size={14} className="text-ink-3" />
                Fijadas
              </h2>
              <div className="masonry columns-1 sm:columns-2 lg:columns-3 2xl:columns-4">
                {pinned.map((n) => (
                  <NoteCard key={n.id} note={n} imageUrl={n.image_path ? images[n.image_path] : undefined} {...actions} />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && (
            <section className="flex flex-col gap-3">
              {pinned.length > 0 && <h2 className="text-[13px] font-semibold text-ink-2">Recientes</h2>}
              <div className="masonry columns-1 sm:columns-2 lg:columns-3 2xl:columns-4">
                {rest.map((n) => (
                  <NoteCard key={n.id} note={n} imageUrl={n.image_path ? images[n.image_path] : undefined} {...actions} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Chip({ on, onClick, label, count, dot }: { on: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'note-filter flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors md:h-[30px] md:px-3',
        on ? 'bg-ink font-semibold text-page' : 'bg-fill font-medium text-ink-2 hover:bg-fill-2',
      )}
    >
      {dot && <Dot color={dot} size={7} />}
      {label}
      <span className={cx('tnum', on ? 'text-page/65' : 'text-ink-3')}>{count}</span>
    </button>
  );
}
