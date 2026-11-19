import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Clock, Play, Plus, ScrollText, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Page } from '@/components/Shell';
import { Button, Empty, IconButton, Menu, Segmented, Skeleton } from '@/components/ui';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useScripts } from '@/data/hooks';
import type { Script, ScriptInput, ScriptPlatform } from '@/data/types';
import { useToast } from '@/components/Toast';
import { relativeDay } from '@/lib/format';
import {
  loadSettings,
  mergeSectionUp,
  minSec,
  NEW_SCRIPT_BODY,
  parseSections,
  PLATFORM_LABEL,
  readingSeconds,
  scriptTitle,
  serializeSections,
  wordCount,
  type Section,
} from './model';
import './teleprompter.css';

type Filter = 'todos' | ScriptPlatform;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
];
const PLATFORMS: { value: ScriptPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
];
/** Same width at which the list and the script stop fitting side by side (teleprompter.css). */
const WIDE = '(min-width: 1000px)';
const SAVE_DELAY = 700;

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function TeleprompterPage() {
  const scriptsQ = useScripts();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('todos');
  const wide = useWide();
  // The time each script takes follows the pace chosen on the reading screen.
  const wpm = useMemo(() => loadSettings().wpm, []);
  const create = useApiMutation((api, input: ScriptInput) => api.createScript(input), [qk.scripts], 'No se pudo crear el guion');
  const remove = useApiMutation((api, id: string) => api.deleteScript(id), [qk.scripts], 'No se pudo borrar');

  const scripts = useMemo(() => [...(scriptsQ.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [scriptsQ.data]);
  const shown = filter === 'todos' ? scripts : scripts.filter((s) => s.platform === filter);
  const chosenId = params.get('guion');
  // Beside the list there is always a script open; on a phone the list is its own screen.
  const chosen = scripts.find((s) => s.id === chosenId) ?? (wide ? shown[0] : undefined);

  const { mutateAsync: createScript } = create;
  const newScript = useCallback(async () => {
    const script = await createScript({ title: '', body: NEW_SCRIPT_BODY, platform: filter === 'todos' ? 'instagram' : filter }).catch(() => null);
    if (script) setParams({ guion: script.id });
  }, [createScript, filter, setParams]);

  // "Nuevo guion" from the search palette.
  const asked = useRef(false);
  useEffect(() => {
    if (!params.has('nuevo') || asked.current) return;
    asked.current = true;
    setParams({}, { replace: true });
    void newScript();
  }, [params, setParams, newScript]);

  const deleteScript = (s: Script) => {
    if (!confirm(`¿Borrar "${scriptTitle(s)}"? No se puede deshacer.`)) return;
    remove.mutate(s.id);
    setParams({}, { replace: true });
  };

  return (
    <Page className="tp-page">
      <div className="tp-layout" data-open={Boolean(chosenId)}>
        <aside className="tp-list">
          <div className="tp-list-head">
            <h1 className="tp-heading">Teleprompter</h1>
            <IconButton label="Nuevo guion" variant="bordered" size={40} className="!rounded-full" onClick={() => void newScript()} disabled={create.isPending}>
              <Plus size={18} />
            </IconButton>
          </div>
          <Segmented full options={FILTERS} value={filter} onChange={setFilter} />
          {scriptsQ.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[62px]" />
              <Skeleton className="h-[62px]" />
              <Skeleton className="h-[62px]" />
            </div>
          ) : (
            <nav aria-label="Guiones" className="tp-items">
              {shown.map((s) => (
                <Link key={s.id} to={`/teleprompter?guion=${s.id}`} aria-current={chosen?.id === s.id ? 'page' : undefined} className="tp-item">
                  <span className="tp-item-title">{scriptTitle(s)}</span>
                  <span className="tp-item-meta tnum">
                    <span>
                      {PLATFORM_LABEL[s.platform]} · {minSec(readingSeconds(s.body, wpm))}
                    </span>
                    <span>{relativeDay(new Date(s.updated_at))}</span>
                  </span>
                </Link>
              ))}
            </nav>
          )}
        </aside>
        <section className="tp-editor">
          {chosen ? (
            <Editor key={chosen.id} script={chosen} wpm={wpm} onDelete={() => deleteScript(chosen)} />
          ) : (
            !scriptsQ.isLoading && (
              <div className="tp-empty">
                <Empty
                  icon={<ScrollText size={26} strokeWidth={1.5} />}
                  title={scripts.length ? 'Sin guiones aquí' : 'Sin guiones'}
                  action={
                    <Button variant="primary" icon={<Plus size={16} />} onClick={() => void newScript()} disabled={create.isPending}>
                      Nuevo guion
                    </Button>
                  }
                />
              </div>
            )
          )}
        </section>
      </div>
    </Page>
  );
}

function Editor({ script, wpm, onDelete }: { script: Script; wpm: number; onDelete: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(script.title);
  const [platform, setPlatform] = useState(script.platform);
  const [sections, setSections] = useState(() => parseSections(script.body));
  const body = useMemo(() => serializeSections(sections), [sections]);
  const docRef = useRef<HTMLDivElement>(null);

  // What is typed shows in the list right away and is saved a moment after the last key.
  const pending = useRef<ScriptInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inCache = useCallback(
    (patch: ScriptInput, touched: boolean) =>
      qc.setQueryData<Script[]>(qk.scripts, (list) =>
        list?.map((s) => (s.id === script.id ? { ...s, ...patch, ...(touched ? { updated_at: new Date().toISOString() } : null) } : s)),
      ),
    [qc, script.id],
  );
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    try {
      await api.updateScript(script.id, patch);
      inCache(patch, false); // a refresh that crossed with the save may have brought the old text back
    } catch (err) {
      toast(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [api, script.id, inCache, toast]);
  const change = (patch: ScriptInput) => {
    pending.current = { ...pending.current, ...patch };
    inCache(patch, true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  // A script that has no title yet starts there.
  useEffect(() => {
    if (!script.title && window.matchMedia(WIDE).matches) docRef.current?.querySelector<HTMLTextAreaElement>('.tp-title-input')?.focus();
    // Only when the script opens.
  }, []);

  const editSections = (next: Section[]) => {
    setSections(next);
    change({ body: serializeSections(next) });
  };
  const patchSection = (i: number, patch: Partial<Section>) => editSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const focusText = (i: number) => docRef.current?.querySelectorAll<HTMLTextAreaElement>('.tp-text')[i]?.focus();
  const addSection = () => {
    editSections([...sections, { name: '', text: '' }]);
    // The new heading exists after this render.
    setTimeout(() => docRef.current?.querySelector<HTMLInputElement>('.tp-section:last-of-type .tp-section-name')?.focus(), 0);
  };

  const read = async () => {
    await flush();
    navigate(`/teleprompter/${script.id}/leer`);
  };

  return (
    <>
      <div className="tp-toolbar">
        <Link to="/teleprompter" className="tp-back">
          <ChevronLeft size={22} aria-hidden />
          Guiones
        </Link>
        <Segmented
          options={PLATFORMS}
          value={platform}
          onChange={(p) => {
            setPlatform(p);
            change({ platform: p });
          }}
        />
        <span className="tp-duration tnum">
          <Clock size={15} role="img" aria-label="Duración estimada" />
          {minSec(readingSeconds(body, wpm))}
        </span>
        <div className="tp-toolbar-end">
          <Menu items={[{ label: 'Borrar', danger: true, icon: <Trash2 size={15} />, onSelect: onDelete }]} />
          <Button variant="primary" icon={<Play size={14} fill="currentColor" />} onClick={() => void read()} disabled={wordCount(body) === 0}>
            Leer
          </Button>
        </div>
      </div>

      <div className="tp-doc" ref={docRef}>
        {/* A long title wraps instead of hiding its end. */}
        <AutoTextarea
          className="tp-title-input"
          aria-label="Título"
          placeholder="Sin título"
          value={title}
          maxLength={200}
          onChange={(e) => {
            const next = e.target.value.replace(/\s*\n\s*/g, ' ');
            setTitle(next);
            change({ title: next });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              focusText(0);
            }
          }}
        />
        {sections.map((s, i) => {
          // A script without headings is one plain text; its first heading appears with "Añadir sección".
          const plain = i === 0 && !s.name && sections.length === 1;
          return (
            <div key={i} className="tp-section">
              {!plain && (
                <div className="tp-section-head">
                  <input
                    className="tp-section-name"
                    aria-label="Nombre de la sección"
                    placeholder="Sección"
                    value={s.name}
                    maxLength={60}
                    onChange={(e) => patchSection(i, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusText(i);
                      }
                    }}
                  />
                  <IconButton label="Quitar sección" size={30} className="tp-section-remove" onClick={() => editSections(mergeSectionUp(sections, i))}>
                    <X size={15} />
                  </IconButton>
                </div>
              )}
              <AutoTextarea
                className="tp-text"
                aria-label={s.name ? `Texto de ${s.name}` : 'Texto'}
                placeholder="Escribe aquí"
                value={s.text}
                onChange={(e) => patchSection(i, { text: e.target.value })}
              />
            </div>
          );
        })}
        <button type="button" className="tp-add" onClick={addSection}>
          <Plus size={16} />
          Añadir sección
        </button>
      </div>
    </>
  );
}

/** A textarea as tall as its text, so the script reads as one page. */
function AutoTextarea({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(fit, [fit, value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
  return <textarea ref={ref} rows={1} value={value} {...rest} />;
}
