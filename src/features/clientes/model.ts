// Clientes: pure calculations (hours, health, billing) plus the hook that joins
// clients with their Tiempo project, interactions and invoices.
import { useMemo } from 'react';
import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useClientLogs, useClients, useEntries, useInvoices, useNow } from '@/data/hooks';
import type { Agreement, Client, ClientLog, ClientStatus, ContactChannel, Currency, Invoice, LogKind, Project, Task, TimeEntry } from '@/data/types';
import { useTimeData } from '@/features/tiempo/model';
import { dayKey, fromDayKey, overlapMinutes, rangeFor } from '@/lib/time';

// ---------------------------------------------------------------- labels
export const STATUS_LABEL: Record<ClientStatus, string> = { activo: 'Activo', pausa: 'En pausa', cerrado: 'Cerrado', prospecto: 'Prospecto' };
export const AGREEMENT_LABEL: Record<Agreement, string> = { retainer: 'Retainer mensual', proyecto: 'Proyecto', horas: 'Por horas' };
export const CHANNEL_LABEL: Record<ContactChannel, string> = { whatsapp: 'WhatsApp', correo: 'Correo', llamada: 'Llamada', reunion: 'Reunión' };
export const LOG_KINDS: { value: LogKind; label: string; plural: string }[] = [
  { value: 'reunion', label: 'Reunión', plural: 'Reuniones' },
  { value: 'llamada', label: 'Llamada', plural: 'Llamadas' },
  { value: 'correo', label: 'Correo', plural: 'Correos' },
  { value: 'decision', label: 'Decisión', plural: 'Decisiones' },
  { value: 'entrega', label: 'Entrega', plural: 'Entregas' },
  { value: 'nota', label: 'Nota', plural: 'Notas' },
];
export const logKindLabel = (k: LogKind) => LOG_KINDS.find((x) => x.value === k)?.label ?? k;

/** Days without a real contact (notes don't count) before a client needs attention. */
export const NO_CONTACT_DAYS = 14;

// ---------------------------------------------------------------- money
const grouped = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const SYMBOL: Record<Currency, string> = { COP: '$', USD: 'US$', EUR: '€' };

/** 4200000 → "$4.200.000"; 1250.5 USD → "US$1.250,5". */
export function money(n: number, currency: Currency = 'COP'): string {
  const v = currency === 'COP' ? Math.round(n) : n;
  return `${n < 0 ? '-' : ''}${SYMBOL[currency]}${grouped.format(Math.abs(v))}`;
}

/** Minutes as "18 h 40 m" (the hours read first, as on the mockups). */
export function hm(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} m`;
  return m ? `${h} h ${String(m).padStart(2, '0')} m` : `${h} h`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || name.slice(0, 2).toUpperCase();

/** "jue 2 oct". */
export function dayLabel(key: string): string {
  return format(fromDayKey(key), 'EEE d MMM', { locale: es }).replace(/\./g, '');
}

/** "Hoy", "Mañana", "en 3 días", "hace 2 días". */
export function relDays(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

// ---------------------------------------------------------------- invoices
export type InvoiceState = 'pagada' | 'vencida' | 'pendiente';

export function invoiceState(inv: Pick<Invoice, 'paid_on' | 'due_on'>, today: Date): InvoiceState {
  if (inv.paid_on) return 'pagada';
  if (inv.due_on && fromDayKey(inv.due_on) < startOfDay(today)) return 'vencida';
  return 'pendiente';
}

/** Next number after the latest of the year ("2026-014" → "2026-015"). */
export function nextInvoiceNumber(invoices: Pick<Invoice, 'number' | 'issued_on'>[], today: Date): string {
  const year = String(today.getFullYear());
  let best = 0;
  let width = 3;
  for (const inv of invoices) {
    const m = /^(\d{4})-(\d+)$/.exec(inv.number.trim());
    if (m && m[1] === year && Number(m[2]) > best) {
      best = Number(m[2]);
      width = m[2].length;
    }
  }
  if (best) return `${year}-${String(best + 1).padStart(width, '0')}`;
  // Another numbering: bump the trailing number of the latest invoice.
  const latest = [...invoices].sort((a, b) => b.issued_on.localeCompare(a.issued_on))[0];
  const tail = latest && /^(.*?)(\d+)$/.exec(latest.number.trim());
  if (tail && !/^\d{4}-$/.test(tail[1])) return `${tail[1]}${String(Number(tail[2]) + 1).padStart(tail[2].length, '0')}`;
  return `${year}-001`;
}

export function defaultDueDate(issued: string, client: Pick<Client, 'payment_terms_days'>): string {
  return dayKey(addDays(fromDayKey(issued), client.payment_terms_days));
}

// ---------------------------------------------------------------- hours
/** Minutes of `tasks` inside [from, to), counting a running entry up to now. */
export function minutesFor(entries: TimeEntry[], taskIds: Set<string>, from: Date, to: Date, now: Date): number {
  let total = 0;
  for (const e of entries) if (taskIds.has(e.task_id)) total += overlapMinutes(e, from, to, now);
  return total;
}

/** Minutes per task (whatever range the entries cover). */
export function minutesByTask(entries: TimeEntry[], from: Date, to: Date, now: Date): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.task_id, (m.get(e.task_id) ?? 0) + overlapMinutes(e, from, to, now));
  return m;
}

/** What this month's work is worth under the agreement, to bill or compare. */
export function monthBilling(client: Client, monthMinutes: number): { extraMinutes: number; toBill: number | null } {
  const hours = monthMinutes / 60;
  if (client.agreement === 'horas') return { extraMinutes: 0, toBill: hours * client.fee };
  if (client.agreement === 'retainer' && client.included_hours != null) {
    const extraMinutes = Math.max(0, monthMinutes - client.included_hours * 60);
    return { extraMinutes, toBill: client.extra_hour_rate ? (extraMinutes / 60) * client.extra_hour_rate : null };
  }
  return { extraMinutes: 0, toBill: null };
}

/** Income per hour worked: retainer over the month, project over its total, hourly as agreed. */
export function valuePerHour(client: Client, monthMinutes: number, totalMinutes: number): number | null {
  if (client.agreement === 'horas') return client.fee || null;
  if (client.agreement === 'retainer') {
    if (monthMinutes < 30) return null;
    const { toBill } = monthBilling(client, monthMinutes);
    return (client.fee + (toBill ?? 0)) / (monthMinutes / 60);
  }
  if (totalMinutes < 30 || !client.fee) return null;
  return client.fee / (totalMinutes / 60);
}

// ---------------------------------------------------------------- health
export type Level = 'crit' | 'warn';
export type Issue = { level: Level; text: string; /** lower = more urgent */ rank: number; kind: 'task' | 'invoice' | 'retainer' | 'contact' };
export type Health = 'crit' | 'warn' | 'ok' | 'off';

export function lastContact(logs: ClientLog[]): ClientLog | undefined {
  let best: ClientLog | undefined;
  for (const l of logs) if (l.kind !== 'nota' && (!best || l.occurred_at > best.occurred_at)) best = l;
  return best;
}

export function issuesFor(
  client: Client,
  ctx: { tasks: Task[]; invoices: Invoice[]; logs: ClientLog[]; monthMinutes: number; now: Date },
): Issue[] {
  if (client.status !== 'activo') return [];
  const today = startOfDay(ctx.now);
  const out: Issue[] = [];
  for (const t of ctx.tasks) {
    if (t.archived || !t.due_date) continue;
    const days = differenceInCalendarDays(fromDayKey(t.due_date), today);
    if (days < 0) out.push({ level: 'crit', kind: 'task', rank: days, text: `${t.name}: entrega vencida ${relDays(days)}` });
  }
  for (const inv of ctx.invoices) {
    if (invoiceState(inv, ctx.now) !== 'vencida') continue;
    const days = differenceInCalendarDays(fromDayKey(inv.due_on!), today);
    out.push({ level: 'crit', kind: 'invoice', rank: days, text: `Factura ${inv.number} vencida ${relDays(days)}` });
  }
  if (client.agreement === 'retainer' && client.included_hours && ctx.monthMinutes > client.included_hours * 60) {
    out.push({ level: 'warn', kind: 'retainer', rank: 50, text: `Retainer excedido: ${hm(ctx.monthMinutes)} de ${hm(client.included_hours * 60)}` });
  }
  const last = lastContact(ctx.logs);
  const since = differenceInCalendarDays(today, startOfDay(new Date(last?.occurred_at ?? client.created_at)));
  if (since >= NO_CONTACT_DAYS) out.push({ level: 'warn', kind: 'contact', rank: 100 - since / 100, text: last ? `Sin contacto hace ${since} días` : `Sin interacciones registradas en ${since} días` });
  return out.sort((a, b) => a.rank - b.rank);
}

export function healthOf(client: Client, issues: Issue[]): Health {
  if (client.status !== 'activo') return 'off';
  if (issues.some((i) => i.level === 'crit')) return 'crit';
  if (issues.length) return 'warn';
  return 'ok';
}

export const HEALTH_COLOR: Record<Health, string> = { crit: 'var(--color-crit)', warn: 'var(--color-warn)', ok: 'var(--color-good)', off: 'var(--color-mute)' };
export const HEALTH_LABEL: Record<Health, string> = { crit: 'Atrasado', warn: 'Revisar', ok: 'Al día', off: 'Sin actividad' };

// ---------------------------------------------------------------- joined data
export type ClientSummary = {
  client: Client;
  project?: Project;
  tasks: Task[];
  logs: ClientLog[];
  invoices: Invoice[];
  monthMinutes: number;
  /** Open task with the nearest delivery date. */
  nextDue?: Task;
  lastContact?: ClientLog;
  pendingAmount: number;
  issues: Issue[];
  health: Health;
};

const HEALTH_ORDER: Record<Health, number> = { crit: 0, warn: 1, ok: 2, off: 3 };

export function summarize(
  clients: Client[],
  data: { projects: Project[]; tasks: Task[]; logs: ClientLog[]; invoices: Invoice[]; monthEntries: TimeEntry[]; from: Date; to: Date; now: Date },
): ClientSummary[] {
  const projectById = new Map(data.projects.map((p) => [p.id, p]));
  return clients
    .map((client) => {
      const project = client.project_id ? projectById.get(client.project_id) : undefined;
      const tasks = project ? data.tasks.filter((t) => t.project_id === project.id) : [];
      const logs = data.logs.filter((l) => l.client_id === client.id);
      const invoices = data.invoices.filter((f) => f.client_id === client.id);
      const monthMinutes = minutesFor(data.monthEntries, new Set(tasks.map((t) => t.id)), data.from, data.to, data.now);
      const nextDue = tasks.filter((t) => !t.archived && t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
      const issues = issuesFor(client, { tasks, invoices, logs, monthMinutes, now: data.now });
      return {
        client,
        project,
        tasks,
        logs,
        invoices,
        monthMinutes,
        nextDue,
        lastContact: lastContact(logs),
        pendingAmount: invoices.filter((f) => !f.paid_on && f.currency === client.currency).reduce((s, f) => s + f.amount, 0),
        issues,
        health: healthOf(client, issues),
      };
    })
    .sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || (a.issues[0]?.rank ?? 999) - (b.issues[0]?.rank ?? 999) || a.client.name.localeCompare(b.client.name, 'es'));
}

/** Clients with their month hours, health and money, refreshed every minute. */
export function useClientsData() {
  const now = useNow(60_000);
  const monthKey = dayKey(now).slice(0, 7);
  // One range per calendar month, so the entries query key only changes at month end.
  const { from, to } = useMemo(() => rangeFor('month', now), [monthKey]);
  const clientsQ = useClients();
  const logsQ = useClientLogs();
  const invoicesQ = useInvoices();
  const entriesQ = useEntries(from, to);
  const time = useTimeData();
  const summaries = useMemo(
    () =>
      summarize(clientsQ.data ?? [], {
        projects: time.projects,
        tasks: time.tasks,
        logs: logsQ.data ?? [],
        invoices: invoicesQ.data ?? [],
        monthEntries: entriesQ.data ?? [],
        from,
        to,
        now,
      }),
    [clientsQ.data, time.projects, time.tasks, logsQ.data, invoicesQ.data, entriesQ.data, from, to, now],
  );
  return {
    summaries,
    from,
    to,
    now,
    projects: time.projects,
    invoices: invoicesQ.data ?? [],
    loading: clientsQ.isLoading || time.loading,
  };
}

// ---------------------------------------------------------------- Inicio
export type TodayItem = { key: string; clientId: string; client: string; text: string; when: string; tone: 'crit' | 'warn' | 'plain'; kind: 'entrega' | 'cobro' | 'seguimiento'; rank: number };

/** Deliveries and payments due within a week (or late) and clients gone quiet. */
export function todayItems(summaries: ClientSummary[], now: Date, horizonDays = 7): TodayItem[] {
  const today = startOfDay(now);
  const out: TodayItem[] = [];
  for (const s of summaries) {
    if (s.client.status !== 'activo') continue;
    for (const t of s.tasks) {
      if (t.archived || !t.due_date) continue;
      const days = differenceInCalendarDays(fromDayKey(t.due_date), today);
      if (days > horizonDays) continue;
      out.push({
        key: `t:${t.id}`,
        clientId: s.client.id,
        client: s.client.name,
        text: t.name,
        when: days < 0 ? `Vencida ${relDays(days)}` : days <= 1 ? relDays(days)[0].toUpperCase() + relDays(days).slice(1) : dayLabel(t.due_date),
        tone: days < 0 ? 'crit' : days <= 2 ? 'warn' : 'plain',
        kind: 'entrega',
        rank: days,
      });
    }
    for (const f of s.invoices) {
      if (f.paid_on || !f.due_on) continue;
      const days = differenceInCalendarDays(fromDayKey(f.due_on), today);
      if (days > horizonDays) continue;
      out.push({
        key: `f:${f.id}`,
        clientId: s.client.id,
        client: s.client.name,
        text: `Factura ${f.number}, ${money(f.amount, f.currency)}`,
        when: days < 0 ? `Vencida ${relDays(days)}` : relDays(days)[0].toUpperCase() + relDays(days).slice(1),
        tone: days < 0 ? 'crit' : 'plain',
        kind: 'cobro',
        rank: days + 0.5,
      });
    }
    const quiet = s.issues.find((i) => i.kind === 'contact');
    if (quiet) out.push({ key: `c:${s.client.id}`, clientId: s.client.id, client: s.client.name, text: quiet.text, when: 'Seguimiento', tone: 'warn', kind: 'seguimiento', rank: horizonDays + 1 });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// ---------------------------------------------------------------- inputs
/**
 * Reads an amount typed the Colombian way or the plain way:
 * "4.200.000" → 4200000, "1.250,50" → 1250.5, "1250.5" → 1250.5, "" → null.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  let normalized: string;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.').replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '');
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Amount as it shows in an input ("4.200.000", "1.250,5"). */
export const amountInput = (n: number | null | undefined) => (n == null ? '' : grouped.format(n));
