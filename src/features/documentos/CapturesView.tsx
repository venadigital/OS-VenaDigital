import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Download, ExternalLink, FileText, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { Button, Dialog, Empty, Field, Input, Menu, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useCaptures } from '@/data/hooks';
import type { Capture } from '@/data/types';
import { deliverFile } from '@/lib/deliverFile';
import { relativeDay } from '@/lib/format';
import { captureFileName } from './capture';

const TIME = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit' });

/** The saved screenshots. */
export function CapturesView({ query }: { query: (name: string) => boolean }) {
  const captures = useCaptures();
  const [open, setOpen] = useState<Capture | null>(null);
  const [renaming, setRenaming] = useState<Capture | null>(null);
  const api = useApi();
  const toast = useToast();
  const remove = useApiMutation((a, id: string) => a.deleteCapture(id), [qk.captures], 'No se pudo borrar');

  const download = async (c: Capture) => {
    try {
      const blob = await api.captureFile(c);
      await deliverFile(blob, captureFileName(c.name, blob, new Date(c.created_at)));
    } catch (err) {
      toast(`No se pudo descargar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  if (captures.isLoading) {
    return (
      <div className="board-collection board-collection--grid">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }
  const all = captures.data ?? [];
  const list = all.filter((c) => query(c.name));
  if (!list.length) return <Empty icon={<Camera size={28} />} title={all.length ? 'Ninguna captura coincide' : 'Aún no tienes capturas'} />;

  return (
    <>
      <div className="board-collection board-collection--grid">
        {list.map((c) => (
          <article key={c.id} className="board-gallery-card group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
            <button type="button" aria-label={`Ver ${c.name}`} className="board-gallery-preview doc-card-preview" onClick={() => setOpen(c)}>
              {c.thumbnail ? <img src={c.thumbnail} alt="" className="doc-capture-thumb" loading="lazy" /> : <Camera size={28} className="text-ink-4" />}
            </button>
            <div className="board-info flex items-center justify-between gap-2 px-4 pt-3 pb-3.5">
              <button type="button" className="flex min-w-0 flex-col gap-0.5 text-left" onClick={() => setOpen(c)}>
                <span className="truncate text-[14.5px] font-semibold text-ink">{c.name}</span>
                <span className="text-[12.5px] text-ink-3">
                  {relativeDay(new Date(c.created_at))} · {TIME.format(new Date(c.created_at))}
                </span>
              </button>
              <Menu
                items={[
                  { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setRenaming(c) },
                  { label: 'Descargar', icon: <Download size={14} />, onSelect: () => void download(c) },
                  {
                    label: 'Borrar',
                    icon: <Trash2 size={14} />,
                    danger: true,
                    onSelect: () => confirm(`¿Borrar la captura "${c.name}"? No se puede deshacer.`) && remove.mutate(c.id),
                  },
                ]}
              />
            </div>
          </article>
        ))}
      </div>
      <CaptureDialog capture={open} onClose={() => setOpen(null)} onDownload={download} />
      <RenameCapture capture={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

function CaptureDialog({ capture, onClose, onDownload }: { capture: Capture | null; onClose: () => void; onDownload: (c: Capture) => Promise<void> }) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!capture) return;
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    api
      .captureFile(capture)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [api, capture]);
  return (
    <Dialog
      open={Boolean(capture)}
      onClose={onClose}
      title={capture?.name ?? ''}
      width={1000}
      dismissible
      footer={
        capture && (
          <>
            {capture.document_id && (
              <Link to={`/documentos/${capture.document_id}`}>
                <Button icon={<ExternalLink size={15} />}>Abrir documento</Button>
              </Link>
            )}
            <Button variant="primary" icon={<Download size={15} />} onClick={() => void onDownload(capture)}>
              Descargar
            </Button>
          </>
        )
      }
    >
      <div className="doc-capture-view">
        {url ? (
          <img src={url} alt={capture?.name ?? ''} />
        ) : (
          <div className="flex h-64 w-full items-center justify-center gap-2 text-[14px] text-ink-3">
            {failed ? (
              <>
                <FileText size={16} /> No se pudo abrir la captura
              </>
            ) : (
              <LoaderCircle size={18} className="animate-spin" />
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function RenameCapture({ capture, onClose }: { capture: Capture | null; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(capture?.name ?? ''), [capture]);
  const save = useApiMutation((a, v: { id: string; name: string }) => a.updateCapture(v.id, { name: v.name }), [qk.captures]);
  return (
    <Dialog
      open={Boolean(capture)}
      onClose={onClose}
      title="Renombrar captura"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => capture && save.mutate({ id: capture.id, name: name.trim() }, { onSuccess: onClose })}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </Field>
    </Dialog>
  );
}
