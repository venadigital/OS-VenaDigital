import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Empty, IconButton, Menu, Skeleton, type MenuItem } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { Note, NoteList, NoteSection } from '@/data/types';
import { groupBySection, moveSort, nextSort, type Progress, siblings, type SortPatch } from './lists';
import { ListDialog, SectionDialog } from './ListDialog';
import { NotasBack } from './NotasBack';
import { ProgressRing } from './ProgressRing';
import { completedAt, isTask } from './tasks';
import { TaskRow } from './TaskRow';
import { useTaskRows } from './useTaskRows';

/** The page of an area or a project: its to-dos by section, and an area's projects on top. */
export function ListPanel({
  list,
  lists,
  sections,
  notes,
  progress,
  now,
  loading,
  onOpen,
  onNewTask,
}: {
  list: NoteList;
  lists: NoteList[];
  sections: NoteSection[];
  notes: Note[];
  progress: Map<string, Progress>;
  now: Date;
  loading: boolean;
  onOpen: (n: Note) => void;
  onNewTask: (sectionId: string | null) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [sectionForm, setSectionForm] = useState<NoteSection | { new: true; listId: string; sort: number } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const inList = (n: Note) => isTask(n) && n.list_id === list.id;
  const { actions, shows, isSettling, rowState } = useTaskRows({ listKey: `lista:${list.id}`, belongs: (n) => inList(n) && !n.done, onOpen });
  const open = notes.filter(shows);
  const done = notes.filter((n) => inList(n) && n.done && !isSettling(n)).sort((a, b) => completedAt(b).localeCompare(completedAt(a)));

  const own = sections.filter((s) => s.list_id === list.id);
  const groups = groupBySection(open, own);
  const area = list.area_id ? lists.find((l) => l.id === list.area_id) : undefined;
  const projects = list.kind === 'area' ? lists.filter((l) => l.area_id === list.id).sort((a, b) => a.sort - b.sort) : [];
  const listProgress = progress.get(list.id);

  const reorderLists = useApiMutation((a, moves: SortPatch[]) => Promise.all(moves.map((m) => a.updateNoteList(m.id, { sort: m.sort }))), [qk.noteLists]);
  const reorderSections = useApiMutation((a, moves: SortPatch[]) => Promise.all(moves.map((m) => a.updateNoteSection(m.id, { sort: m.sort }))), [qk.noteSections]);
  const removeList = useApiMutation((a, id: string) => a.deleteNoteList(id), [qk.noteLists, qk.noteSections, qk.notes], 'No se pudo borrar');
  const removeSection = useApiMutation((a, id: string) => a.deleteNoteSection(id), [qk.noteSections, qk.notes], 'No se pudo borrar');

  const moves = (items: (NoteList | NoteSection)[], id: string, label: 'up' | 'down') => moveSort(items, id, label === 'up' ? -1 : 1);
  const listMenu: MenuItem[] = [
    { label: 'Editar', icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
    ...(moves(siblings(list, lists), list.id, 'up').length ? [{ label: 'Subir en el menú', icon: <ArrowUp size={14} />, onSelect: () => reorderLists.mutate(moves(siblings(list, lists), list.id, 'up')) }] : []),
    ...(moves(siblings(list, lists), list.id, 'down').length ? [{ label: 'Bajar en el menú', icon: <ArrowDown size={14} />, onSelect: () => reorderLists.mutate(moves(siblings(list, lists), list.id, 'down')) }] : []),
    {
      label: 'Borrar',
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => {
        if (!confirm(`¿Borrar "${list.name}"? Sus tareas se conservan.`)) return;
        removeList.mutate(list.id, { onSuccess: () => navigate('/notas?vista=hoy', { replace: true }) });
      },
    },
  ];

  const sectionMenu = (s: NoteSection): MenuItem[] => [
    { label: 'Agregar tarea aquí', icon: <Plus size={14} />, onSelect: () => onNewTask(s.id) },
    { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setSectionForm(s) },
    ...(moves(own, s.id, 'up').length ? [{ label: 'Subir', icon: <ArrowUp size={14} />, onSelect: () => reorderSections.mutate(moves(own, s.id, 'up')) }] : []),
    ...(moves(own, s.id, 'down').length ? [{ label: 'Bajar', icon: <ArrowDown size={14} />, onSelect: () => reorderSections.mutate(moves(own, s.id, 'down')) }] : []),
    {
      label: 'Borrar sección',
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => {
        if (confirm(`¿Borrar la sección "${s.name}"? Sus tareas se conservan.`)) removeSection.mutate(s.id);
      },
    },
  ];

  const row = (n: Note) => <TaskRow key={n.id} note={n} {...rowState(n)} place="lista" now={now} actions={actions} />;

  return (
    <div className="notas-tasks">
      <NotasBack />
      <header className="list-head">
        {area && (
          <Link to={`/notas?lista=${area.id}`} className="page-eyebrow list-eyebrow">
            {area.name}
          </Link>
        )}
        <div className="list-title-row">
          {list.kind === 'proyecto' && <ProgressRing progress={listProgress} size={30} label={`${listProgress?.done ?? 0} de ${listProgress?.total ?? 0} hechas`} />}
          <h1 className="page-title min-w-0">{list.name}</h1>
          <Menu
            align="left"
            items={listMenu}
            trigger={
              <IconButton label={`Opciones de ${list.name}`} size={36}>
                <MoreHorizontal size={20} />
              </IconButton>
            }
          />
        </div>
        {list.description && <p className="list-description">{list.description}</p>}
      </header>

      {projects.length > 0 && (
        <nav aria-label={`Proyectos de ${list.name}`} className="list-projects">
          {projects.map((p) => (
            <Link key={p.id} to={`/notas?lista=${p.id}`} className="list-project">
              <ProgressRing progress={progress.get(p.id)} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <ChevronRight size={16} className="task-icon" aria-hidden />
            </Link>
          ))}
        </nav>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : (
        <>
          {groups.length === 0 && projects.length === 0 && <Empty title="Sin tareas" />}
          {groups.map(({ section, tasks }) => (
            <section key={section?.id ?? 'sin-seccion'} className="list-section" aria-label={section?.name ?? 'Sin sección'}>
              {section && (
                <div className="list-section-head">
                  <h2>{section.name}</h2>
                  <Menu
                    items={sectionMenu(section)}
                    trigger={
                      <IconButton label={`Opciones de ${section.name}`} size={32}>
                        <MoreHorizontal size={18} />
                      </IconButton>
                    }
                  />
                </div>
              )}
              {tasks.length > 0 && <div className="task-list">{tasks.map(row)}</div>}
            </section>
          ))}
        </>
      )}

      <div className="list-foot">
        <button type="button" className="task-step-add" onClick={() => setSectionForm({ new: true, listId: list.id, sort: nextSort(own) })}>
          <Plus size={16} aria-hidden />
          Nueva sección
        </button>
        {done.length > 0 && (
          <button type="button" className="list-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Ocultar' : 'Mostrar'} {done.length} {done.length === 1 ? 'hecha' : 'hechas'}
          </button>
        )}
      </div>
      {showDone && done.length > 0 && <div className="task-list">{done.map(row)}</div>}

      <ListDialog list={editing ? list : null} onClose={() => setEditing(false)} />
      <SectionDialog section={sectionForm} onClose={() => setSectionForm(null)} />
    </div>
  );
}
