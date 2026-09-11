import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Button, ColorSwatches, Dialog, Field, Input, Select } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { Project, Task, TimeEntry } from '@/data/types';
import { nextColor, SERIES } from '@/lib/palette';

export function ProjectDialog({ open, onClose, project, projects }: { open: boolean; onClose: () => void; project?: Project; projects: Project[] }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SERIES[0]);
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setColor(project?.color ?? nextColor(projects.map((p) => p.color)));
  }, [open, project, projects]);

  const save = useApiMutation(
    async (api, v: { name: string; color: string }) => {
      if (project) await api.updateProject(project.id, v);
      else await api.createProject(v);
    },
    [qk.projects],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? 'Editar proyecto' : 'Nuevo proyecto'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ name: name.trim(), color }, { onSuccess: onClose })}
          >
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ej. Academia IA" />
      </Field>
      <Field label="Color">
        <ColorSwatches colors={SERIES} value={color} onChange={setColor} />
      </Field>
    </Dialog>
  );
}

export function TaskDialog({
  open,
  onClose,
  task,
  projects,
  defaultProjectId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task;
  projects: Project[];
  defaultProjectId?: string;
  onCreated?: (t: Task) => void;
}) {
  const active = projects.filter((p) => !p.archived);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? '');
    setProjectId(task?.project_id ?? defaultProjectId ?? active[0]?.id ?? '');
  }, [open, task, defaultProjectId]);

  const save = useApiMutation(
    async (api, v: { name: string; project_id: string }) => {
      if (task) {
        await api.updateTask(task.id, v);
        return null;
      }
      return api.createTask(v);
    },
    [qk.tasks],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? 'Editar tarea' : 'Nueva tarea'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !projectId || save.isPending}
            onClick={() =>
              save.mutate(
                { name: name.trim(), project_id: projectId },
                {
                  onSuccess: (t) => {
                    if (t) onCreated?.(t);
                    onClose();
                  },
                },
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      {active.length === 0 ? (
        <p className="text-[14px] text-ink-2">Primero crea un proyecto: cada tarea vive dentro de uno.</p>
      ) : (
        <>
          <Field label="Tarea">
            <Input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ej. Grabar clase 5" />
          </Field>
          <Field label="Proyecto">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
    </Dialog>
  );
}

const toLocalInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

export function EntryDialog({ entry, onClose, tasks, projects }: { entry: TimeEntry | null; onClose: () => void; tasks: Task[]; projects: Project[] }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [taskId, setTaskId] = useState('');
  useEffect(() => {
    if (!entry) return;
    setStart(toLocalInput(entry.started_at));
    setEnd(entry.ended_at ? toLocalInput(entry.ended_at) : '');
    setTaskId(entry.task_id);
  }, [entry]);

  const save = useApiMutation(
    (api, v: { id: string; started_at: string; ended_at: string | null; task_id: string }) =>
      api.updateEntry(v.id, { started_at: v.started_at, ended_at: v.ended_at, task_id: v.task_id }),
    [qk.running, ['entries']],
  );

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const invalid = !startDate || (endDate !== null && endDate < startDate);

  return (
    <Dialog
      open={Boolean(entry)}
      onClose={onClose}
      title="Editar registro"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={invalid || save.isPending}
            onClick={() =>
              entry &&
              startDate &&
              save.mutate(
                { id: entry.id, started_at: startDate.toISOString(), ended_at: endDate ? endDate.toISOString() : null, task_id: taskId },
                { onSuccess: onClose },
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Tarea">
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          {projects.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {tasks
                .filter((t) => t.project_id === p.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio">
          <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Fin" hint={entry && !entry.ended_at ? 'Vacío = sigue en curso' : undefined}>
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      {endDate && startDate && endDate < startDate && <p className="text-[13px] text-crit">El fin debe ser posterior al inicio.</p>}
    </Dialog>
  );
}
