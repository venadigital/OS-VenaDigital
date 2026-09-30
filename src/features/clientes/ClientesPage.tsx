import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, MessagesSquare, Plus, Search, Users } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, Empty, Segmented, Skeleton } from '@/components/ui';
import type { ClientStatus } from '@/data/types';
import { norm } from '@/lib/text';
import { fromDayKey } from '@/lib/time';
import { ClientDialog } from './dialogs';
import { AGREEMENT_LABEL, dayLabel, HEALTH_COLOR, HEALTH_LABEL, hm, hoursGauge, initials, invoiceState, monthBilling, logKindLabel, money, relDays, STATUS_LABEL, useClientsData, type ClientSummary, type HoursGauge } from './model';
import './clientes.css';

type Filter = 'todos' | ClientStatus;

export function ClientesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(() => params.has('nuevo'));
  const { summaries, projects, loading, now } = useClientsData();

  useEffect(() => {
    if (params.has('nuevo')) {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const count = (s: ClientStatus) => summaries.filter((x) => x.client.status === s).length;
  const attention = summaries.filter((s) => s.issues.length > 0);
  const visible = useMemo(() => {
    const q = norm(query.trim());
    return summaries.filter(
      (s) =>
        (filter === 'todos' || s.client.status === filter) &&
        (!q || [s.client.name, s.client.contact_name, s.client.company].some((v) => v && norm(v).includes(q))),
    );
  }, [summaries, filter, query]);

  const options: { value: Filter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'activo', label: 'Activos' },
    { value: 'pausa', label: 'En pausa' },
    { value: 'cerrado', label: 'Cerrados' },
    ...(count('prospecto') ? [{ value: 'prospecto' as Filter, label: 'Prospectos' }] : []),
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={
          summaries.length ? (
            <>
              <span>{count('activo')} {count('activo') === 1 ? 'activo' : 'activos'}</span>
              {count('pausa') > 0 && <><span>·</span><span>{count('pausa')} en pausa</span></>}
              {attention.length > 0 && <><span>·</span><span className="cl-amber-ink">{attention.length} {attention.length === 1 ? 'necesita' : 'necesitan'} atención</span></>}
            </>
          ) : undefined
        }
        title="Clientes"
        right={
          <>
            <Segmented options={options} value={filter} onChange={setFilter} />
            <label className="cl-search">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
            </label>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
              Nuevo cliente
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="cl-grid">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[250px] rounded-[18px]" />)}
        </div>
      ) : summaries.length === 0 ? (
        <Empty
          icon={<Users size={28} />}
          title="Tu primer cliente"
          action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Crear cliente</Button>}
        >
          Cada cliente tiene su ficha: contacto, acuerdo, las tareas de su proyecto en Tiempo, la bitácora de interacciones y sus facturas.
        </Empty>
      ) : (
        <>
          {attention.length > 0 && filter !== 'pausa' && filter !== 'cerrado' && (
            <Card as="section" className="cl-attention cl-lilac">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium">Necesitan atención</h2>
                <span className="cl-cap">Entregas vencidas, facturas vencidas, retainer excedido o sin contacto en 14 días</span>
              </div>
              <div className="cl-attention-grid">
                {attention.slice(0, 6).map((s) => (
                  <Link key={s.client.id} to={`/clientes/${s.client.id}`} className="cl-attention-item">
                    <span className="cl-dot" style={{ background: HEALTH_COLOR[s.health] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{s.client.name}</span>
                      <span className="cl-cap block truncate">{s.issues[0].text}{s.issues.length > 1 ? ` · y ${s.issues.length - 1} más` : ''}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <section className="flex flex-col gap-3.5" aria-label="Lista de clientes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium">{filter === 'todos' ? 'Todos los clientes' : options.find((o) => o.value === filter)?.label}</h2>
              <span className="cl-cap">Ordenados por atención · horas del mes en curso</span>
            </div>
            {visible.length === 0 ? (
              <Empty title="Nada por aquí">Ningún cliente coincide con el filtro o la búsqueda.</Empty>
            ) : (
              <div className="cl-grid">
                {visible.map((s) => (
                  <ClientCard key={s.client.id} s={s} now={now} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ClientDialog
        open={creating}
        onClose={() => setCreating(false)}
        clients={summaries.map((x) => x.client)}
        projects={projects}
        onSaved={(c) => navigate(`/clientes/${c.id}`)}
      />
    </Page>
  );
}

export function avatarStyle(color?: string) {
  return { background: color ? `color-mix(in srgb, ${color} 38%, var(--color-surface))` : 'var(--stay-lilac)' };
}

function ClientCard({ s, now }: { s: ClientSummary; now: Date }) {
  const { client } = s;
  const off = client.status !== 'activo';
  const gauge = hoursGauge(client, s.monthMinutes, s.totalMinutes);
  const dueDays = s.nextDue?.due_date ? differenceInCalendarDays(fromDayKey(s.nextDue.due_date), now) : null;
  const contactDays = s.lastContact ? differenceInCalendarDays(now, new Date(s.lastContact.occurred_at)) : null;
  const pending = s.invoices.filter((f) => !f.paid_on);
  const overdue = pending.some((f) => invoiceState(f, now) === 'vencida');

  const caption =
    client.agreement === 'retainer' && client.included_hours
      ? `${AGREEMENT_LABEL.retainer} · ${hm(client.included_hours * 60)}`
      : client.agreement === 'horas'
        ? `Por horas · ${money(client.fee, client.currency)} / h`
        : `${AGREEMENT_LABEL[client.agreement]} · ${money(client.fee, client.currency)}`;

  return (
    <Link to={`/clientes/${client.id}`} className={off ? 'cl-card is-off' : 'cl-card'}>
      <div className="flex items-center gap-2.5">
        <span className="cl-avatar" style={avatarStyle(s.project?.color)}>{initials(client.name)}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[16px] font-medium ${off ? 'text-ink-2' : 'text-ink'}`}>{client.name}</span>
          <span className="cl-cap block truncate">{off ? `${STATUS_LABEL[client.status]} · ${AGREEMENT_LABEL[client.agreement].toLowerCase()}` : caption}</span>
        </span>
        <span className="cl-dot" style={{ background: HEALTH_COLOR[s.health] }} title={HEALTH_LABEL[s.health]} />
      </div>

      <HoursBlock s={s} gauge={gauge} />

      <div className="cl-meta">
        {s.nextDue && dueDays != null ? (
          <span className={dueDays < 0 ? 'cl-crit-ink' : ''}>
            {dueDays < 0 ? <AlertTriangle size={15} className="!text-[var(--color-crit)]" /> : <CalendarClock size={15} />}
            <span className="truncate">{s.nextDue.name} · {dueDays < 0 ? `vencida ${relDays(dueDays)}` : dayLabel(s.nextDue.due_date!)}</span>
          </span>
        ) : (
          <span><CalendarClock size={15} /><span className="truncate">{s.project ? 'Sin entregables con fecha' : 'Sin proyecto en Tiempo'}</span></span>
        )}
        {s.lastContact && contactDays != null ? (
          <span className={s.issues.some((i) => i.kind === 'contact') ? 'cl-amber-ink' : ''}>
            <MessagesSquare size={15} />
            <span className="truncate">{logKindLabel(s.lastContact.kind)} {contactDays === 0 ? 'hoy' : contactDays === 1 ? 'ayer' : `hace ${contactDays} días`}</span>
          </span>
        ) : (
          <span><MessagesSquare size={15} /><span className="truncate">Sin interacciones registradas</span></span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {off ? (
          <span className="cl-pill is-gray">{STATUS_LABEL[client.status]}</span>
        ) : pending.length ? (
          <span className={overdue ? 'cl-pill is-crit' : 'cl-pill is-amber'}>
            {overdue ? 'Factura vencida' : pending.length === 1 ? 'Factura pendiente' : `${pending.length} facturas pendientes`} · {money(s.pendingAmount, client.currency)}
          </span>
        ) : (
          <span className="cl-pill is-lime"><CircleCheck size={13} /> Facturas al día</span>
        )}
      </div>
    </Link>
  );
}

/**
 * Hours on a card. A bar only when there is a limit (retainer hours, project estimate);
 * hourly clients show what the month is worth instead.
 */
function HoursBlock({ s, gauge }: { s: ClientSummary; gauge: HoursGauge | null }) {
  const { client } = s;
  if (gauge) {
    return (
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="text-ink-2">{gauge.label}</span>
          <span className={`tnum font-medium ${gauge.over ? 'cl-amber-ink' : ''}`}>
            {hm(gauge.used)}
            <span className="font-normal text-ink-3"> de {hm(gauge.cap)}</span>
          </span>
        </div>
        <div className={`cl-track ${gauge.over ? 'is-over' : ''}`}>
          <i style={{ width: `${Math.min(100, (gauge.used / gauge.cap) * 100)}%` }} />
        </div>
      </div>
    );
  }
  const second =
    client.agreement === 'horas'
      ? { k: 'Por facturar este mes', v: money(monthBilling(client, s.monthMinutes).toBill ?? 0, client.currency) }
      : { k: client.agreement === 'proyecto' ? 'Sin horas estimadas' : 'Sin horas incluidas', v: null };
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-2">Horas este mes</span>
        <span className="tnum font-medium">{hm(s.monthMinutes)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-3">{second.k}</span>
        {second.v && <span className="tnum font-medium">{second.v}</span>}
      </div>
    </div>
  );
}
