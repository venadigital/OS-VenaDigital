import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button, cx, Dialog, Dot, Field, Input, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation } from '@/data/hooks';
import type { Note, NoteInput, NoteType } from '@/data/types';
import { acceptImage, IMAGE_TYPES, isUrl, linkFields, NOTE_TYPES, type NoteDraft } from './model';

export const isDraft = (n: Note | NoteDraft | null): n is NoteDraft => Boolean(n && 'draft' in n);

export function NoteDialog({ note, onClose, imageUrl }: { note: Note | NoteDraft | null; onClose: () => void; imageUrl?: string }) {
  const api = useApi();
  const toast = useToast();
  const isNew = isDraft(note);
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
    const n = isDraft(note) ? null : note;
    setType(note.type);
    setBody(note.body);
    setUrl(note.url ?? '');
    setLinkTitle(n?.link_title ?? '');
    setDue(n?.due_date ?? '');
    setPinned(n?.pinned ?? false);
    setFile(isDraft(note) ? (note.image ?? null) : null);
    setRemoveImage(false);
  }, [note]);

  const save = useApiMutation(
    async (api2, _: void) => {
      let patch: NoteInput = { type, body: body.trim(), pinned, due_date: type === 'hacer' && due ? due : null };
      if (type === 'link') {
        const clean = url.trim();
        if (!isUrl(clean)) throw new Error('El link debe empezar por http:// o https://');
        const existing = note && !isDraft(note) ? note : null;
        const fields = existing && existing.url === clean ? {} : await linkFields(api2, clean);
        patch = { ...patch, ...fields, url: clean, link_title: linkTitle.trim() || (fields.link_title ?? existing?.link_title ?? null) };
      } else {
        patch = { ...patch, url: null };
      }
      if (file) patch.image_path = await api2.uploadNoteImage(file);
      else if (removeImage) patch.image_path = null;
      if (isDraft(note)) await api2.createNote(patch);
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
            accept={IMAGE_TYPES}
            className="hidden"
            onChange={(e) => {
              const f = acceptImage(e.target.files?.[0], toast);
              if (!f) return;
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
