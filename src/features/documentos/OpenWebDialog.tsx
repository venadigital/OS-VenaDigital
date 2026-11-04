import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useApi } from '@/data/ApiContext';
import { qk } from '@/data/hooks';
import { downloader } from '@/features/descargar/service';

/** Pasting an address: the Mac loads the page, and it opens as a document to annotate. */
export function OpenWebDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const close = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError(null);
    setUrl('');
    onClose();
  };

  const submit = async () => {
    const address = url.trim();
    if (!address || busy) return;
    const ctrl = new AbortController();
    request.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const web = await downloader.captureWeb(address, ctrl.signal);
      const { inspectPdf, pdfErrorMessage } = await import('./pdf');
      const info = await inspectPdf(web.file).catch((err) => {
        throw new Error(pdfErrorMessage(err));
      });
      if (ctrl.signal.aborted) return;
      const name = web.title.trim().slice(0, 160) || new URL(web.url).hostname;
      const d = await api.createDocument(web.file, { name, page_count: info.pageCount, thumbnail: info.thumbnail, source_url: web.url });
      await qc.invalidateQueries({ queryKey: qk.documents });
      if (web.truncated) toast('Página muy larga: se guardó solo el comienzo');
      close();
      navigate(`/documentos/${d.id}`);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Abrir web"
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant="primary"
            icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <Globe size={16} />}
            disabled={!url.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? 'Cargando…' : 'Abrir'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Field label="Dirección">
          <Input
            autoFocus
            value={url}
            disabled={busy}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://"
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-crit">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
