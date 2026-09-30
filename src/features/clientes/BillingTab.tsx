// Ficha · Facturación: agreement, what was billed and collected, and the invoice list.
import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Briefcase, CircleCheck, Clock3, FileText, Plus, Receipt } from 'lucide-react';
import { Button, Card, CardHead, Empty, Menu, Segmented } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { Invoice } from '@/data/types';
import { dayKey, fromDayKey } from '@/lib/time';
import { AgreementList } from './ClientePage';
import { InvoiceDialog, type InvoiceDraft } from './dialogs';
import { hm, invoiceState, money, monthBilling, relDays, type ClientSummary } from './model';

type Filter = 'todas' | 'pendientes' | 'pagadas';
const short = (key: string) => format(fromDayKey(key), 'd MMM yyyy', { locale: es }).replace('.', '');

export function BillingTab({ s, now, draft, onEdit }: { s: ClientSummary; now: Date; draft: InvoiceDraft; onEdit: () => void }) {
  const { client } = s;
  const [filter, setFilter] = useState<Filter>('todas');
  const [dialog, setDialog] = useState<{ open: boolean; invoice?: Invoice; draft?: InvoiceDraft }>({ open: false });
  const markPaid = useApiMutation((api, v: { id: string; paid_on: string | null }) => api.updateInvoice(v.id, { paid_on: v.paid_on }), [qk.invoices]);
  const remove = useApiMutation((api, id: string) => api.deleteInvoice(id), [qk.invoices], 'No se pudo borrar');

  const cur = client.currency;
  const same = s.invoices.filter((f) => f.currency === cur);
  const year = String(now.getFullYear());
  const thisYear = same.filter((f) => f.issued_on.startsWith(year));
  const billed = thisYear.reduce((t, f) => t + f.amount, 0);
  const collected = thisYear.filter((f) => f.paid_on).reduce((t, f) => t + f.amount, 0);
  const paidDelays = thisYear.filter((f) => f.paid_on).map((f) => differenceInCalendarDays(fromDayKey(f.paid_on!), fromDayKey(f.issued_on)));
  const avgDelay = paidDelays.length ? Math.round(paidDelays.reduce((a, b) => a + b, 0) / paidDelays.length) : null;
  const pending = same.filter((f) => !f.paid_on).sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  const pendingTotal = pending.reduce((t, f) => t + f.amount, 0);
  const overdue = pending.filter((f) => invoiceState(f, now) === 'vencida');
  const others = s.invoices.length - same.length;

  // What this month's work adds to bill, by kind of agreement.
  const month = now.toLocaleDateString('es-CO', { month: 'long' });
  const b = monthBilling(client, s.monthMinutes);
  let hint: { text: string; draft?: InvoiceDraft } | null = null;
  if (client.agreement === 'retainer' && b.extraMinutes > 0) {
    hint = b.toBill
      ? { text: `${hm(b.extraMinutes)} por encima del retainer este mes: ${money(b.toBill, cur)} en horas extra.`, draft: { ...draft, concept: `Horas extra de ${month} (${hm(b.extraMinutes)})`, amount: Math.round(b.toBill) } }
      : { text: `${hm(b.extraMinutes)} por encima del retainer este mes. Pon el valor de la hora extra en el acuerdo para calcularlas.` };
  } else if (client.agreement === 'horas' && s.monthMinutes > 0) {
    hint = { text: `${hm(s.monthMinutes)} trabajadas en ${month} × ${money(client.fee, cur)} = ${money(b.toBill ?? 0, cur)} por facturar.`, draft };
  } else if (client.agreement === 'proyecto' && client.fee > 0) {
    const all = same.reduce((t, f) => t + f.amount, 0);
    hint =
      all < client.fee
        ? { text: `Facturado ${money(all, cur)} de ${money(client.fee, cur)} (${Math.round((all / client.fee) * 100)} %). Faltan ${money(client.fee - all, cur)}.`, draft }
        : { text: `Proyecto facturado completo: ${money(all, cur)}.` };
  }

  const rows = s.invoices.filter((f) => (filter === 'todas' ? true : filter === 'pagadas' ? f.paid_on : !f.paid_on));

  return (
    <>
      <div className="cl-billing-top">
        <Card as="section" className="cl-lilac gap-3.5">
          <CardHead title="Acuerdo vigente" right={<button type="button" className="cl-link" onClick={onEdit}>Editar</button>} />
          <AgreementList client={client} />
        </Card>
        <section className="cl-tile">
          <div className="metric-label"><span className="icon-tile"><Receipt size={17} /></span>Facturado en {year}</div>
          <div className="cl-tile-value">{money(billed, cur)}</div>
          <div className="cl-cap">{thisYear.length} {thisYear.length === 1 ? 'factura' : 'facturas'}{others ? ` · ${others} en otra moneda` : ''}</div>
        </section>
        <section className="cl-tile cl-lime">
          <div className="metric-label"><span className="icon-tile"><CircleCheck size={17} /></span>Cobrado</div>
          <div className="cl-tile-value">{money(collected, cur)}</div>
          <div className="cl-cap">{avgDelay == null ? 'Sin pagos este año' : `Pago promedio a ${avgDelay} días de emitida`}</div>
        </section>
        <section className={`cl-tile ${pending.length ? 'cl-amber' : ''}`}>
          <div className="metric-label"><span className="icon-tile"><Clock3 size={17} /></span>Pendiente de cobro</div>
          <div className={`cl-tile-value ${pending.length ? 'cl-amber-ink' : ''}`}>{money(pendingTotal, cur)}</div>
          <div className={`cl-cap ${overdue.length ? 'cl-crit-ink' : pending.length ? 'cl-amber-ink' : ''}`}>
            {pending.length === 0
              ? 'Nada pendiente'
              : overdue.length
                ? `${overdue.length} ${overdue.length === 1 ? 'vencida' : 'vencidas'}`
                : `${pending.length} ${pending.length === 1 ? 'factura' : 'facturas'}${pending[0].due_on ? ` · vence ${relDays(differenceInCalendarDays(fromDayKey(pending[0].due_on), now))}` : ''}`}
          </div>
        </section>
      </div>

      {hint && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-plane px-4 py-3 text-[14px] text-ink-2">
          <Briefcase size={17} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">{hint.text}</span>
          {hint.draft && (
            <Button size="sm" onClick={() => setDialog({ open: true, draft: hint!.draft })}>
              Crear factura
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <h2 className="text-[16px] font-medium">Facturas</h2>
          <Segmented
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'pendientes', label: 'Pendientes' },
              { value: 'pagadas', label: 'Pagadas' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDialog({ open: true, draft })}>
          Nueva factura
        </Button>
      </div>

      <Card as="section" className="!p-0">
        {rows.length === 0 ? (
          <div className="p-6">
            <Empty icon={<FileText size={26} />} title={s.invoices.length ? 'Nada con ese filtro' : 'Sin facturas todavía'}>
              Registra cada factura que emitas: número, monto, vencimiento y cuándo te pagaron. Aquí no se cobra nada, solo se lleva la cuenta.
            </Empty>
          </div>
        ) : (
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th style={{ width: '34%' }}>Concepto</th>
                  <th>Emitida</th>
                  <th>Vence</th>
                  <th className="is-num">Monto</th>
                  <th>Estado</th>
                  <th style={{ width: 44 }}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const state = invoiceState(f, now);
                  const dueDays = f.due_on ? differenceInCalendarDays(fromDayKey(f.due_on), now) : null;
                  return (
                    <tr key={f.id}>
                      <td>
                        <button type="button" className="cl-cell-link tnum" onClick={() => setDialog({ open: true, invoice: f })}>
                          {f.number}
                        </button>
                      </td>
                      <td>{f.concept || <span className="text-ink-3">—</span>}</td>
                      <td className="tnum whitespace-nowrap">{short(f.issued_on)}</td>
                      <td className={`tnum whitespace-nowrap ${state === 'vencida' ? 'cl-crit-ink' : state === 'pendiente' ? 'cl-amber-ink' : ''}`}>{f.due_on ? short(f.due_on) : '—'}</td>
                      <td className="is-num font-medium">{money(f.amount, f.currency)}</td>
                      <td>
                        {state === 'pagada' ? (
                          <span className="cl-pill is-lime">Pagada · {format(fromDayKey(f.paid_on!), 'd MMM', { locale: es }).replace('.', '')}</span>
                        ) : state === 'vencida' ? (
                          <span className="cl-pill is-crit">Vencida {relDays(dueDays!)}</span>
                        ) : (
                          <span className="cl-pill is-amber">Pendiente{dueDays != null ? ` · ${relDays(dueDays)}` : ''}</span>
                        )}
                      </td>
                      <td>
                        <Menu
                          items={[
                            f.paid_on
                              ? { label: 'Marcar como pendiente', onSelect: () => markPaid.mutate({ id: f.id, paid_on: null }) }
                              : { label: 'Marcar pagada hoy', onSelect: () => markPaid.mutate({ id: f.id, paid_on: dayKey(now) }) },
                            { label: 'Editar', onSelect: () => setDialog({ open: true, invoice: f }) },
                            { label: 'Borrar', danger: true, onSelect: () => confirm(`¿Borrar la factura ${f.number}?`) && remove.mutate(f.id) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InvoiceDialog open={dialog.open} onClose={() => setDialog({ open: false })} client={client} invoice={dialog.invoice} draft={dialog.draft} />
    </>
  );
}
