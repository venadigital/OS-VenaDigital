import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/data/ApiContext';
import { qk } from '@/data/hooks';
import { buildWebPdf, forgetCapture, readCapture, readParts, stitchParts } from './fromExtension';

/** Picks up what the Chrome extension just captured, when it opens the OS with `?extension=<id>`. */
export function ExtensionInbox() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const id = params.get('extension');
  const [share, setShare] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  const receive = useCallback(
    async (captureId: string) => {
      setError(null);
      setShare(0);
      try {
        const meta = await readCapture(captureId);
        if (!meta) {
          // Already picked up (a reloaded tab), or too old to still be there.
          setParams({}, { replace: true });
          return;
        }
        const parts = await readParts(meta, setShare);
        if (meta.kind === 'document') {
          const file = await buildWebPdf(parts, meta.title);
          const { inspectPdf, pdfErrorMessage } = await import('./pdf');
          const info = await inspectPdf(file).catch((err) => {
            throw new Error(pdfErrorMessage(err));
          });
          const doc = await api.createDocument(file, { name: meta.title.slice(0, 160) || 'Página web', page_count: info.pageCount, thumbnail: info.thumbnail, source_url: meta.url });
          await forgetCapture(captureId);
          await qc.invalidateQueries({ queryKey: qk.documents });
          if (meta.truncated) toast('Página muy larga: se guardó solo el comienzo');
          navigate(`/documentos/${doc.id}`, { replace: true });
        } else {
          const image = await stitchParts(parts);
          await api.createCapture(image.blob, { document_id: null, name: meta.title.slice(0, 200) || 'Captura', width: image.width, height: image.height, thumbnail: image.thumbnail });
          await forgetCapture(captureId);
          await qc.invalidateQueries({ queryKey: qk.captures });
          toast(meta.truncated ? 'Página muy larga: se guardó solo el comienzo' : 'Captura guardada');
          setParams({ vista: 'capturas' }, { replace: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, navigate, qc, setParams, toast],
  );

  useEffect(() => {
    if (!id || handled.current === id) return;
    handled.current = id;
    void receive(id);
  }, [id, receive]);

  return (
    <Dialog
      open={Boolean(id)}
      onClose={() => setParams({}, { replace: true })}
      title={error ? 'No se pudo guardar' : 'Guardando en el OS'}
      footer={
        error ? (
          <>
            <Button onClick={() => setParams({}, { replace: true })}>Cerrar</Button>
            <Button variant="primary" onClick={() => id && void receive(id)}>
              Reintentar
            </Button>
          </>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="text-[13.5px] text-crit">
          {error}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[13.5px] text-ink-2" role="status">
          <LoaderCircle size={16} className="animate-spin" /> {Math.round(share * 100)}%
        </p>
      )}
    </Dialog>
  );
}
