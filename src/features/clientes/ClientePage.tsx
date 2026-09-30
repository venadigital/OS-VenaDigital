// Ficha de un cliente: cabecera, pestañas y la pestaña Resumen.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { CalendarClock, Clock3, FileText, Gauge, Plus, Sparkles, Users, Wallet } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, CardHead, Empty, Menu, Skeleton } from '@/components/ui';
import { qk, useApiMutation, usePrices, useSessions } from '@/data/hooks';
import type { Client, ClientLog, Invoice, Project } from '@/data/types';
import { usd } from '@/lib/format';
import { norm } from '@/lib/text';
import { projectForFolder, sessionCost } from '@/lib/pricing';
import { dayKey, fromDayKey } from '@/lib/time';
import { avatarStyle } from './ClientesPage';
import { ClientDialog, InvoiceDialog, type InvoiceDraft } from './dialogs';
import {
  AGREEMENT_LABEL,
  CHANNEL_LABEL,
  dayLabel,
  hm,
  hoursGauge,
  initials,
  logKindLabel,
  money,
  monthBilling,
  nextInvoiceNumber,
  relDays,
  STATUS_LABEL,
  useClientsData,
  valuePerHour,
  type ClientSummary,
} from './model';
import { BillingTab } from './BillingTab';
import { LogTab, LOG_ICON } from './LogTab';
import { TasksTab, useTaskTotals } from './TasksTab';
import './clientes.css';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'tareas', label: 'Proyecto y tareas' },
  { id: 'bitacora', label: 'Bitácora' },
  { id: 'facturacion', label: 'Facturación' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function ClientePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as Tab) : 'resumen';
  const data = useClientsData();
  const s = data.summaries.find((x) => x.client.id === id);
  const [editing, setEditing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const setStatus = useApiMutation((api, v: { id: string; status: Client['status'] }) => api.updateClient(v.id, { status: v.status }), [qk.clients]);
  const remove = useApiMutation((api, cid: string) => api.deleteClient(cid), [qk.clients, qk.clientLogs, qk.invoices], 'No se pudo borrar');

  if (data.loading) {
    return (
      <Page>
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64" />
      </Page>
    );
  }
  if (!s) {
    return (
      <Page>
        <Empty icon={<Users size={28} />} title="Cliente no encontrado" action={<Link to="/clientes" className="cl-link">Volver a Clientes</Link>}>
          Puede que lo hayas borrado.
        </Empty>
      </Page>
    );
  }

  const { client } = s;
  const draft = invoiceDraft(s, data.invoices, data.now);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="cl-breadcrumb flex items-center gap-[7px]">
            <Link to="/clientes">Clientes</Link>
            <span>›</span>
            <span>{client.name}</span>
          </span>
        }
        title={
          <span className="cl-title-row">
            <span className="cl-avatar is-lg" style={avatarStyle(s.project?.color)}>{initials(client.name)}</span>
            <span className="min-w-0">{client.name}</span>
            <span className="flex gap-1.5">
              <span className={client.status === 'activo' ? 'cl-pill is-lime' : 'cl-pill is-gray'}>{STATUS_LABEL[client.status]}</span>
              <span className="cl-pill is-lilac">{AGREEMENT_LABEL[client.agreement]}</span>
            </span>
          </span>
        }
        right={
          <>
            <Button icon={<FileText size={16} />} onClick={() => setInvoiceOpen(true)}>
              Nueva factura
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate(`/clientes/${client.id}?tab=bitacora&registrar=1`, { replace: true })}>
              Registrar interacción
            </Button>
            <Menu
              items={[
                { label: 'Editar cliente', onSelect: () => setEditing(true) },
                client.status === 'activo'
                  ? { label: 'Poner en pausa', onSelect: () => setStatus.mutate({ id: client.id, status: 'pausa' }) }
                  : { label: 'Marcar como activo', onSelect: () => setStatus.mutate({ id: client.id, status: 'activo' }) },
                ...(client.status !== 'cerrado' ? [{ label: 'Cerrar cliente', onSelect: () => setStatus.mutate({ id: client.id, status: 'cerrado' as const }) }] : []),
                {
                  label: 'Borrar cliente',
                  danger: true,
                  onSelect: () =>
                    confirm(`¿Borrar "${client.name}" con su bitácora y sus facturas? El proyecto y las horas en Tiempo se conservan.`) &&
                    remove.mutate(client.id, { onSuccess: () => navigate('/clientes') }),
                },
              ]}
            />
          </>
        }
      />

      <nav className="cl-tabs" aria-label="Secciones del cliente">
        {TABS.map((t) => (
          <Link key={t.id} to={t.id === 'resumen' ? `/clientes/${client.id}` : `/clientes/${client.id}?tab=${t.id}`} className="cl-tab" aria-current={tab === t.id ? 'page' : undefined} replace>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'resumen' && <Summary s={s} now={data.now} from={data.from} to={data.to} projects={data.projects} onEdit={() => setEditing(true)} />}
      {tab === 'tareas' && <TasksTab s={s} now={data.now} from={data.from} to={data.to} clients={data.summaries.map((x) => x.client)} />}
      {tab === 'bitacora' && <LogTab s={s} now={data.now} />}
      {tab === 'facturacion' && <BillingTab s={s} now={data.now} draft={draft} onEdit={() => setEditing(true)} />}

      <ClientDialog open={editing} onClose={() => setEditing(false)} client={client} clients={data.summaries.map((x) => x.client)} projects={data.projects} />
      <InvoiceDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} client={client} draft={draft} />
    </Page>
  );
}

/** Suggested number, concept and amount for the next invoice of this client. */
export function invoiceDraft(s: ClientSummary, all: Invoice[], now: Date): InvoiceDraft {
  const { client } = s;
  const month = now.toLocaleDateString('es-CO', { month: 'long' });
  const number = nextInvoiceNumber(all, now);
  if (client.agreement === 'retainer') {
    // This month's retainer already billed: suggest next month's.
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('es-CO', { month: 'long' });
    const billed = s.invoices.some((f) => norm(f.concept) === norm(`Retainer de ${month}`));
    return { number, concept: `Retainer de ${billed ? next : month}`, amount: client.fee || null };
  }
  if (client.agreement === 'horas') {
    const hours = Math.round((s.monthMinutes / 60) * 100) / 100;
    return { number, concept: `Horas de ${month} (${hm(s.monthMinutes)})`, amount: hours * client.fee || null };
  }
  const billed = s.invoices.filter((f) => f.currency === client.currency).reduce((t, f) => t + f.amount, 0);
  return { number, concept: '', amount: client.fee > billed ? client.fee - billed : null };
}

// ---------------------------------------------------------------- Resumen
function Summary({ s, now, from, to, projects, onEdit }: { s: ClientSummary; now: Date; from: Date; to: Date; projects: Project[]; onEdit: () => void }) {
  const { client } = s;
  const totals = useTaskTotals(s, now);
  const sessionsQ = useSessions(from, to);
  const pricesQ = usePrices();
  const ai = useMemo(() => {
    let cost = 0;
    let n = 0;
    let unpriced = false;
    if (!s.project) return { cost, n, unpriced };
    for (const x of sessionsQ.data ?? []) {
      if (projectForFolder(x.project, projects)?.id !== s.project.id) continue;
      const c = sessionCost(x, pricesQ.data ?? []);
      cost += c.cost;
      unpriced ||= c.unpriced;
      n++;
    }
    return { cost, n, unpriced };
  }, [sessionsQ.data, pricesQ.data, projects, s.project]);

  const included = client.agreement === 'retainer' && client.included_hours ? client.included_hours * 60 : null;
  const over = included != null && s.monthMinutes > included;
  const gauge = hoursGauge(client, s.monthMinutes, totals.loading ? null : totals.total);
  const perHour = valuePerHour(client, s.monthMinutes, totals.total);
  const billing = monthBilling(client, s.monthMinutes);
  const pending = s.invoices.filter((f) => !f.paid_on && f.currency === client.currency).sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  const deliverables = s.tasks.filter((t) => !t.archived && t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 4);
  const monthByTask = totals.month;

  // Linear pace: when the retainer runs out at this month's rhythm.
  let runsOut: string | null = null;
  if (included && !over && s.monthMinutes > 60) {
    const elapsed = (now.getTime() - from.getTime()) / 86_400_000;
    const perDay = s.monthMinutes / Math.max(1, elapsed);
    const day = new Date(from.getTime() + (included / perDay) * 86_400_000);
    if (day < to) runsOut = dayLabel(dayKey(day));
  }

  return (
    <>
      <div className="cl-tiles">
        <Tile icon={<Clock3 size={17} />} label={gauge?.label ?? 'Horas este mes'} className="cl-lilac">
          <div className="cl-tile-value">{hm(gauge?.used ?? s.monthMinutes)}</div>
          {gauge ? (
            <>
              <div className={`cl-track ${gauge.over ? 'is-over' : ''}`}><i style={{ width: `${Math.min(100, (gauge.used / gauge.cap) * 100)}%` }} /></div>
              <div className={`cl-cap ${gauge.over ? 'cl-amber-ink' : ''}`}>
                {included
                  ? gauge.over
                    ? `${hm(gauge.used - gauge.cap)} por encima de ${hm(gauge.cap)}`
                    : `de ${hm(gauge.cap)} · quedan ${hm(gauge.cap - gauge.used)}`
                  : gauge.over
                    ? `${hm(gauge.used - gauge.cap)} por encima de las ${hm(gauge.cap)} estimadas`
                    : `de ${hm(gauge.cap)} estimadas · ${hm(s.monthMinutes)} este mes`}
              </div>
            </>
          ) : (
            <div className="cl-cap">
              {!s.project
                ? 'Une un proyecto de Tiempo'
                : client.agreement === 'horas'
                  ? `Por facturar este mes: ${money(billing.toBill ?? 0, client.currency)}`
                  : client.agreement === 'proyecto'
                    ? `${hm(totals.total)} en total · sin horas estimadas`
                    : `${hm(totals.total)} en total`}
            </div>
          )}
        </Tile>
        <Tile icon={<Gauge size={17} />} label={included ? 'Retainer consumido' : 'Valor por hora'}>
          {included ? (
            <>
              <div className="cl-tile-value">{Math.round((s.monthMinutes / included) * 100)} %</div>
              <div className="cl-cap">{over ? `Hora extra: ${billing.toBill != null ? money(billing.toBill, client.currency) : 'sin tarifa'}` : runsOut ? `A este ritmo se agota el ${runsOut}` : perHour ? `${money(perHour, client.currency)} por hora trabajada` : 'Aún sin horas este mes'}</div>
            </>
          ) : (
            <>
              <div className="cl-tile-value">{perHour ? money(perHour, client.currency) : '—'}</div>
              <div className="cl-cap">{client.agreement === 'proyecto' ? 'Valor del proyecto entre horas totales' : client.agreement === 'horas' ? 'Tarifa acordada por hora' : 'Tarifa mensual entre horas del mes'}</div>
            </>
          )}
        </Tile>
        <Tile icon={<Sparkles size={17} />} label="Costo de IA del mes" className="cl-lime">
          <div className="cl-tile-value">{usd(ai.cost)}</div>
          <div className="cl-cap">
            {!s.project ? 'Sin proyecto unido' : ai.n ? `USD · ${ai.n} ${ai.n === 1 ? 'sesión' : 'sesiones'} en la carpeta${ai.unpriced ? ' · hay modelos sin precio' : ''}` : `Sin sesiones en la carpeta ${s.project.folder ?? s.project.name}`}
          </div>
        </Tile>
        <Tile icon={<Wallet size={17} />} label="Pendiente de cobro" className={pending.length ? 'cl-amber' : ''}>
          <div className={`cl-tile-value ${pending.length ? 'cl-amber-ink' : ''}`}>{money(s.pendingAmount, client.currency)}</div>
          <div className={`cl-cap ${pending.length ? 'cl-amber-ink' : ''}`}>
            {pending.length === 0
              ? 'Todo cobrado'
              : `${pending.length} ${pending.length === 1 ? 'factura' : 'facturas'}${pending[0].due_on ? ` · vence ${relDays(differenceInCalendarDays(fromDayKey(pending[0].due_on), now))}` : ''}`}
          </div>
        </Tile>
      </div>

    <div className="cl-cols">
      <div className="cl-stack">
        <Card as="section">
          <CardHead title="Próximos entregables" right={<Link className="cl-link" to={`/clientes/${client.id}?tab=tareas`} replace>Ver proyecto y tareas</Link>} />
          {deliverables.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">{s.project ? 'Ninguna tarea abierta tiene fecha de entrega. Pónsela en Proyecto y tareas.' : 'Une un proyecto de Tiempo para ver sus tareas aquí.'}</p>
          ) : (
            <div className="flex flex-col">
              {deliverables.map((t) => {
                const days = differenceInCalendarDays(fromDayKey(t.due_date!), now);
                const minutes = monthByTask.get(t.id) ?? 0;
                return (
                  <div key={t.id} className="cl-row">
                    <span className="icon-tile"><CalendarClock size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{t.name}</span>
                      <span className="cl-cap">{minutes ? `${hm(minutes)} este mes` : 'Sin tiempo este mes'}</span>
                    </span>
                    <span className={days < 0 ? 'cl-pill is-crit' : days <= 3 ? 'cl-pill is-amber' : 'cl-pill is-gray'}>
                      {dayLabel(t.due_date!)} · {relDays(days)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card as="section">
          <CardHead title="Últimas interacciones" right={<Link className="cl-link" to={`/clientes/${client.id}?tab=bitacora`} replace>Ver bitácora</Link>} />
          {s.logs.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Aún no hay interacciones. Registra reuniones, llamadas, correos y decisiones en la Bitácora.</p>
          ) : (
            <div className="flex flex-col">
              {s.logs.slice(0, 3).map((l) => (
                <LogRow key={l.id} log={l} now={now} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="cl-stack">
        <Card as="section" className="gap-3.5">
          <CardHead title="Contacto" right={<button type="button" className="cl-link" onClick={onEdit}>Editar</button>} />
          {client.contact_name && (
            <div className="flex items-center gap-3">
              <span className="cl-avatar" style={{ width: 40, height: 40, borderRadius: 99, fontSize: 12, background: 'var(--note-inspiracion)' }}>{initials(client.contact_name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-medium">{client.contact_name}</span>
                {client.contact_role && <span className="cl-cap">{client.contact_role}</span>}
              </span>
            </div>
          )}
          <div className="flex flex-col">
            <Kv k="Empresa" v={client.company} />
            <Kv k="Correo" v={client.email && <a className="cl-link" href={`mailto:${client.email}`}>{client.email}</a>} />
            <Kv k="Teléfono" v={client.phone && <a className="cl-link" href={waLink(client.phone, client.channel === 'whatsapp')}>{client.phone}</a>} />
            <Kv k="Canal preferido" v={client.channel && CHANNEL_LABEL[client.channel]} />
            <Kv k="Ciudad" v={client.city} />
            <Kv k="Cliente desde" v={client.since && fromDayKey(client.since).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })} />
          </div>
          {!client.contact_name && !client.email && !client.phone && <p className="text-[13px] text-ink-3">Sin datos de contacto todavía.</p>}
        </Card>

        <Card as="section" className="cl-lilac gap-3.5">
          <CardHead title="Acuerdo vigente" right={<Link className="cl-link" to={`/clientes/${client.id}?tab=facturacion`} replace>Ver facturación</Link>} />
          <AgreementList client={client} />
        </Card>

        {client.notes && (
          <Card as="section" className="gap-3">
            <CardHead title="Notas" />
            <p className="text-[14px] whitespace-pre-line text-ink-2">{client.notes}</p>
          </Card>
        )}
      </div>
    </div>
    </>
  );
}

function waLink(phone: string, whatsapp: boolean) {
  const digits = phone.replace(/[^\d]/g, '');
  return whatsapp && digits ? `https://wa.me/${digits}` : `tel:${phone.replace(/\s/g, '')}`;
}

export function AgreementList({ client }: { client: Client }) {
  const c = client.currency;
  return (
    <div className="flex flex-col">
      <Kv k="Tipo" v={AGREEMENT_LABEL[client.agreement]} />
      <Kv
        k={client.agreement === 'retainer' ? 'Tarifa' : client.agreement === 'horas' ? 'Valor de la hora' : 'Valor del proyecto'}
        v={`${money(client.fee, c)}${client.agreement === 'retainer' ? ' / mes' : ''} ${c}`}
      />
      {client.agreement === 'retainer' && <Kv k="Incluye" v={client.included_hours != null ? `${hm(client.included_hours * 60)} al mes` : null} />}
      {client.agreement === 'retainer' && <Kv k="Hora extra" v={client.extra_hour_rate != null ? money(client.extra_hour_rate, c) : null} />}
      {client.agreement === 'proyecto' && <Kv k="Horas estimadas" v={client.estimated_hours != null ? hm(client.estimated_hours * 60) : null} />}
      <Kv k="Facturación" v={client.billing_day ? `El día ${client.billing_day} · vence a ${client.payment_terms_days} días` : `Vence a ${client.payment_terms_days} días`} />
    </div>
  );
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  if (v == null || v === '' || v === false) return null;
  return (
    <div className="cl-kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Tile({ icon, label, className, children }: { icon: ReactNode; label: string; className?: string; children: ReactNode }) {
  return (
    <section className={`cl-tile ${className ?? ''}`}>
      <div className="metric-label"><span className="icon-tile">{icon}</span>{label}</div>
      {children}
    </section>
  );
}

export function LogRow({ log, now }: { log: ClientLog; now: Date }) {
  const Icon = LOG_ICON[log.kind];
  const days = differenceInCalendarDays(now, new Date(log.occurred_at));
  return (
    <div className="cl-row">
      <span className="icon-tile" style={log.kind === 'reunion' ? { background: 'var(--stay-lilac)', borderColor: 'var(--stay-lilac-line)' } : undefined}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{log.title}</span>
        <span className="cl-cap block truncate">{log.body || logKindLabel(log.kind)}</span>
      </span>
      <span className="cl-cap shrink-0">{days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : new Date(log.occurred_at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</span>
    </div>
  );
}

