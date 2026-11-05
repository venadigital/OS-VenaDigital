import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Globe, ImagePlus, Plus, X } from 'lucide-react';
import { cx, Dot } from '@/components/ui';
import { useToast } from '@/components/Toast';
import type { NoteType } from '@/data/types';
import { domainOf } from '@/lib/format';
import { acceptImage, IMAGE_TYPES, NOTE_TYPES, splitLink, typeMeta, useLinkPreview, useQuickCapture, useSettled, type NoteDraft } from './model';

export function CaptureBar({
  defaultType = 'nota',
  types,
  placeholder,
  onMore,
}: {
  defaultType?: NoteType;
  /** The kinds offered in the selector; every kind but Link when left out. */
  types?: NoteType[];
  placeholder?: string;
  onMore?: (draft: NoteDraft) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [type, setType] = useState<NoteType>(defaultType);
  const [image, setImage] = useState<File | null>(null);
  // Set when the × of the link card is pressed: the URL stays as plain text.
  const [asText, setAsText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const capture = useQuickCapture();
  useEffect(() => setType(defaultType), [defaultType]);

  // A link note carries no image, so a URL only counts while nothing is attached.
  const found = image ? null : splitLink(text);
  const url = found && found.url !== asText ? found.url : null;
  const preview = useLinkPreview(useSettled(url));
  const thumb = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (thumb) URL.revokeObjectURL(thumb);
  }, [thumb]);

  const reset = () => {
    setText('');
    setImage(null);
    setAsText(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const filled = Boolean(text.trim() || image);

  const submit = async () => {
    if (!filled || busy) return;
    setBusy(true);
    try {
      const link = url ? { url, preview: preview.data && (preview.data.title || preview.data.site) ? preview.data : undefined } : null;
      if (await capture({ text, type, image, link })) reset();
    } finally { setBusy(false); }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="capture-bar flex flex-col rounded-xl border border-line bg-plane focus-within:border-line-2 focus-within:bg-surface"
    >
      <div className="capture-row flex items-center gap-3">
        <span className="capture-icon"><Plus size={19} /></span>
        <input
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={image ? 'Escribe algo (opcional)…' : (placeholder ?? 'Escribe algo, pega un link o anota un pendiente…')}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-4"
          aria-label="Captura rápida"
        />
        <div className="capture-type flex items-center gap-2">
          {url ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Dot color={typeMeta('link').dot} size={7} /> Link
            </span>
          ) : (
            <>
              <input ref={fileRef} type="file" accept={IMAGE_TYPES} className="hidden" onChange={(e) => setImage(acceptImage(e.target.files?.[0], toast) ?? image)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={image ? 'Cambiar imagen' : 'Agregar imagen'}
                title={image ? 'Cambiar imagen' : 'Agregar imagen'}
                className={cx('capture-image flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-fill hover:text-ink', image && 'is-set')}
              >
                <ImagePlus size={17} />
              </button>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NoteType)}
                className="h-7 rounded-lg border border-line-2 bg-surface px-2 text-[12.5px] font-medium text-ink-2 outline-none"
                aria-label="Tipo de nota"
              >
                {NOTE_TYPES.filter((t) => (types ? types.includes(t.value) : t.value !== 'link')).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={!filled || busy}
          className="capture-submit flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-3 disabled:opacity-50"
          aria-label="Guardar"
        >
          <span className="flex h-5 w-6 items-center justify-center rounded-[5px] border border-line-2 bg-surface">
            <CornerDownLeft size={12} className="text-ink-2" />
          </span>
          <span>{busy ? 'Guardando…' : 'Guardar'}</span>
        </button>
      </div>
      {(url || image || (onMore && filled)) && (
        <div className="capture-extra flex items-start gap-3">
          {url && (
            <div className="flex min-w-0 max-w-[420px] items-center gap-2.5 rounded-[10px] border border-line bg-surface py-1.5 pr-1.5 pl-2">
              {preview.data?.image ? (
                <img src={preview.data.image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-[7px] object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-fill text-ink-3"><Globe size={15} /></span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-ink">{preview.data?.title || domainOf(url)}</span>
                <span className="truncate text-xs text-ink-3">{preview.data?.title ? (preview.data.site || domainOf(url)) : url}</span>
              </span>
              <button type="button" onClick={() => setAsText(url)} aria-label="Guardar como texto" title="Guardar como texto" className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-ink">
                <X size={13} />
              </button>
            </div>
          )}
          {image && thumb && (
            <div className="relative shrink-0">
              <img src={thumb} alt="" className="h-16 w-16 rounded-[10px] object-cover" />
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                aria-label="Quitar imagen"
                className="absolute -top-1.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-sm"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {image && <span className="truncate pt-1 text-xs text-ink-3">{image.name}</span>}
          {onMore && filled && (
            <button
              type="button"
              onClick={() => {
                onMore({ draft: true, type: url ? 'link' : type, body: url ? (found?.comment ?? '') : text, url: url ?? undefined, image });
                reset();
              }}
              className="capture-more ml-auto shrink-0 self-center text-xs text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              Más opciones
            </button>
          )}
        </div>
      )}
    </form>
  );
}
