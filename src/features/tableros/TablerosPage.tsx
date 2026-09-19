import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Pencil, Plus, Search, Shapes, Star, Trash2, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Dialog, Empty, Field, Input, Menu, Select, Skeleton } from '@/components/ui';
import { useWorkspaceView } from '@/lib/workspaceView';
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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const { favorites, boardView, setBoardView, toggleBoardFavorite } = useWorkspaceView();
  const [params, setParams] = useSearchParams();
  const createBoard = useCreateBoard();

  useEffect(() => {
    if (params.has('nuevo')) {
      setName('');
      setParams({}, { replace: true });
      setCreating(true);
    }
  }, [params, setParams]);

  const submitNew = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await createBoard(name.trim()); } finally { setBusy(false); }
  };

  const remove = useApiMutation((api, id: string) => api.deleteBoard(id), [qk.boards], 'No se pudo borrar');
  const boards = useMemo(() => {
    const q = norm(query.trim());
    const list = (boardsQ.data ?? []).filter((b) => (!q || norm(b.name).includes(q)) && (!onlyFavorites || favorites.includes(b.id)));
    return [...list].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'es') : b.updated_at.localeCompare(a.updated_at));
  }, [boardsQ.data, query, sort, onlyFavorites, favorites]);
  const total = boardsQ.data?.length ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={`${total} ${total === 1 ? 'tablero' : 'tableros'}`}
        title="Tableros"
        right={<Button variant="primary" icon={<Plus size={16} />} onClick={() => {setName(''); setCreating(true);}}>Nuevo tablero</Button>}
      />
      <div className="collection-toolbar board-toolbar">
        <div className="view-switch" role="group" aria-label="Filtrar tableros">
          <button type="button" aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>Todos <span>{total}</span></button>
          <button type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}><Star size={15}/> Favoritos <span>{(boardsQ.data ?? []).filter(b => favorites.includes(b.id)).length}</span></button>
        </div>
            <label className="collection-search flex h-[34px] w-full items-center gap-2 rounded-lg bg-fill px-2.5 text-ink-3 sm:w-56">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tableros"
                aria-label="Buscar tableros"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
              />
              {query && (
                <button type="button" aria-label="Limpiar" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="w-36">
              <Select aria-label="Ordenar tableros" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} className="h-[34px] rounded-lg text-[13.5px]">
                <option value="recent">Recientes</option>
                <option value="name">Por nombre</option>
              </Select>
            </div>
        <div className="view-switch" role="group" aria-label="Vista de tableros">
          <button type="button" aria-label="Vista de tarjetas" title="Tarjetas" aria-pressed={boardView === 'grid'} onClick={() => setBoardView('grid')}><LayoutGrid size={17}/></button>
          <button type="button" aria-label="Vista de lista" title="Lista" aria-pressed={boardView === 'list'} onClick={() => setBoardView('list')}><List size={18}/></button>
        </div>
      </div>
      <p className="result-count" role="status">{boards.length} {boards.length === 1 ? 'tablero' : 'tableros'}{query ? ` para “${query}”` : onlyFavorites ? ' favoritos' : ' en tu espacio'} <span>· Usa la estrella para tenerlos a mano en Inicio.</span></p>

      {boardsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <Empty
          icon={<Shapes size={28} />}
          title={onlyFavorites && !query ? 'Tus favoritos, a un clic' : total ? 'Ningún tablero coincide' : 'Aún no tienes tableros'}
          action={
            <Button onClick={() => total ? (setQuery(''), setOnlyFavorites(false)) : setCreating(true)}>{total ? 'Ver todos los tableros' : 'Crear tablero'}</Button>
          }
        >
          {onlyFavorites ? 'Marca con una estrella los tableros que usas con frecuencia.' : total ? 'Prueba con otro nombre.' : 'Diagramas, mapas mentales o ideas sueltas: dibuja a mano alzada con Excalidraw.'}
        </Empty>
      ) : (
        <div className={`board-collection board-collection--${boardView}`}>
          {boards.map((b) => (
            <article key={b.id} className="board-gallery-card group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-shadow hover:shadow-[0_8px_24px_rgb(var(--shade)/0.08)]">
              <Link to={`/tableros/${b.id}`} aria-label={`Abrir ${b.name}`} tabIndex={-1} className="board-gallery-preview dots-bg flex h-[196px] items-center justify-center border-b border-rule p-2.5">
                {b.thumbnail ? <img src={b.thumbnail} alt="" className="board-thumb h-full w-full object-contain" loading="lazy" /> : <Shapes size={28} className="text-ink-4" />}
              </Link>
              <div className="board-info flex items-center justify-between gap-2 px-4 pt-3 pb-3.5">
                <Link to={`/tableros/${b.id}`} className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{b.name}</span>
                  <span className="text-[12.5px] text-ink-3">Editado {relativeDay(new Date(b.updated_at)).toLowerCase()}</span>
                </Link>
                <button type="button" className="favorite-button" aria-label={`${favorites.includes(b.id) ? 'Quitar de' : 'Añadir a'} favoritos: ${b.name}`} aria-pressed={favorites.includes(b.id)} onClick={() => toggleBoardFavorite(b.id)}><Star size={18} fill={favorites.includes(b.id) ? 'currentColor' : 'none'}/></button>
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
      <Dialog open={creating} onClose={() => {if(!busy) setCreating(false);}} title="Nuevo tablero" footer={<><Button disabled={busy} onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" form="new-board-form" variant="primary" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear y abrir'}</Button></>}>
        <form id="new-board-form" onSubmit={e => {e.preventDefault(); void submitNew();}}><Field label="Nombre del tablero"><Input autoFocus aria-label="Nombre del nuevo tablero" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Lanzamiento del próximo curso" disabled={busy}/></Field></form>
        <p className="text-sm text-ink-3">Se abrirá un lienzo en blanco. Puedes cambiar el nombre después.</p>
      </Dialog>
    </Page>
  );
}

export function useCreateBoard() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  return async (name: string) => {
    try {
      const b = await api.createBoard(name);
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
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => board && save.mutate({ id: board.id, name: name.trim() }, { onSuccess: onClose })}>
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
