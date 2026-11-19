import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Clock, Play, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Page } from '@/components/Shell';
import { Button, Empty, IconButton, Menu, Segmented, Skeleton } from '@/components/ui';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useScripts } from '@/data/hooks';
import type { Script, ScriptInput, ScriptPlatform } from '@/data/types';
import { useToast } from '@/components/Toast';
import { relativeDay } from '@/lib/format';
import { loadSettings, minSec, plainText, PLATFORM_LABEL, readingSeconds, scriptTitle, wordCount } from './model';
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
    const script = await createScript({ title: '', body: '', platform: filter === 'todos' ? 'instagram' : filter }).catch(() => null);
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
  const [platform, setPlatform] = useState(script.platform);
  // Older scripts lose their section lines the first time they are edited.
  const [body, setBody] = useState(() => plainText(script.body));
  const textRef = useRef<HTMLTextAreaElement>(null);

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

  // An empty script starts with the cursor in it.
  useEffect(() => {
    if (!body && window.matchMedia(WIDE).matches) textRef.current?.focus();
    // Only when the script opens.
  }, []);

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

      <div className="tp-doc">
        <AutoTextarea
          ref={textRef}
          className="tp-text"
          aria-label="Guion"
          placeholder="Escribe o pega el guion"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            change({ body: e.target.value });
          }}
        />
      </div>
    </>
  );
}

/** A textarea as tall as its text, so the script reads as one page. */
function AutoTextarea({ value, ref: outer, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);
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
