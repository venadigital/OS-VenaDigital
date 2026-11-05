import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Archive, CalendarDays, CalendarRange, Check, Flag, ImagePlus, Inbox, Layers, Plus, Star, Sunrise, Trash2, X } from 'lucide-react';
import { Button, cx, Dialog, IconButton, Input, Menu, Segmented, type MenuItem } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { qk, useApiMutation } from '@/data/hooks';
import type { ChecklistItem, Note } from '@/data/types';
import { dayKey } from '@/lib/time';
import { acceptImage, IMAGE_TYPES } from './model';
import { dateLabel, newStep, taskNotes, taskPatch, taskTitle, type TaskType, tomorrow, weekend, type When, whenBucket, whenDate, whenLabel } from './tasks';

export type TaskDraft = { draft: true; when: When };
const isDraft = (t: Note | TaskDraft | null): t is TaskDraft => Boolean(t && 'draft' in t);

const TYPES: { value: TaskType; label: string }[] = [
  { value: 'hacer', label: 'Por hacer' },
  { value: 'investigar', label: 'Por investigar' },
];

const showPicker = (input: HTMLInputElement) => {
  try {
    input.showPicker?.();
  } catch {
    // Browsers that refuse it still open their own picker on tap.
  }
};

export function TaskDialog({ task, imageUrl, onClose }: { task: Note | TaskDraft | null; imageUrl?: string; onClose: () => void }) {
  const toast = useToast();
  const now = new Date();
  const existing = task && !isDraft(task) ? task : null;
  const [type, setType] = useState<TaskType>('hacer');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState<When>(whenBucket('entrada'));
  const [choosingDate, setChoosingDate] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [steps, setSteps] = useState<ChecklistItem[]>([]);
  const [newStepId, setNewStepId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task) return;
    const n = isDraft(task) ? null : task;
    setType(n?.type === 'investigar' ? 'investigar' : 'hacer');
    setTitle(n ? taskTitle(n.body) : '');
    setNotes(n ? taskNotes(n.body) : '');
    setWhen(n ? { due_date: n.due_date, bucket: n.bucket } : (task as TaskDraft).when);
    setChoosingDate(false);
    setDeadline(n?.deadline ?? '');
    setSteps(n?.checklist ?? []);
    setNewStepId(null);
    setFile(null);
    setRemoveImage(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [task]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const shownImage = preview ?? (existing?.image_path && !removeImage ? imageUrl : undefined);

  const save = useApiMutation(
    async (api, _: void) => {
      const patch = taskPatch({ type, title, notes, when, deadline, steps });
      if (file) patch.image_path = await api.uploadNoteImage(file);
      else if (removeImage) patch.image_path = null;
      if (existing) await api.updateNote(existing.id, patch);
      else await api.createNote(patch);
    },
    [qk.notes],
  );
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');

  const canSave = Boolean(title.trim() || file || (existing?.image_path && !removeImage));
  const submit = () => {
    if (canSave && !save.isPending) save.mutate(undefined, { onSuccess: onClose });
  };

  const addStep = () => {
    const step = newStep();
    setSteps((list) => [...list, step]);
    setNewStepId(step.id);
  };
  const editStep = (id: string, patch: Partial<ChecklistItem>) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const onStepKey = (e: KeyboardEvent<HTMLInputElement>, step: ChecklistItem) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step.text.trim()) addStep();
    } else if (e.key === 'Backspace' && !step.text) {
      e.preventDefault();
      setSteps((list) => list.filter((s) => s.id !== step.id));
    }
  };

  const pick = (next: When) => {
    setWhen(next);
    setChoosingDate(false);
  };
  const today = dayKey(now);
  const whenItems: MenuItem[] = [
    { label: 'Hoy', icon: <Star size={14} />, onSelect: () => pick(whenDate(today)) },
    { label: 'Mañana', icon: <Sunrise size={14} />, onSelect: () => pick(whenDate(tomorrow(now))) },
    { label: 'Este fin de semana', icon: <CalendarRange size={14} />, onSelect: () => pick(whenDate(weekend(now))) },
    { label: 'Elegir fecha…', icon: <CalendarDays size={14} />, onSelect: () => setChoosingDate(true) },
    { label: 'Cuando sea', icon: <Layers size={14} />, onSelect: () => pick(whenBucket('cuando_sea')) },
    { label: 'Algún día', icon: <Archive size={14} />, onSelect: () => pick(whenBucket('algun_dia')) },
    { label: 'Entrada', icon: <Inbox size={14} />, onSelect: () => pick(whenBucket('entrada')) },
  ];

  return (
    <Dialog
      open={Boolean(task)}
      onClose={onClose}
      title={existing ? 'Editar tarea' : 'Nueva tarea'}
      width={540}
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 size={15} />}
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('¿Borrar esta tarea?')) remove.mutate(existing.id, { onSuccess: onClose });
              }}
            >
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave || save.isPending} onClick={submit}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <input
        className="task-form-title"
        aria-label="Título"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={type === 'hacer' ? '¿Qué hay que hacer?' : '¿Qué quieres investigar?'}
      />
      <textarea className="task-form-notes" aria-label="Notas" placeholder="Notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="task-steps" role="group" aria-label="Checklist">
        {steps.map((s) => (
          <div key={s.id} className="task-step">
            <button type="button" className={cx('task-step-check', s.done && 'is-done')} aria-pressed={s.done} aria-label={`${s.done ? 'Marcar pendiente' : 'Marcar hecho'}: ${s.text || 'paso'}`} onClick={() => editStep(s.id, { done: !s.done })}>
              <span>{s.done && <Check size={11} strokeWidth={3.4} aria-hidden />}</span>
            </button>
            <input
              className={cx('task-step-text', s.done && 'is-done')}
              aria-label="Paso"
              value={s.text}
              autoFocus={s.id === newStepId}
              onChange={(e) => editStep(s.id, { text: e.target.value })}
              onKeyDown={(e) => onStepKey(e, s)}
            />
            <IconButton label={`Quitar paso: ${s.text || 'vacío'}`} size={32} onClick={() => setSteps((list) => list.filter((x) => x.id !== s.id))}>
              <X size={14} />
            </IconButton>
          </div>
        ))}
        <button type="button" className="task-step-add" onClick={addStep}>
          <Plus size={16} aria-hidden />
          Agregar paso
        </button>
      </div>

      <div className="self-start">
        <Segmented options={TYPES} value={type} onChange={setType} />
      </div>

      <div className="task-form-pills">
        <Menu
          align="left"
          items={whenItems}
          trigger={
            <button type="button" className={cx('task-pill', (when.due_date || when.bucket !== 'entrada') && 'is-set')} aria-label={`Cuándo: ${whenLabel(when, now)}`}>
              {when.due_date ? <CalendarDays size={15} aria-hidden /> : when.bucket === 'entrada' ? <Inbox size={15} aria-hidden /> : when.bucket === 'cuando_sea' ? <Layers size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
              {whenLabel(when, now)}
            </button>
          }
        />
        <label className={cx('task-pill', deadline && 'is-set')}>
          <Flag size={15} aria-hidden />
          {deadline ? dateLabel(deadline, now) : 'Fecha límite'}
          <input type="date" aria-label="Fecha límite" className="task-pill-date" value={deadline} onChange={(e) => setDeadline(e.target.value)} onClick={(e) => showPicker(e.currentTarget)} />
        </label>
        {deadline && (
          <IconButton label="Quitar fecha límite" size={32} onClick={() => setDeadline('')}>
            <X size={14} />
          </IconButton>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_TYPES}
          className="hidden"
          onChange={(e) => {
            const f = acceptImage(e.target.files?.[0], toast);
            if (!f) return;
            setFile(f);
            setRemoveImage(false);
          }}
        />
        <button type="button" className="task-pill" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={15} aria-hidden />
          {shownImage ? 'Cambiar imagen' : 'Imagen'}
        </button>
      </div>

      {choosingDate && (
        <Input
          type="date"
          aria-label="Día"
          className="w-auto self-start"
          value={when.due_date ?? ''}
          onChange={(e) => {
            if (e.target.value) setWhen(whenDate(e.target.value));
          }}
          onClick={(e) => showPicker(e.currentTarget)}
        />
      )}

      {shownImage && (
        <div className="relative">
          <img src={shownImage} alt="" className="max-h-48 w-full rounded-[10px] object-cover" />
          <button
            type="button"
            className="absolute top-2 right-2 rounded-full bg-overlay/90 p-1.5 text-ink-2 shadow"
            aria-label="Quitar imagen"
            onClick={() => {
              setFile(null);
              setRemoveImage(true);
              if (fileRef.current) fileRef.current.value = '';
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
