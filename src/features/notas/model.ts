import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/data/ApiContext';
import { qk } from '@/data/hooks';
import type { NoteInput, NoteType } from '@/data/types';
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

/** Fills link fields for a URL (title/description/image when the server can fetch them). */
export async function linkFields(api: ReturnType<typeof useApi>, url: string): Promise<NoteInput> {
  const preview = await api.linkPreview(url).catch(() => ({}) as Awaited<ReturnType<typeof api.linkPreview>>);
  return {
    url,
    link_site: preview.site ?? domainOf(url),
    link_title: preview.title || null,
    link_description: preview.description || null,
    link_image: preview.image || null,
  };
}

/** Saves free text (or a pasted URL) as a note. */
export function useQuickCapture() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  return async (text: string, type?: NoteType) => {
    const value = text.trim();
    if (!value) return false;
    try {
      if (isUrl(value)) {
        await api.createNote({ type: 'link', body: '', ...(await linkFields(api, value)) });
      } else {
        await api.createNote({ type: type && type !== 'link' ? type : 'nota', body: value });
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
