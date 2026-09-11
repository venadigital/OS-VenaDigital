import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Search, Shapes, Trash2, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Dialog, Empty, Field, Input, Menu, Select, Skeleton } from '@/components/ui';
import { useApi } from '@/data/ApiContext';
import { qk, useApiMutation, useBoards } from '@/data/hooks';
import type { BoardSummary } from '@/data/types';
import { useToast } from '@/components/Toast';
import { relativeDay } from '@/lib/format';
import { norm } from '@/lib/text';
import { useQueryClient } from '@tanstack/react-query';

export function TablerosPage() {
  const boardsQ = useBoards();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [renaming, setRenaming] = useState<BoardSummary | null>(null);
  const [params, setParams] = useSearchParams();
  const createBoard = useCreateBoard();
  const started = useRef(false);

  useEffect(() => {
    if (params.get('nuevo') && !started.current) {
      started.current = true;
      setParams({}, { replace: true });
      void createBoard();
    }
  }, [params, setParams, createBoard]);

  const remove = useApiMutation((api, id: string) => api.deleteBoard(id), [qk.boards], 'No se pudo borrar');
  const boards = useMemo(() => {
    const q = norm(query.trim());
    const list = (boardsQ.data ?? []).filter((b) => !q || norm(b.name).includes(q));
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')) : list;
  }, [boardsQ.data, query, sort]);
  const total = boardsQ.data?.length ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={`${total} ${total === 1 ? 'tablero' : 'tableros'}`}
        title="Tableros"
        right={
          <>
            <label className="flex h-[34px] w-full items-center gap-2 rounded-lg bg-fill px-2.5 text-ink-3 sm:w-56">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tableros"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
              />
              {query && (
                <button type="button" aria-label="Limpiar" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="w-36">
              <Select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} className="h-[34px] rounded-lg text-[13.5px]">
                <option value="recent">Recientes</option>
                <option value="name">Por nombre</option>
              </Select>
            </div>
            <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />} onClick={() => void createBoard()}>
              Nuevo tablero
            </Button>
          </>
        }
      />

      {boardsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <Empty
          icon={<Shapes size={28} />}
          title={total ? 'Ningún tablero coincide' : 'Aún no tienes tableros'}
          action={
            !total && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => void createBoard()}>
                Crear tablero
              </Button>
            )
          }
        >
          {total ? 'Prueba con otro nombre.' : 'Diagramas, mapas mentales o ideas sueltas: dibuja a mano alzada con Excalidraw.'}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <article key={b.id} className="group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-shadow hover:shadow-[0_8px_24px_rgb(var(--shade)/0.08)]">
              <Link to={`/tableros/${b.id}`} className="dots-bg flex h-[196px] items-center justify-center border-b border-rule p-2.5">
                {b.thumbnail ? <img src={b.thumbnail} alt="" className="board-thumb h-full w-full object-contain" loading="lazy" /> : <Shapes size={28} className="text-ink-4" />}
              </Link>
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-3.5">
                <Link to={`/tableros/${b.id}`} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{b.name}</span>
                  <span className="text-[12.5px] text-ink-3">Editado {relativeDay(new Date(b.updated_at)).toLowerCase()}</span>
                </Link>
                <Menu
                  items={[
                    { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setRenaming(b) },
                    {
                      label: 'Borrar',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => confirm(`¿Borrar "${b.name}"? No se puede deshacer.`) && remove.mutate(b.id),
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <RenameDialog board={renaming} onClose={() => setRenaming(null)} />
    </Page>
  );
}

export function useCreateBoard() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  return async () => {
    try {
      const b = await api.createBoard('Sin título');
      await qc.invalidateQueries({ queryKey: qk.boards });
      navigate(`/tableros/${b.id}?nuevo=1`);
    } catch (err) {
      toast(`No se pudo crear el tablero: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
}

function RenameDialog({ board, onClose }: { board: BoardSummary | null; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(board?.name ?? ''), [board]);
  const save = useApiMutation((api, v: { id: string; name: string }) => api.updateBoard(v.id, { name: v.name }), [qk.boards]);
  return (
    <Dialog
      open={Boolean(board)}
      onClose={onClose}
      title="Renombrar tablero"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => board && save.mutate({ id: board.id, name: name.trim() }, { onSuccess: onClose })}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
    </Dialog>
  );
}
