import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CornerDownLeft, ImagePlus, NotebookPen, Pin, Plus, Search, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, cx, Dialog, Dot, Empty, Field, Input, Segmented, Skeleton, Textarea } from '@/components/ui';
import { norm } from '@/lib/text';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useNoteImages, useNotes } from '@/data/hooks';
import type { Note, NoteInput, NoteType } from '@/data/types';
import { useToast } from '@/components/Toast';
import { NoteCard } from './NoteCard';
import { isUrl, linkFields, NOTE_TYPES, typeMeta, useQuickCapture } from './model';

type Filter = 'all' | NoteType;


export function NotasPage() {
  const notesQ = useNotes();
  const [filter, setFilter] = useState<Filter>(() => new URLSearchParams(window.location.search).get('pendientes') ? 'hacer' : 'all');
  const [status, setStatus] = useState<'all' | 'pending' | 'done'>(() => new URLSearchParams(window.location.search).get('pendientes') ? 'pending' : 'all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [params, setParams] = useSearchParams();
  const notes = notesQ.data ?? [];

  useEffect(() => {
    if (params.get('nueva')) {
      setEditing('new');
      setParams({}, { replace: true });
    }
    const id = params.get('nota');
    if (id && notes.length) {
      const n = notes.find((x) => x.id === id);
      if (n) setEditing(n);
      setParams({}, { replace: true });
    }
  }, [params, notes, setParams]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notes.length };
    for (const n of notes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [notes]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return notes.filter(
      (n) =>
        (filter === 'all' || n.type === filter) &&
        (status === 'all' || (n.type === 'hacer' && n.done === (status === 'done'))) &&
        (!q || [n.body, n.link_title, n.link_description, n.url, n.link_site].some((s) => s && norm(s).includes(q))),
    );
  }, [notes, filter, query, status]);

  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);
  const imagePaths = useMemo(() => notes.map((n) => n.image_path).filter((p): p is string => Boolean(p)), [notes]);
  const images = useNoteImages(imagePaths).data ?? {};

  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');
  const actions = {
    onEdit: (n: Note) => setEditing(n),
    onTogglePin: (n: Note) => update.mutate({ id: n.id, patch: { pinned: !n.pinned } }),
    onToggleDone: (n: Note) => update.mutate({ id: n.id, patch: { done: !n.done } }),
    onDelete: (n: Note) => confirm('¿Borrar esta nota?') && remove.mutate(n.id),
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`}
        title="Notas"
        right={
          <>
            <label className="flex h-[34px] w-full items-center gap-2 rounded-lg bg-fill px-2.5 text-ink-3 sm:w-60">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en notas"
                aria-label="Buscar en notas"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
              />
              {query && (
                <button type="button" aria-label="Limpiar" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />} onClick={() => setEditing('new')}>
              Nueva nota
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <CaptureBar defaultType={filter === 'all' ? 'nota' : filter} />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Chip on={filter === 'all'} onClick={() => { setFilter('all'); setStatus('all'); }} label="Todas" count={counts.all} />
          {NOTE_TYPES.map((t) => (
            <Chip key={t.value} on={filter === t.value} onClick={() => {setFilter(t.value); if(t.value !== 'hacer') setStatus('all');}} label={t.label} count={counts[t.value] ?? 0} dot={t.dot} />
          ))}
        </div>
        <div className="collection-toolbar notes-status">
          <Segmented value={status} onChange={value => {setStatus(value); if(value !== 'all') setFilter('hacer');}} options={[{value: 'all', label: 'Todo'}, {value: 'pending', label: 'Pendientes'}, {value: 'done', label: 'Hechas'}]} />
          <span role="status" className="result-count">{visible.length} de {notes.length} notas</span>
          {(query || filter !== 'all' || status !== 'all') && <Button variant="ghost" onClick={() => {setQuery(''); setFilter('all'); setStatus('all');}}>Limpiar filtros</Button>}
        </div>
      </div>

      {notesQ.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty icon={<NotebookPen size={28} />} title={notes.length ? 'Nada coincide' : 'Tu muro está vacío'}>
          {notes.length
            ? 'Prueba con otra búsqueda o filtro.'
            : 'Escribe arriba una idea, un pendiente o pega un link. Se guarda como un post-it.'}
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

      <NoteDialog note={editing} defaultType={filter === 'all' ? 'nota' : filter} onClose={() => setEditing(null)} imageUrl={editing && editing !== 'new' && editing.image_path ? images[editing.image_path] : undefined} />
    </Page>
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

export function CaptureBar({ defaultType = 'nota', placeholder }: { defaultType?: NoteType; placeholder?: string }) {
  const [text, setText] = useState('');
  const [type, setType] = useState<NoteType>(defaultType);
  const [busy, setBusy] = useState(false);
  const capture = useQuickCapture();
  useEffect(() => setType(defaultType), [defaultType]);
  const link = isUrl(text);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (await capture(text, type)) setText('');
    } finally { setBusy(false); }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="capture-bar flex h-12 items-center gap-3 rounded-xl border border-line bg-plane pr-2 pl-4 focus-within:border-line-2 focus-within:bg-surface"
    >
      <span className="capture-icon"><Plus size={19} /></span>
      <input
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? 'Escribe algo, pega un link o anota un pendiente…'}
        className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-4"
        aria-label="Captura rápida"
      />
      <div className="capture-type flex items-center gap-2">
        {link ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Dot color={typeMeta('link').dot} size={7} /> Link
          </span>
        ) : (
          <select
            value={type}
            onChange={(e) => setType(e.target.value as NoteType)}
            className="h-7 rounded-lg border border-line-2 bg-surface px-2 text-[12.5px] font-medium text-ink-2 outline-none"
            aria-label="Tipo de nota"
          >
            {NOTE_TYPES.filter((t) => t.value !== 'link').map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <button
        type="submit"
        disabled={!text.trim() || busy}
        className="capture-submit flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-3 disabled:opacity-50"
        aria-label="Guardar"
      >
        <span className="flex h-5 w-6 items-center justify-center rounded-[5px] border border-line-2 bg-surface">
          <CornerDownLeft size={12} className="text-ink-2" />
        </span>
        <span>{busy ? 'Guardando…' : 'Guardar'}</span>
      </button>
    </form>
  );
}

function NoteDialog({ note, onClose, imageUrl, defaultType }: { note: Note | 'new' | null; onClose: () => void; imageUrl?: string; defaultType: NoteType }) {
  const api = useApi();
  const toast = useToast();
  const isNew = note === 'new';
  const [type, setType] = useState<NoteType>('nota');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [due, setDue] = useState('');
  const [pinned, setPinned] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!note) return;
    const n = note === 'new' ? null : note;
    setType(n?.type ?? defaultType);
    setBody(n?.body ?? '');
    setUrl(n?.url ?? '');
    setLinkTitle(n?.link_title ?? '');
    setDue(n?.due_date ?? '');
    setPinned(n?.pinned ?? false);
    setFile(null);
    setRemoveImage(false);
  }, [note, defaultType]);

  const save = useApiMutation(
    async (api2, _: void) => {
      let patch: NoteInput = { type, body: body.trim(), pinned, due_date: type === 'hacer' && due ? due : null };
      if (type === 'link') {
        const clean = url.trim();
        if (!isUrl(clean)) throw new Error('El link debe empezar por http:// o https://');
        const existing = note !== 'new' && note ? note : null;
        const fields = existing && existing.url === clean ? {} : await linkFields(api2, clean);
        patch = { ...patch, ...fields, url: clean, link_title: linkTitle.trim() || (fields.link_title ?? existing?.link_title ?? null) };
      } else {
        patch = { ...patch, url: null };
      }
      if (file) patch.image_path = await api2.uploadNoteImage(file);
      else if (removeImage) patch.image_path = null;
      if (note === 'new') await api2.createNote(patch);
      else if (note) await api2.updateNote(note.id, patch);
    },
    [qk.notes],
  );

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const canSave = type === 'link' ? isUrl(url) : Boolean(body.trim() || file);
  const existingImage = !isNew && note && note.image_path && !removeImage ? imageUrl : undefined;

  return (
    <Dialog
      open={Boolean(note)}
      onClose={onClose}
      title={isNew ? 'Nueva nota' : 'Editar nota'}
      width={500}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Fijar arriba
          </label>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {NOTE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
              type === t.value ? 'border-ink bg-ink text-page' : 'border-line-2 text-ink-2 hover:bg-plane',
            )}
          >
            <Dot color={t.dot} size={7} />
            {t.label}
          </button>
        ))}
      </div>
      {type === 'link' && (
        <>
          <Field label="Link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" autoFocus={isNew} />
          </Field>
          <Field label="Título" hint="Si lo dejas vacío, se usa el título de la página.">
            <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
          </Field>
        </>
      )}
      <Field label={type === 'link' ? 'Comentario (opcional)' : 'Nota'}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={type === 'link' ? 2 : 5}
          autoFocus={isNew && type !== 'link'}
          placeholder={type === 'hacer' ? '¿Qué hay que hacer?' : type === 'investigar' ? '¿Qué quieres investigar?' : 'Escribe…'}
        />
      </Field>
      {type === 'hacer' && (
        <Field label="Para cuándo (opcional)">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      )}
      {type !== 'link' && (
        <div className="flex flex-col gap-2">
          {(existingImage || file) && (
            <div className="relative">
              <img src={preview ?? existingImage} alt="" className="max-h-56 w-full rounded-[10px] object-cover" />
              <button
                type="button"
                className="absolute top-2 right-2 rounded-full bg-overlay/90 p-1.5 text-ink-2 shadow"
                aria-label="Quitar imagen"
                onClick={() => {
                  setFile(null);
                  setRemoveImage(true);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 5 * 1024 * 1024) {
                toast('La imagen pesa más de 5 MB', 'error');
                return;
              }
              setFile(f);
              setRemoveImage(false);
            }}
          />
          <Button variant="ghost" size="sm" className="self-start" icon={<ImagePlus size={15} />} onClick={() => fileRef.current?.click()}>
            {existingImage || file ? 'Cambiar imagen' : 'Agregar imagen'}
          </Button>
        </div>
      )}
      {api.mode === 'demo' && <p className="text-xs text-ink-3">Modo demo: los cambios se pierden al recargar.</p>}
    </Dialog>
  );
}
