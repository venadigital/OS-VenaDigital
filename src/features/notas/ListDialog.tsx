import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui';
import { qk, useApiMutation, useNoteLists } from '@/data/hooks';
import type { NoteList, NoteListKind, NoteSection } from '@/data/types';
import { listTree, nextSort } from './lists';

const KINDS: { value: NoteListKind; label: string }[] = [
  { value: 'proyecto', label: 'Proyecto' },
  { value: 'area', label: 'Área' },
];

/** New area or project, or the details of one. `new` starts it inside an area when one is given. */
export function ListDialog({ list, onClose, onSaved }: { list: NoteList | { new: true; areaId?: string | null } | null; onClose: () => void; onSaved?: (l: NoteList) => void }) {
  const lists = useNoteLists().data ?? [];
  const existing = list && !('new' in list) ? list : null;
  const [kind, setKind] = useState<NoteListKind>('proyecto');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [areaId, setAreaId] = useState('');

  useEffect(() => {
    if (!list) return;
    const isNew = 'new' in list;
    setKind(isNew ? 'proyecto' : list.kind);
    setName(isNew ? '' : list.name);
    setDescription(isNew ? '' : list.description);
    setAreaId((isNew ? list.areaId : list.area_id) ?? '');
  }, [list]);

  const save = useApiMutation(
    async (api, _: void) => {
      const fields = { name: name.trim(), description: description.trim(), area_id: kind === 'proyecto' && areaId ? areaId : null };
      if (existing) {
        await api.updateNoteList(existing.id, fields);
        return { ...existing, ...fields };
      }
      const siblings = lists.filter((l) => l.kind === kind && (kind === 'area' || l.area_id === fields.area_id));
      return api.createNoteList({ ...fields, kind, sort: nextSort(siblings) });
    },
    [qk.noteLists],
  );

  const submit = () => {
    if (!name.trim() || save.isPending) return;
    save.mutate(undefined, {
      onSuccess: (saved) => {
        onClose();
        onSaved?.(saved);
      },
    });
  };

  const noun = kind === 'area' ? 'área' : 'proyecto';
  return (
    <Dialog
      open={Boolean(list)}
      onClose={onClose}
      title={existing ? `Editar ${noun}` : 'Nueva lista'}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={submit}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      {!existing && (
        <div className="self-start">
          <Segmented options={KINDS} value={kind} onChange={setKind} />
        </div>
      )}
      <Field label="Nombre">
        <Input
          className="notas-field"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </Field>
      <Field label="Descripción (opcional)">
        <Textarea className="notas-field" value={description} rows={2} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {kind === 'proyecto' && (
        <Field label="Área">
          <Select className="notas-field" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Sin área</option>
            {listTree(lists).areas.map(({ area }) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Dialog>
  );
}

/** Name of a section, new or existing. */
export function SectionDialog({ section, onClose }: { section: NoteSection | { new: true; listId: string; sort: number } | null; onClose: () => void }) {
  const existing = section && !('new' in section) ? section : null;
  const [name, setName] = useState('');

  useEffect(() => {
    if (section) setName('new' in section ? '' : section.name);
  }, [section]);

  const save = useApiMutation(
    async (api, _: void) => {
      if (existing) await api.updateNoteSection(existing.id, { name: name.trim() });
      else if (section && 'new' in section) await api.createNoteSection({ list_id: section.listId, name: name.trim(), sort: section.sort });
    },
    [qk.noteSections],
  );
  const submit = () => {
    if (name.trim() && !save.isPending) save.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <Dialog
      open={Boolean(section)}
      onClose={onClose}
      title={existing ? 'Renombrar sección' : 'Nueva sección'}
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={submit}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input
          className="notas-field"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </Field>
    </Dialog>
  );
}
