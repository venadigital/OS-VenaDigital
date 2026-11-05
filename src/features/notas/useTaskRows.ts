import { useRef, useState } from 'react';
import { qk, useApiMutation } from '@/data/hooks';
import type { Note, NoteInput } from '@/data/types';
import { taskTitle } from './tasks';
import type { TaskActions } from './TaskRow';

/** How long a checked to-do stays in place before moving on. */
const LINGER_MS = 1400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What rows of to-dos do, for a list showing the to-dos for which `belongs` is true.
 * A to-do being checked keeps its row in that list until it has had time to read as done.
 */
export function useTaskRows({ listKey, belongs, onOpen }: { listKey: string; belongs: (n: Note) => boolean; onOpen: (n: Note) => void }) {
  const [settling, setSettling] = useState<Record<string, { done: boolean; listKey: string }>>({});
  const lastToggle = useRef<Record<string, number>>({});
  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');

  const toggle = (n: Note) => {
    const next = !(settling[n.id]?.done ?? n.done);
    const turn = (lastToggle.current[n.id] ?? 0) + 1;
    lastToggle.current[n.id] = turn;
    setSettling((s) => ({ ...s, [n.id]: { done: next, listKey } }));
    const saved = update.mutateAsync({ id: n.id, patch: { done: next } }).catch(() => undefined);
    void Promise.all([saved, wait(LINGER_MS)]).then(() => {
      if (lastToggle.current[n.id] !== turn) return;
      setSettling((s) => {
        const rest = { ...s };
        delete rest[n.id];
        return rest;
      });
    });
  };

  const actions: TaskActions = {
    onToggle: toggle,
    onOpen,
    onPatch: (n, patch) => update.mutate({ id: n.id, patch }),
    onDelete: (n) => {
      if (confirm(`¿Borrar "${taskTitle(n.body) || 'esta tarea'}"?`)) remove.mutate(n.id);
    },
  };

  return {
    actions,
    /** Whether this list shows the row right now. */
    shows: (n: Note) => belongs(n) || settling[n.id]?.listKey === listKey,
    isSettling: (n: Note) => Boolean(settling[n.id]),
    /** How the row reads: its state on screen, ahead of the save. */
    rowState: (n: Note) => {
      const state = settling[n.id];
      const done = state?.done ?? n.done;
      return { done, leaving: Boolean(state) && !belongs({ ...n, done }) };
    },
  };
}
