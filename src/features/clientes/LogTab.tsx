// Ficha · Bitácora: every interaction with the client, newest first, plus its invoices.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { differenceInCalendarDays, format, isSameDay, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CircleCheck, FileText, Flag, Mail, NotebookPen, Phone, Video, type LucideIcon } from 'lucide-react';
import { Card, CardHead } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { ClientLog, LogKind } from '@/data/types';
import { hhmm } from '@/lib/format';
import { dayKey, fromDayKey } from '@/lib/time';
import { LogDialog } from './dialogs';
import { CHANNEL_LABEL, invoiceState, LOG_KINDS, logKindLabel, money, type ClientSummary } from './model';

export const LOG_ICON: Record<LogKind, LucideIcon> = {
  reunion: Video,
  llamada: Phone,
  correo: Mail,
  decision: Flag,
  entrega: CircleCheck,
  nota: NotebookPen,
};

type Filter = 'todo' | LogKind | 'factura';
type Item =
  | { type: 'log'; at: Date; log: ClientLog }
  | { type: 'invoice'; at: Date; id: string; title: string; body: string; tone: 'lime' | 'amber' | 'crit'; label: string };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function dayHeading(d: Date, now: Date) {
  const long = format(d, "EEEE d 'de' MMMM", { locale: es });
  if (isSameDay(d, now)) return `Hoy · ${long}`;
  if (isSameDay(d, subDays(now, 1))) return `Ayer · ${long}`;
  return cap(long) + (d.getFullYear() !== now.getFullYear() ? ` de ${d.getFullYear()}` : '');
}

export function LogTab({ s, now }: { s: ClientSummary; now: Date }) {
  const { client } = s;
  const [params, setParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<LogKind>('reunion');
  const [filter, setFilter] = useState<Filter>('todo');
  const [editing, setEditing] = useState<ClientLog | null>(null);

  // "Registrar interacción" in the header lands here with the field focused.
  useEffect(() => {
    if (!params.has('registrar')) return;
    inputRef.current?.focus();
    setParams({ tab: 'bitacora' }, { replace: true });
  }, [params, setParams]);

  const create = useApiMutation((api, v: { title: string; kind: LogKind }) => api.createClientLog({ client_id: client.id, ...v }), [qk.clientLogs]);

  const items = useMemo<Item[]>(() => {
    const logs: Item[] = s.logs.map((log) => ({ type: 'log', at: new Date(log.occurred_at), log }));
    const invoices: Item[] = s.invoices.map((f) => {
      const state = invoiceState(f, now);
      return {
        type: 'invoice',
        at: new Date(fromDayKey(f.issued_on).getTime() + 12 * 3_600_000),
        id: f.id,
        title: `Factura ${f.number} emitida`,
        body: [f.concept, money(f.amount, f.currency), f.due_on && !f.paid_on ? `vence el ${format(fromDayKey(f.due_on), "d 'de' MMMM", { locale: es })}` : ''].filter(Boolean).join(' · '),
        tone: state === 'pagada' ? 'lime' : state === 'vencida' ? 'crit' : 'amber',
        label: state === 'pagada' ? `Pagada · ${format(fromDayKey(f.paid_on!), 'd MMM', { locale: es }).replace('.', '')}` : state === 'vencida' ? 'Vencida' : 'Pendiente',
      };
    });
    return [...logs, ...invoices].sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [s.logs, s.invoices, now]);

  const counts = new Map<Filter, number>();
  for (const it of items) {
    const k: Filter = it.type === 'log' ? it.log.kind : 'factura';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const visible = items.filter((it) => filter === 'todo' || (it.type === 'log' ? it.log.kind === filter : filter === 'factura'));

  // Group by local day.
  const groups: { key: string; day: Date; items: Item[] }[] = [];
  for (const it of visible) {
    const key = dayKey(it.at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(it);
    else groups.push({ key, day: it.at, items: [it] });
  }

  const decisions = s.logs.filter((l) => l.kind === 'decision').slice(0, 6);
  const contacts = s.logs.filter((l) => l.kind !== 'nota');
  const monthCount = contacts.filter((l) => new Date(l.occurred_at) >= startOfMonth(now)).length;
  const recent = contacts.filter((l) => new Date(l.occurred_at) >= subDays(now, 90)).map((l) => new Date(l.occurred_at).getTime());
  const avgGap = recent.length > 1 ? Math.round((Math.max(...recent) - Math.min(...recent)) / 86_400_000 / (recent.length - 1)) : null;
  const lastDays = s.lastContact ? differenceInCalendarDays(now, new Date(s.lastContact.occurred_at)) : null;

  return (
    <div className="cl-cols">
      <div className="cl-stack" style={{ gap: 18 }}>
        <form
          className="cl-capture"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || create.isPending) return;
            create.mutate({ title: title.trim(), kind }, { onSuccess: () => setTitle('') });
          }}
        >
          <span className="capture-icon"><NotebookPen size={17} /></span>
          <input
            ref={inputRef}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`¿Qué pasó con ${client.name}? Reunión, llamada, decisión…`}
            aria-label="Nueva interacción"
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="Tipo de interacción">
            {LOG_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <button type="submit" disabled={!title.trim() || create.isPending} className="os-button os-button-primary inline-flex h-[34px] items-center rounded-full px-3.5 text-[13px] disabled:opacity-40">
            Guardar
          </button>
        </form>

        {items.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button type="button" className="cl-chip" aria-pressed={filter === 'todo'} onClick={() => setFilter('todo')}>
              Todo <span>· {items.length}</span>
            </button>
            {LOG_KINDS.filter((k) => counts.get(k.value)).map((k) => (
              <button key={k.value} type="button" className="cl-chip" aria-pressed={filter === k.value} onClick={() => setFilter(k.value)}>
                {k.plural} <span>· {counts.get(k.value)}</span>
              </button>
            ))}
            {counts.get('factura') ? (
              <button type="button" className="cl-chip" aria-pressed={filter === 'factura'} onClick={() => setFilter('factura')}>
                Facturas <span>· {counts.get('factura')}</span>
              </button>
            ) : null}
          </div>
        )}

        <Card as="section" className="!gap-0">
          {groups.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">
              {items.length ? 'Nada de este tipo.' : 'Aún no hay nada. Escribe arriba lo que pasó en tu última reunión, llamada o correo con este cliente.'}
            </p>
          ) : (
            groups.map((g) => (
              <Fragment key={g.key}>
                <div className="cl-day">{dayHeading(g.day, now)}</div>
                {g.items.map((it) =>
                  it.type === 'log' ? (
                    <LogEntry key={it.log.id} log={it.log} onOpen={() => setEditing(it.log)} />
                  ) : (
                    <Link key={it.id} to={`/clientes/${client.id}?tab=facturacion`} replace className="cl-entry">
                      <span className="when">{format(it.at, 'd MMM', { locale: es }).replace('.', '')}</span>
                      <span className="icon-tile"><FileText size={17} /></span>
                      <span>
                        <span className="t">{it.title}</span>
                        <span className="d">{it.body}</span>
                        <span className="mt-2 flex gap-1.5">
                          <span className={`cl-pill ${it.tone === 'lime' ? '' : it.tone === 'crit' ? 'is-crit' : 'is-amber'}`}>Factura · {it.label}</span>
                        </span>
                      </span>
                    </Link>
                  ),
                )}
              </Fragment>
            ))
          )}
        </Card>
      </div>

      <div className="cl-stack">
        <Card as="section" className="gap-3.5">
          <CardHead title="Decisiones clave" />
          {decisions.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Registra una interacción de tipo «Decisión» y quedará aquí a la vista.</p>
          ) : (
            <div className="flex flex-col">
              {decisions.map((d) => (
                <button key={d.id} type="button" className="cl-row items-start text-left" onClick={() => setEditing(d)}>
                  <Flag size={16} className="mt-[3px] shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 text-[14px]">
                    {d.title}
                    <span className="cl-cap block">{format(new Date(d.occurred_at), "d MMM yyyy", { locale: es }).replace('.', '')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card as="section" className="gap-3.5">
          <CardHead title="Ritmo de contacto" />
          <div className="flex flex-col">
            <div className="cl-kv">
              <span>Último contacto</span>
              <span className={s.issues.some((i) => i.kind === 'contact') ? 'cl-amber-ink' : ''}>
                {lastDays == null ? 'Nunca' : lastDays === 0 ? 'Hoy' : lastDays === 1 ? 'Ayer' : `Hace ${lastDays} días`}
              </span>
            </div>
            <div className="cl-kv"><span>Interacciones este mes</span><span className="tnum">{monthCount}</span></div>
            <div className="cl-kv"><span>Promedio entre contactos</span><span className="tnum">{avgGap == null ? '—' : avgGap <= 1 ? '1 día' : `${avgGap} días`}</span></div>
            <div className="cl-kv"><span>Canal preferido</span><span>{client.channel ? CHANNEL_LABEL[client.channel] : '—'}</span></div>
          </div>
          <p className="cl-cap">Las notas no cuentan como contacto. Tras 14 días sin contacto, el cliente pasa a «Necesitan atención».</p>
        </Card>
      </div>

      <LogDialog open={Boolean(editing)} onClose={() => setEditing(null)} log={editing} />
    </div>
  );
}

function LogEntry({ log, onOpen }: { log: ClientLog; onOpen: () => void }) {
  const Icon = LOG_ICON[log.kind];
  const tint =
    log.kind === 'reunion'
      ? { background: 'var(--stay-lilac)', borderColor: 'var(--stay-lilac-line)' }
      : log.kind === 'entrega'
        ? { background: 'var(--stay-lime-soft)', borderColor: 'var(--cl-lime-line)' }
        : undefined;
  return (
    <button type="button" className="cl-entry" onClick={onOpen}>
      <span className="when">{hhmm(new Date(log.occurred_at))}</span>
      <span className="icon-tile" style={tint}><Icon size={17} /></span>
      <span className="min-w-0">
        <span className="t">{log.title}</span>
        {log.body && <span className="d">{log.body}</span>}
        <span className="mt-2 flex gap-1.5">
          <span className={`cl-pill ${log.kind === 'reunion' ? 'is-lilac' : log.kind === 'decision' || log.kind === 'entrega' ? '' : 'is-gray'}`}>{logKindLabel(log.kind)}</span>
        </span>
      </span>
    </button>
  );
}
