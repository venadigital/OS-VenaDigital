import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useApi } from './ApiContext';
import type { Api } from './api';
import type { CalendarInfo } from './types';
import { dayKey } from '@/lib/time';
import { DEFAULT_PRICES } from '@/lib/pricing';
import { useToast } from '@/components/Toast';

export const qk = {
  projects: ['projects'] as const,
  tasks: ['tasks'] as const,
  entries: (from: Date, to: Date) => ['entries', from.getTime(), to.getTime()] as const,
  running: ['running'] as const,
  notes: ['notes'] as const,
  noteImages: (paths: string[]) => ['note-images', ...paths] as const,
  boards: ['boards'] as const,
  board: (id: string) => ['board', id] as const,
  usage: (from: string, to: string) => ['usage', from, to] as const,
  sessions: (from: Date, to: Date) => ['sessions', from.getTime(), to.getTime()] as const,
  prices: ['prices'] as const,
  accounts: ['accounts'] as const,
  collectorStatus: ['collector-status'] as const,
  collectorTokens: ['collector-tokens'] as const,
  calendarStatus: ['calendar', 'status'] as const,
  calendars: ['calendar', 'calendars'] as const,
  calendarEvents: (from: Date, to: Date, ids: string[]) => ['calendar', 'events', from.getTime(), to.getTime(), ...ids] as const,
};

/** Re-renders every `ms` (for live clocks). */
export function useNow(ms = 1000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

// ---------------------------------------------------------------- queries
export const useProjects = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.projects, queryFn: () => api.listProjects() });
};
export const useTasks = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.tasks, queryFn: () => api.listTasks() });
};
export const useEntries = (from: Date, to: Date) => {
  const api = useApi();
  return useQuery({ queryKey: qk.entries(from, to), queryFn: () => api.listEntries(from, to) });
};
export const useRunning = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.running, queryFn: () => api.runningEntry(), refetchInterval: 60_000 });
};
export const useNotes = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.notes, queryFn: () => api.listNotes() });
};
export const useNoteImages = (paths: string[]) => {
  const api = useApi();
  return useQuery({
    queryKey: qk.noteImages(paths),
    queryFn: () => api.noteImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
  });
};
export const useBoards = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.boards, queryFn: () => api.listBoards() });
};
export const useBoard = (id: string) => {
  const api = useApi();
  return useQuery({ queryKey: qk.board(id), queryFn: () => api.getBoard(id), staleTime: Infinity, gcTime: 0 });
};
export const useUsage = (from: Date, to: Date) => {
  const api = useApi();
  const f = dayKey(from);
  const t = dayKey(to);
  return useQuery({ queryKey: qk.usage(f, t), queryFn: () => api.listUsage(f, t) });
};
export const useSessions = (from: Date, to: Date) => {
  const api = useApi();
  return useQuery({ queryKey: qk.sessions(from, to), queryFn: () => api.listSessions(from, to) });
};
export const usePrices = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.prices,
    queryFn: async () => {
      let prices = await api.listPrices();
      // First visit: the whole reference table. Later: only models added to it since
      // (seeding never overwrites a price already saved, so edits are kept).
      const missing = DEFAULT_PRICES.filter((d) => !prices.some((p) => p.model === d.model));
      if (missing.length) {
        await api.seedPrices(missing);
        prices = await api.listPrices();
        void qc.invalidateQueries({ queryKey: ['usage'] });
      }
      return prices;
    },
  });
};
export const useAccounts = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.accounts, queryFn: () => api.listAccounts() });
};
export const useCollectorStatus = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.collectorStatus, queryFn: () => api.listCollectorStatus(), refetchInterval: 120_000 });
};
export const useCollectorTokens = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.collectorTokens, queryFn: () => api.listCollectorTokens() });
};

// Calendario: Google is the source of truth, so refetch often to pick up changes made there.
export const useCalendarStatus = () => {
  const api = useApi();
  return useQuery({ queryKey: qk.calendarStatus, queryFn: () => api.calendarStatus(), staleTime: 5 * 60_000, retry: false });
};
export const useCalendars = (enabled: boolean) => {
  const api = useApi();
  return useQuery({ queryKey: qk.calendars, queryFn: () => api.listCalendars(), enabled, staleTime: 10 * 60_000, retry: false });
};
export const useCalendarEvents = (from: Date, to: Date, calendars: CalendarInfo[] | undefined) => {
  const api = useApi();
  const list = calendars ?? [];
  return useQuery({
    queryKey: qk.calendarEvents(from, to, list.map((c) => c.id)),
    queryFn: () => api.listCalendarEvents(from, to, list),
    enabled: list.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
};

// ---------------------------------------------------------------- mutations
/** Runs `fn(api, vars)`, invalidates `keys` and reports errors as a toast. */
export function useApiMutation<V, R = unknown>(fn: (api: Api, vars: V) => Promise<R>, keys: QueryKey[], errorMessage = 'No se pudo guardar') {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: V) => fn(api, vars),
    onSettled: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))),
    onError: (err) => toast(`${errorMessage}: ${err instanceof Error ? err.message : String(err)}`, 'error'),
  });
}

const TIMER_KEYS: QueryKey[] = [qk.running, ['entries']];

export const useStartTimer = () => useApiMutation((api, taskId: string) => api.startTimer(taskId), TIMER_KEYS, 'No se pudo iniciar');
export const useStopTimer = () => useApiMutation((api) => api.stopTimer(), TIMER_KEYS, 'No se pudo detener');

/** Keeps the timer in sync when it changes on another device. */
export function useTimerSync() {
  const api = useApi();
  const qc = useQueryClient();
  useEffect(
    () =>
      api.subscribeTimer(() => {
        void qc.invalidateQueries({ queryKey: qk.running });
        void qc.invalidateQueries({ queryKey: ['entries'] });
      }),
    [api, qc],
  );
}
