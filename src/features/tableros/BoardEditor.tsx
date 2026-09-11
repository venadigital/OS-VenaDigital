import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, Download, LoaderCircle, Shapes, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { convertToExcalidrawElements, Excalidraw, exportToBlob, getSceneVersion, serializeAsJSON } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useApi } from '@/data/ApiContext';
import { qk, useBoard } from '@/data/hooks';
import type { BoardScene } from '@/data/types';
import { Button, Menu } from '@/components/ui';
import { useToast } from '@/components/Toast';

type Elements = Parameters<NonNullable<ExcalidrawProps['onChange']>>[0];
type Status = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DELAY = 1200;
const THUMB_EVERY = 15_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export default function BoardEditor() {
  const { id = '' } = useParams();
  const board = useBoard(id);
  const navigate = useNavigate();

  if (board.isLoading) return <Centered>Abriendo tablero…</Centered>;
  if (board.error || !board.data)
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span>No encontramos este tablero.</span>
          <Button onClick={() => navigate('/tableros')}>Volver a Tableros</Button>
        </div>
      </Centered>
    );
  return <Editor key={board.data.id} id={board.data.id} name={board.data.name} scene={board.data.scene} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center text-[14px] text-ink-3">{children}</div>;
}

function Editor({ id, name: initialName, scene }: { id: string; name: string; scene: BoardScene }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<Status>('idle');
  const excali = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastVersion = useRef<number>(-1);
  const pending = useRef<{ elements: Elements; appState: AppState; files: BinaryFiles } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThumb = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);

  const initialData = useMemo(() => {
    const elements = scene.elements?.length ? scene.elements : scene.skeleton?.length ? convertToExcalidrawElements(scene.skeleton as never) : [];
    return {
      elements: elements as never,
      appState: { ...(scene.appState ?? {}), collaborators: new Map() } as never,
      files: (scene.files ?? {}) as never,
      scrollToContent: true,
    };
    // Only the first render matters: the canvas owns the scene afterwards.
  }, []);

  useEffect(() => {
    if (params.get('nuevo')) {
      nameRef.current?.select();
    }
  }, [params]);

  const makeThumbnail = useCallback(async (elements: Elements, appState: AppState, files: BinaryFiles) => {
    const visible = elements.filter((e) => !e.isDeleted);
    if (!visible.length) return null;
    const blob = await exportToBlob({
      elements: visible,
      appState: { ...appState, exportBackground: true, viewBackgroundColor: '#fcfcfb', exportWithDarkMode: false },
      files,
      mimeType: 'image/png',
      maxWidthOrHeight: 520,
      exportPadding: 24,
    });
    return blobToDataUrl(blob);
  }, []);

  const flush = useCallback(
    async (withThumbnail = false) => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      setStatus('saving');
      try {
        const json = JSON.parse(serializeAsJSON(p.elements, p.appState, p.files, 'database')) as BoardScene & { type?: string };
        const patch: { scene: BoardScene; thumbnail?: string | null } = {
          scene: { elements: json.elements, appState: json.appState, files: json.files },
        };
        if (withThumbnail || Date.now() - lastThumb.current > THUMB_EVERY) {
          lastThumb.current = Date.now();
          patch.thumbnail = await makeThumbnail(p.elements, p.appState, p.files).catch(() => undefined);
          if (patch.thumbnail === undefined) delete patch.thumbnail;
        }
        await api.updateBoard(id, patch);
        setStatus('saved');
        void qc.invalidateQueries({ queryKey: qk.boards });
      } catch (err) {
        setStatus('error');
        pending.current = pending.current ?? p;
        toast(`No se pudo guardar el tablero: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [api, id, makeThumbnail, qc, toast],
  );

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, appState, files) => {
      const version = getSceneVersion(elements);
      if (lastVersion.current === -1) {
        lastVersion.current = version; // initial render is not a change
        return;
      }
      if (version === lastVersion.current) return;
      lastVersion.current = version;
      pending.current = { elements, appState, files };
      setStatus('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  // Save what is pending when leaving the page or the app.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush(true);
    };
  }, [flush]);

  const saveName = async () => {
    const clean = name.trim() || 'Sin título';
    setName(clean);
    if (clean === initialName) return;
    try {
      await api.updateBoard(id, { name: clean });
      void qc.invalidateQueries({ queryKey: qk.boards });
    } catch (err) {
      toast(`No se pudo renombrar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const exportPng = async () => {
    const x = excali.current;
    if (!x) return;
    const elements = x.getSceneElements();
    if (!elements.length) return toast('El tablero está vacío');
    const blob = await exportToBlob({
      elements,
      appState: { ...x.getAppState(), exportBackground: true, exportWithDarkMode: false },
      files: x.getFiles(),
      mimeType: 'image/png',
      exportPadding: 32,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'tablero'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const remove = async () => {
    if (!confirm(`¿Borrar "${name}"? No se puede deshacer.`)) return;
    pending.current = null;
    await api.deleteBoard(id);
    await qc.invalidateQueries({ queryKey: qk.boards });
    navigate('/tableros');
  };

  return (
    <div className="flex h-dvh flex-col bg-[#fcfcfb]">
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-3 md:px-4"
        style={{ paddingTop: 'var(--safe-top)', minHeight: 'calc(52px + var(--safe-top))' }}
      >
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Link to="/tableros" className="flex h-8 items-center gap-1 rounded-lg pr-2 pl-1 text-[13.5px] font-medium text-ink-2 hover:bg-fill">
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Tableros</span>
          </Link>
          <div className="hidden h-5 w-px bg-line sm:block" />
          <Shapes size={16} className="hidden shrink-0 text-ink-2 sm:block" />
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={120}
            aria-label="Nombre del tablero"
            className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-[14.5px] font-semibold text-ink outline-none hover:bg-fill focus:bg-fill md:w-72 md:flex-none"
          />
          <SaveStatus status={status} />
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<Download size={15} />} onClick={() => void exportPng()} className="hidden sm:inline-flex">
            Exportar PNG
          </Button>
          <Menu
            items={[
              { label: 'Exportar PNG', icon: <Download size={14} />, onSelect: () => void exportPng() },
              { label: 'Borrar tablero', icon: <Trash2 size={14} />, danger: true, onSelect: () => void remove() },
            ]}
          />
        </div>
      </header>
      <div className="excalidraw-host relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(x) => (excali.current = x)}
          initialData={initialData}
          onChange={onChange}
          langCode="es-ES"
          theme="light"
          name={name}
          UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, toggleTheme: false } }}
        />
      </div>
    </div>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status === 'idle') return null;
  return (
    <span className="hidden shrink-0 items-center gap-1 text-[12.5px] text-ink-3 sm:flex">
      {status === 'saving' ? <LoaderCircle size={13} className="animate-spin" /> : status === 'saved' ? <Check size={14} /> : null}
      {status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : 'Sin guardar'}
    </span>
  );
}
