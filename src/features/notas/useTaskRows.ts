import { useRef, useState } from 'react';
import { qk, useApiMutation } from '@/data/hooks';
import type { Note, NoteInput } from '@/data/types';
import { taskTitle } from './tasks';
import type { TaskActions } from './TaskRow';

/** How long a checked row stays in place before moving on. */
const LINGER_MS = 1400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rows that are being checked or unchecked in a list (`listKey`): each keeps its row there,
 * read as its new state, until the save is done and it has had time to read as done.
 */
export function useSettling(listKey: string) {
  const [settling, setSettling] = useState<Record<string, { done: boolean; listKey: string }>>({});
  const lastToggle = useRef<Record<string, number>>({});

  const settle = (id: string, done: boolean, save: () => Promise<unknown>) => {
    const turn = (lastToggle.current[id] ?? 0) + 1;
    lastToggle.current[id] = turn;
    setSettling((s) => ({ ...s, [id]: { done, listKey } }));
    void Promise.all([save().catch(() => undefined), wait(LINGER_MS)]).then(() => {
      if (lastToggle.current[id] !== turn) return;
      setSettling((s) => {
        const rest = { ...s };
        delete rest[id];
        return rest;
      });
    });
  };

  return {
    settle,
    stateOf: (id: string) => settling[id],
    /** Whether this list keeps the row while it settles. */
    kept: (id: string) => settling[id]?.listKey === listKey,
  };
}

/** What rows of to-dos do, for a list showing the to-dos for which `belongs` is true. */
export function useTaskRows({ listKey, belongs, onOpen }: { listKey: string; belongs: (n: Note) => boolean; onOpen: (n: Note) => void }) {
  const { settle, stateOf, kept } = useSettling(listKey);
  const update = useApiMutation((api, v: { id: string; patch: NoteInput }) => api.updateNote(v.id, v.patch), [qk.notes]);
  const remove = useApiMutation((api, id: string) => api.deleteNote(id), [qk.notes], 'No se pudo borrar');

  const actions: TaskActions = {
    onToggle: (n) => {
      const next = !(stateOf(n.id)?.done ?? n.done);
      settle(n.id, next, () => update.mutateAsync({ id: n.id, patch: { done: next } }));
    },
    onOpen,
    onPatch: (n, patch) => update.mutate({ id: n.id, patch }),
    onDelete: (n) => {
      if (confirm(`¿Borrar "${taskTitle(n.body) || 'esta tarea'}"?`)) remove.mutate(n.id);
    },
  };

  return {
    actions,
    /** Whether this list shows the row right now. */
    shows: (n: Note) => belongs(n) || kept(n.id),
    isSettling: (n: Note) => Boolean(stateOf(n.id)),
    /** How the row reads: its state on screen, ahead of the save. */
    rowState: (n: Note) => {
      const state = stateOf(n.id);
      const done = state?.done ?? n.done;
      return { done, leaving: Boolean(state) && !belongs({ ...n, done }) };
    },
  };
}
