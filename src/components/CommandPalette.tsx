import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, NotebookPen, Play, Search, Settings2, Shapes } from 'lucide-react';
import { useBoards, useNotes, useStartTimer } from '@/data/hooks';
import { useTimeData } from '@/features/tiempo/model';
import { NAV } from './Shell';
import { cx, Dot } from './ui';
import { norm } from '@/lib/text';

const EVENT = 'vena:open-palette';
export const openPalette = () => window.dispatchEvent(new Event(EVENT));

type Item = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void };


export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const notes = useNotes();
  const boards = useBoards();
  const { tasks, projectById } = useTimeData();
  const start = useStartTimer();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const base: Item[] = [
      ...NAV.map((n) => ({ id: `nav:${n.to}`, group: 'Ir a', label: n.label, icon: <n.icon size={16} />, run: go(n.to) })),
      { id: 'nav:ajustes', group: 'Ir a', label: 'Ajustes', icon: <Settings2 size={16} />, run: go('/ajustes') },
      { id: 'act:note', group: 'Crear', label: 'Nueva nota', icon: <NotebookPen size={16} />, run: go('/notas?nueva=1') },
      { id: 'act:board', group: 'Crear', label: 'Nuevo tablero', icon: <Shapes size={16} />, run: go('/tableros?nuevo=1') },
    ];
    const tq = norm(q.trim());
    if (!tq) return base;
    const match = (s: string | null | undefined) => (s ? norm(s).includes(tq) : false);
    const found: Item[] = [
      ...tasks
        .filter((t) => !t.archived && match(t.name))
        .slice(0, 6)
        .map((t) => ({
          id: `task:${t.id}`,
          group: 'Iniciar tarea',
          label: t.name,
          hint: projectById.get(t.project_id)?.name,
          icon: <Play size={14} />,
          run: () => {
            start.mutate(t.id);
            navigate('/tiempo');
          },
        })),
      ...(boards.data ?? [])
        .filter((b) => match(b.name))
        .slice(0, 6)
        .map((b) => ({ id: `board:${b.id}`, group: 'Tableros', label: b.name, icon: <Shapes size={16} />, run: go(`/tableros/${b.id}`) })),
      ...(notes.data ?? [])
        .filter((n) => match(n.body) || match(n.link_title) || match(n.url))
        .slice(0, 8)
        .map((n) => ({
          id: `note:${n.id}`,
          group: 'Notas',
          label: (n.link_title || n.body || n.url || 'Nota').slice(0, 90),
          icon: <NotebookPen size={16} />,
          run: go(`/notas?nota=${n.id}`),
        })),
    ];
    return [...base.filter((i) => match(i.label)), ...found];
  }, [q, tasks, boards.data, notes.data, projectById, navigate, start]);

  if (!open) return null;

  const run = (i: Item) => {
    setOpen(false);
    i.run();
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(31_30_28/0.28)] px-3 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(31,30,28,0.22)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-rule px-4">
          <Search size={18} className="text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && items[active]) run(items[active]);
            }}
            placeholder="Busca notas, tableros, tareas o ve a un módulo…"
            className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4"
          />
        </div>
        <div className="overflow-y-auto p-1.5">
          {items.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-ink-3">Sin resultados</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="px-3 pt-2.5 pb-1 text-[11.5px] font-semibold text-ink-3">{header}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(it)}
                  className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px]', i === active ? 'bg-fill text-ink' : 'text-ink-2')}
                >
                  <span className="text-ink-3">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && (
                    <span className="flex items-center gap-1.5 text-xs text-ink-3">
                      <Dot color="#c3c2b7" size={6} />
                      {it.hint}
                    </span>
                  )}
                  {i === active && <CornerDownLeft size={14} className="text-ink-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
