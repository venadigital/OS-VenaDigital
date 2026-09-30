import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/data/ApiContext';
import { qk } from '@/data/hooks';
import type { LinkPreview, NoteInput, NoteType } from '@/data/types';
import { useToast } from '@/components/Toast';
import { domainOf } from '@/lib/format';

export const NOTE_TYPES: { value: NoteType; label: string; tint: string; dot: string }[] = [
  { value: 'hacer', label: 'Por hacer', tint: 'var(--note-hacer)', dot: '#eda100' },
  { value: 'investigar', label: 'Por investigar', tint: 'var(--note-investigar)', dot: '#2a78d6' },
  { value: 'link', label: 'Link', tint: 'var(--note-link)', dot: 'var(--color-ink-3)' },
  { value: 'nota', label: 'Nota', tint: 'var(--note-nota)', dot: '#1baf7a' },
  { value: 'inspiracion', label: 'Inspiración', tint: 'var(--note-inspiracion)', dot: '#e87ba4' },
];

export const typeMeta = (t: NoteType) => NOTE_TYPES.find((x) => x.value === t) ?? NOTE_TYPES[3];

const URL_RE = /^https?:\/\/\S+$/i;
export const isUrl = (s: string) => URL_RE.test(s.trim());

/** A URL anywhere in the text (the first one), and the text around it as the comment. */
export function splitLink(text: string): { url: string; comment: string } | null {
  const m = /https?:\/\/[^\s]+/i.exec(text);
  if (!m) return null;
  const url = m[0].replace(/[.,;:)\]]+$/, '');
  const comment = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { url, comment };
}

/** The value once it has stopped changing for `ms`. */
export function useSettled<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Site/title/image of a URL, kept for the session so saving doesn't fetch it twice. */
export function useLinkPreview(url: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api.linkPreview(url!).catch(() => ({}) as LinkPreview),
    enabled: Boolean(url),
    staleTime: Infinity,
  });
}

/** Fills link fields for a URL (title/description/image when the server can fetch them). */
export async function linkFields(api: ReturnType<typeof useApi>, url: string, known?: LinkPreview): Promise<NoteInput> {
  const preview = known ?? (await api.linkPreview(url).catch(() => ({}) as LinkPreview));
  return {
    url,
    link_site: preview.site ?? domainOf(url),
    link_title: preview.title || null,
    link_description: preview.description || null,
    link_image: preview.image || null,
  };
}

export type Capture = {
  text: string;
  type: NoteType;
  image?: File | null;
  /** The URL found in the text, when it should become a link note. */
  link?: { url: string; preview?: LinkPreview } | null;
};

/** Saves what the capture bar holds as a note. */
export function useQuickCapture() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  return async ({ text, type, image, link }: Capture) => {
    const value = text.trim();
    if (!value && !image) return false;
    try {
      if (link) {
        const body = splitLink(value)?.comment ?? '';
        await api.createNote({ type: 'link', body, ...(await linkFields(api, link.url, link.preview)) });
      } else {
        const image_path = image ? await api.uploadNoteImage(image) : undefined;
        await api.createNote({ type: type !== 'link' ? type : 'nota', body: value, ...(image_path ? { image_path } : {}) });
      }
      await qc.invalidateQueries({ queryKey: qk.notes });
      toast('Guardado en Notas');
      return true;
    } catch (err) {
      toast(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return false;
    }
  };
}
