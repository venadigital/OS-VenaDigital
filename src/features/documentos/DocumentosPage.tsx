import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileDown, FileText, FileUp, LoaderCircle, Pencil, Search, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Dialog, Empty, Field, Input, Menu, Select, Skeleton } from '@/components/ui';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useDocuments } from '@/data/hooks';
import type { DocSummary } from '@/data/types';
import { useToast } from '@/components/Toast';
import { relativeDay } from '@/lib/format';
import { norm } from '@/lib/text';
import { deliverFile } from '@/lib/deliverFile';
import './documentos.css';

/** Supabase's limit for one file on this plan. */
const MAX_BYTES = 50 * 1024 * 1024;

export function DocumentosPage() {
  const docsQ = useDocuments();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [renaming, setRenaming] = useState<DocSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [params, setParams] = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUploadDocument();
  const api = useApi();
  const toast = useToast();

  useEffect(() => {
    if (params.has('subir')) {
      setParams({}, { replace: true });
      fileInput.current?.click();
    }
  }, [params, setParams]);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };
  // A PDF dragged from Finder anywhere on the window.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      pickRef.current(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const remove = useApiMutation((api, id: string) => api.deleteDocument(id), [qk.documents], 'No se pudo borrar');
  const docs = useMemo(() => {
    const q = norm(query.trim());
    const list = (docsQ.data ?? []).filter((d) => !q || norm(d.name).includes(q));
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'es') : b.updated_at.localeCompare(a.updated_at)));
  }, [docsQ.data, query, sort]);
  const total = docsQ.data?.length ?? 0;

  const downloadOriginal = async (d: DocSummary) => {
    try {
      await deliverFile(await api.documentFile(d), `${d.name}.pdf`);
    } catch (err) {
      toast(`No se pudo descargar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`${total} ${total === 1 ? 'documento' : 'documentos'}`}
        title="Documentos"
        right={
          <Button
            variant="primary"
            icon={uploading ? <LoaderCircle size={16} className="animate-spin" /> : <FileUp size={16} />}
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Subiendo…' : 'Subir PDF'}
          </Button>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      {total > 0 && (
        <div className="collection-toolbar board-toolbar">
          <label className="collection-search flex h-[34px] w-full items-center gap-2 rounded-lg bg-fill px-2.5 text-ink-3 sm:w-56">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar documentos"
              aria-label="Buscar documentos"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
            />
            {query && (
              <button type="button" aria-label="Limpiar" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="w-36">
            <Select aria-label="Ordenar documentos" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} className="h-[34px] rounded-lg text-[13.5px]">
              <option value="recent">Recientes</option>
              <option value="name">Por nombre</option>
            </Select>
          </div>
        </div>
      )}

      {docsQ.isLoading ? (
        <div className="board-collection board-collection--grid">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <Empty
          icon={<FileText size={28} />}
          title={total ? 'Ningún documento coincide' : 'Aún no tienes documentos'}
          action={
            total ? (
              <Button onClick={() => setQuery('')}>Ver todos</Button>
            ) : (
              <Button icon={<FileUp size={16} />} onClick={() => fileInput.current?.click()}>
                Subir PDF
              </Button>
            )
          }
        >
          {total ? 'Prueba con otro nombre.' : 'Sube un PDF para leerlo y anotarlo.'}
        </Empty>
      ) : (
        <div className="board-collection board-collection--grid">
          {docs.map((d) => (
            <article key={d.id} className="board-gallery-card group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
              <Link to={`/documentos/${d.id}`} aria-label={`Abrir ${d.name}`} tabIndex={-1} className="board-gallery-preview doc-card-preview">
                {d.thumbnail ? <img src={d.thumbnail} alt="" className="doc-thumb" loading="lazy" /> : <FileText size={28} className="text-ink-4" />}
              </Link>
              <div className="board-info flex items-center justify-between gap-2 px-4 pt-3 pb-3.5">
                <Link to={`/documentos/${d.id}`} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{d.name}</span>
                  <span className="text-[12.5px] text-ink-3">
                    {d.page_count} {d.page_count === 1 ? 'página' : 'páginas'} · {relativeDay(new Date(d.updated_at)).toLowerCase()}
                  </span>
                </Link>
                <Menu
                  items={[
                    { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setRenaming(d) },
                    { label: 'Descargar original', icon: <FileDown size={14} />, onSelect: () => void downloadOriginal(d) },
                    {
                      label: 'Borrar',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => confirm(`¿Borrar "${d.name}" y sus anotaciones? No se puede deshacer.`) && remove.mutate(d.id),
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {dragging && (
        <div className="doc-drop" aria-hidden>
          <FileUp size={28} />
          Suelta el PDF para subirlo
        </div>
      )}
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} />
    </Page>
  );
}

/** Checks the file is a PDF, keeps it untouched in Storage and opens it. */
export function useUploadDocument() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('Elige un archivo PDF', 'error');
    if (file.size > MAX_BYTES) return toast('El PDF pesa más de 50 MB', 'error');
    setUploading(true);
    try {
      const { inspectPdf, pdfErrorMessage } = await import('./pdf');
      const info = await inspectPdf(file).catch((err) => {
        throw new Error(pdfErrorMessage(err));
      });
      const name = file.name.replace(/\.pdf$/i, '').trim().slice(0, 160) || 'Documento';
      const d = await api.createDocument(file, { name, page_count: info.pageCount, thumbnail: info.thumbnail });
      await qc.invalidateQueries({ queryKey: qk.documents });
      navigate(`/documentos/${d.id}`);
    } catch (err) {
      toast(`No se pudo subir: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setUploading(false);
    }
  };
  return { upload, uploading };
}

function RenameDialog({ doc, onClose }: { doc: DocSummary | null; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(doc?.name ?? ''), [doc]);
  const save = useApiMutation((api, v: { id: string; name: string }) => api.updateDocument(v.id, { name: v.name }), [qk.documents]);
  return (
    <Dialog
      open={Boolean(doc)}
      onClose={onClose}
      title="Renombrar documento"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => doc && save.mutate({ id: doc.id, name: name.trim() }, { onSuccess: onClose })}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
      </Field>
    </Dialog>
  );
}
