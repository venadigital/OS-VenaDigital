import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, CircleCheck, CornerDownLeft, FileText, Folder, ListTodo, FileUp, Globe, Moon, NotebookPen, Play, Search, Settings2, Shapes, Sun, UserPlus, Users } from 'lucide-react';
import { useBoards, useClients, useDocuments, useNoteLists, useNotes, useStartTimer } from '@/data/hooks';
import { notasPlaces, type Place, recentPlaces, VIEW_ICONS, WALL_ICON } from '@/features/notas/places';
import { isTask, taskTitle } from '@/features/notas/tasks';
import { useDownloaderStatus } from '@/features/descargar/service';
import { useTimeData } from '@/features/tiempo/model';
import { useNav } from './Shell';
import { cx, Dialog, Dot } from './ui';
import { norm } from '@/lib/text';
import { toggleTheme, useTheme } from '@/lib/theme';

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
  const noteLists = useNoteLists();
  const boards = useBoards();
  const documents = useDocuments();
  const clients = useClients();
  const { tasks, projectById } = useTimeData();
  const start = useStartTimer();
  const { theme } = useTheme();
  const nav = useNav();
  const { capture } = useDownloaderStatus();

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
      ...nav.map((n) => ({ id: `nav:${n.to}`, group: 'Ir a', label: n.label, icon: <n.icon size={16} />, run: go(n.to) })),
      { id: 'nav:ajustes', group: 'Ir a', label: 'Ajustes', icon: <Settings2 size={16} />, run: go('/ajustes') },
      { id: 'act:note', group: 'Crear', label: 'Nueva nota', icon: <NotebookPen size={16} />, run: go('/notas?nueva=1') },
      { id: 'act:pending', group: 'Crear', label: 'Nuevo pendiente', icon: <CircleCheck size={16} />, run: go('/notas?vista=entrada&nueva=tarea') },
      { id: 'act:task', group: 'Crear', label: 'Nueva tarea', icon: <Play size={16} />, run: go('/tiempo?nueva=1') },
      { id: 'act:event', group: 'Crear', label: 'Nuevo evento', icon: <CalendarPlus size={16} />, run: go('/calendario?nuevo=1') },
      { id: 'act:board', group: 'Crear', label: 'Nuevo tablero', icon: <Shapes size={16} />, run: go('/tableros?nuevo=1') },
      { id: 'act:client', group: 'Crear', label: 'Nuevo cliente', icon: <UserPlus size={16} />, run: go('/clientes?nuevo=1') },
      { id: 'act:document', group: 'Crear', label: 'Subir PDF', icon: <FileUp size={16} />, run: go('/documentos?subir=1') },
      ...(capture ? [{ id: 'act:web', group: 'Crear', label: 'Abrir web', icon: <Globe size={16} />, run: go('/documentos?web=1') }] : []),
      theme === 'dark'
        ? { id: 'act:theme', group: 'Apariencia', label: 'Usar modo claro', icon: <Sun size={16} />, run: toggleTheme }
        : { id: 'act:theme', group: 'Apariencia', label: 'Usar modo oscuro', icon: <Moon size={16} />, run: toggleTheme },
    ];
    // Places of Notas: its views, the wall and each area or project.
    const placeIcon = (p: Place) => {
      if (p.kind === 'area') return <Folder size={16} />;
      if (p.kind === 'proyecto') return <ListTodo size={16} />;
      const view = p.key.slice('vista:'.length);
      const Icon = view === 'muro' ? WALL_ICON : VIEW_ICONS[view as keyof typeof VIEW_ICONS].icon;
      return <Icon size={16} />;
    };
    const places: { place: Place; item: Item }[] = notasPlaces(noteLists.data ?? []).map((p) => ({
      place: p,
      item: { id: `place:${p.key}`, group: 'Notas', label: p.label, hint: { vista: 'Notas', area: 'Área', proyecto: 'Proyecto' }[p.kind], icon: placeIcon(p), run: go(p.to) },
    }));

    const tq = norm(q.trim());
    if (!tq) {
      const byKey = new Map(places.map((p) => [p.place.key, p.item]));
      const recent = recentPlaces()
        .map((key) => byKey.get(key))
        .filter((i): i is Item => Boolean(i))
        .slice(0, 4)
        .map((i) => ({ ...i, id: `recent:${i.id}`, group: 'Recientes' }));
      return [...recent, ...base];
    }
    const match = (s: string | null | undefined) => (s ? norm(s).includes(tq) : false);
    const found: Item[] = [
      ...places.filter((p) => match(p.place.label)).slice(0, 8).map((p) => p.item),
      ...(clients.data ?? [])
        .filter((c) => match(c.name) || match(c.contact_name) || match(c.company))
        .slice(0, 6)
        .map((c) => ({ id: `client:${c.id}`, group: 'Clientes', label: c.name, hint: c.contact_name ?? undefined, icon: <Users size={16} />, run: go(`/clientes/${c.id}`) })),
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
      ...(documents.data ?? [])
        .filter((d) => match(d.name))
        .slice(0, 6)
        .map((d) => ({ id: `doc:${d.id}`, group: 'Documentos', label: d.name, icon: <FileText size={16} />, run: go(`/documentos/${d.id}`) })),
      ...(notes.data ?? [])
        .filter((n) => match(n.body) || match(n.link_title) || match(n.url))
        .slice(0, 8)
        .map((n) => ({
          id: `note:${n.id}`,
          group: 'Notas',
          label: (n.link_title || (isTask(n) ? taskTitle(n.body) : n.body) || n.url || 'Nota').slice(0, 90),
          icon: <NotebookPen size={16} />,
          run: go(`/notas?nota=${n.id}`),
        })),
    ];
    return [...base.filter((i) => match(i.label)), ...found];
  }, [q, open, tasks, boards.data, documents.data, notes.data, noteLists.data, clients.data, projectById, navigate, start, theme, nav, capture]);

  if (!open) return null;

  const run = (i: Item) => {
    setOpen(false);
    i.run();
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Buscar en tu OS" width={620} dismissible>
      <div
        className="command-panel flex w-full flex-col overflow-hidden"
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
            aria-label="Buscar en tu OS"
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
                      <Dot color="var(--color-mute)" size={6} />
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
    </Dialog>
  );
}
