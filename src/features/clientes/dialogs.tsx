// Clientes: create/edit a client, an interaction, an invoice and a client task.
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { qk, useApiMutation } from '@/data/hooks';
import type { Agreement, Client, ClientInput, ClientLog, ClientStatus, ContactChannel, Currency, Invoice, LogKind, Project, Task } from '@/data/types';
import { nextColor } from '@/lib/palette';
import { dayKey } from '@/lib/time';
import { AGREEMENT_LABEL, amountInput, CHANNEL_LABEL, defaultDueDate, LOG_KINDS, parseAmount, STATUS_LABEL } from './model';

const NEW_PROJECT = '__new__';
const blank = (s: string) => (s.trim() ? s.trim() : null);

// ---------------------------------------------------------------- cliente
export function ClientDialog({
  open,
  onClose,
  client,
  clients,
  projects,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client;
  clients: Client[];
  projects: Project[];
  onSaved?: (c: Client) => void;
}) {
  const [f, setF] = useState(() => formOf(client));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (open) setF(formOf(client));
  }, [open, client]);

  // Projects free to link: not archived and not taken by another client.
  const taken = new Set(clients.filter((c) => c.id !== client?.id && c.project_id).map((c) => c.project_id));
  const free = projects.filter((p) => (!p.archived || p.id === client?.project_id) && !taken.has(p.id));

  const save = useApiMutation(
    async (api, v: Form) => {
      let project_id = v.project === NEW_PROJECT ? null : v.project || null;
      if (v.project === NEW_PROJECT) {
        const p = await api.createProject({ name: v.name.trim().slice(0, 80), color: nextColor(projects.map((x) => x.color)) });
        project_id = p.id;
      }
      const input: ClientInput & { name: string } = {
        name: v.name.trim(),
        status: v.status,
        project_id,
        contact_name: blank(v.contact_name),
        contact_role: blank(v.contact_role),
        company: blank(v.company),
        email: blank(v.email),
        phone: blank(v.phone),
        channel: v.channel || null,
        city: blank(v.city),
        since: v.since || null,
        notes: v.notes.trim(),
        agreement: v.agreement,
        currency: v.currency,
        fee: parseAmount(v.fee) ?? 0,
        included_hours: v.agreement === 'retainer' ? parseAmount(v.included_hours) : null,
        extra_hour_rate: v.agreement === 'retainer' ? parseAmount(v.extra_hour_rate) : null,
        estimated_hours: v.agreement === 'proyecto' ? parseAmount(v.estimated_hours) : null,
        billing_day: v.agreement === 'retainer' && v.billing_day ? Math.min(31, Math.max(1, Number(v.billing_day))) : null,
        payment_terms_days: Math.min(180, Math.max(0, Number(v.payment_terms_days) || 0)),
      };
      if (client) {
        await api.updateClient(client.id, input);
        return { ...client, ...input } as Client;
      }
      return api.createClient(input);
    },
    [qk.clients, qk.projects],
  );

  const feeLabel = { retainer: 'Tarifa mensual', proyecto: 'Valor total del proyecto', horas: 'Valor de la hora' }[f.agreement];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate(f, { onSuccess: (c) => { onSaved?.(c); onClose(); } })}>
            {client ? 'Guardar' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <div className="cl-form-grid">
        <div className="is-wide">
          <Field label="Nombre del cliente">
            <Input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Clínica Andina" />
          </Field>
        </div>
        <Field label="Estado">
          <Select value={f.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
            {(Object.keys(STATUS_LABEL) as ClientStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente desde">
          <Input type="date" value={f.since} onChange={(e) => set('since', e.target.value)} />
        </Field>
        <div className="is-wide">
          <Field label="Proyecto en Tiempo" hint="Las horas de las tareas de este proyecto se suman al cliente.">
            <Select value={f.project} onChange={(e) => set('project', e.target.value)}>
              {!client?.project_id && <option value={NEW_PROJECT}>Crear un proyecto nuevo con su nombre</option>}
              {free.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="">Sin proyecto por ahora</option>
            </Select>
          </Field>
        </div>

        <div className="cl-form-section is-wide">Contacto</div>
        <Field label="Nombre">
          <Input value={f.contact_name} maxLength={120} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="Cargo">
          <Input value={f.contact_role} maxLength={120} onChange={(e) => set('contact_role', e.target.value)} />
        </Field>
        <Field label="Empresa (razón social)">
          <Input value={f.company} maxLength={160} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input value={f.city} maxLength={120} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Correo">
          <Input type="email" value={f.email} maxLength={200} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Teléfono o WhatsApp">
          <Input type="tel" value={f.phone} maxLength={60} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Canal preferido">
          <Select value={f.channel} onChange={(e) => set('channel', e.target.value as ContactChannel | '')}>
            <option value="">Sin definir</option>
            {(Object.keys(CHANNEL_LABEL) as ContactChannel[]).map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </Select>
        </Field>

        <div className="cl-form-section is-wide">Acuerdo</div>
        <Field label="Tipo de acuerdo">
          <Select value={f.agreement} onChange={(e) => set('agreement', e.target.value as Agreement)}>
            {(Object.keys(AGREEMENT_LABEL) as Agreement[]).map((a) => (
              <option key={a} value={a}>{AGREEMENT_LABEL[a]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda">
          <Select value={f.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
            <option value="COP">Pesos colombianos (COP)</option>
            <option value="USD">Dólares (USD)</option>
            <option value="EUR">Euros (EUR)</option>
          </Select>
        </Field>
        <Field label={feeLabel}>
          <Input inputMode="decimal" value={f.fee} onChange={(e) => set('fee', e.target.value)} placeholder="0" />
        </Field>
        <Field label="Plazo de pago (días)">
          <Input type="number" min={0} max={180} value={f.payment_terms_days} onChange={(e) => set('payment_terms_days', e.target.value)} />
        </Field>
        {f.agreement === 'proyecto' && (
          <Field label="Horas estimadas" hint="Opcional. Mide las horas reales del proyecto contra este presupuesto.">
            <Input inputMode="decimal" value={f.estimated_hours} onChange={(e) => set('estimated_hours', e.target.value)} placeholder="Ej. 80" />
          </Field>
        )}
        {f.agreement === 'retainer' && (
          <>
            <Field label="Horas incluidas al mes">
              <Input inputMode="decimal" value={f.included_hours} onChange={(e) => set('included_hours', e.target.value)} placeholder="Ej. 30" />
            </Field>
            <Field label="Valor de la hora extra">
              <Input inputMode="decimal" value={f.extra_hour_rate} onChange={(e) => set('extra_hour_rate', e.target.value)} placeholder="Opcional" />
            </Field>
            <Field label="Día de facturación">
              <Input type="number" min={1} max={31} value={f.billing_day} onChange={(e) => set('billing_day', e.target.value)} placeholder="Ej. 1" />
            </Field>
          </>
        )}

        <div className="is-wide">
          <Field label="Notas">
            <Textarea value={f.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} placeholder="Contexto, acuerdos especiales, cómo le gusta trabajar…" />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

type Form = {
  name: string;
  status: ClientStatus;
  project: string;
  contact_name: string;
  contact_role: string;
  company: string;
  email: string;
  phone: string;
  channel: ContactChannel | '';
  city: string;
  since: string;
  notes: string;
  agreement: Agreement;
  currency: Currency;
  fee: string;
  included_hours: string;
  extra_hour_rate: string;
  estimated_hours: string;
  billing_day: string;
  payment_terms_days: string;
};

function formOf(c?: Client): Form {
  return {
    name: c?.name ?? '',
    status: c?.status ?? 'activo',
    project: c ? (c.project_id ?? '') : NEW_PROJECT,
    contact_name: c?.contact_name ?? '',
    contact_role: c?.contact_role ?? '',
    company: c?.company ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    channel: c?.channel ?? '',
    city: c?.city ?? '',
    since: c?.since ?? (c ? '' : dayKey(new Date())),
    notes: c?.notes ?? '',
    agreement: c?.agreement ?? 'retainer',
    currency: c?.currency ?? 'COP',
    fee: c ? amountInput(c.fee) : '',
    included_hours: amountInput(c?.included_hours),
    extra_hour_rate: amountInput(c?.extra_hour_rate),
    estimated_hours: amountInput(c?.estimated_hours),
    billing_day: c?.billing_day ? String(c.billing_day) : '',
    payment_terms_days: String(c?.payment_terms_days ?? 15),
  };
}

// ---------------------------------------------------------------- interacción
const localInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

export function LogDialog({ open, onClose, log }: { open: boolean; onClose: () => void; log: ClientLog | null }) {
  const [kind, setKind] = useState<LogKind>('nota');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [at, setAt] = useState('');
  useEffect(() => {
    if (!open || !log) return;
    setKind(log.kind);
    setTitle(log.title);
    setBody(log.body);
    setAt(localInput(log.occurred_at));
  }, [open, log]);

  const save = useApiMutation((api, v: { id: string; kind: LogKind; title: string; body: string; occurred_at: string }) => api.updateClientLog(v.id, v), [qk.clientLogs]);
  const remove = useApiMutation((api, id: string) => api.deleteClientLog(id), [qk.clientLogs], 'No se pudo borrar');
  if (!log) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Interacción"
      width={520}
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={() => confirm('¿Borrar esta interacción?') && remove.mutate(log.id, { onSuccess: onClose })}>
            Borrar
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!title.trim() || !at || save.isPending}
            onClick={() => save.mutate({ id: log.id, kind, title: title.trim(), body: body.trim(), occurred_at: new Date(at).toISOString() }, { onSuccess: onClose })}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="cl-form-grid">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as LogKind)}>
            {LOG_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha y hora">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <div className="is-wide">
          <Field label="Qué pasó">
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <div className="is-wide">
          <Field label="Detalle">
            <Textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Acuerdos, pendientes, próximos pasos…" />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- factura
export type InvoiceDraft = { number: string; concept: string; amount: number | null };

export function InvoiceDialog({
  open,
  onClose,
  client,
  invoice,
  draft,
}: {
  open: boolean;
  onClose: () => void;
  client: Client;
  invoice?: Invoice;
  /** Suggested values for a new invoice. */
  draft?: InvoiceDraft;
}) {
  const today = dayKey(new Date());
  const [number, setNumber] = useState('');
  const [concept, setConcept] = useState('');
  const [issued, setIssued] = useState(today);
  const [due, setDue] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('COP');
  const [paid, setPaid] = useState(false);
  const [paidOn, setPaidOn] = useState(today);

  useEffect(() => {
    if (!open) return;
    setNumber(invoice?.number ?? draft?.number ?? '');
    setConcept(invoice?.concept ?? draft?.concept ?? '');
    setIssued(invoice?.issued_on ?? today);
    setDue(invoice ? (invoice.due_on ?? '') : defaultDueDate(today, client));
    setDueTouched(Boolean(invoice));
    setAmount(amountInput(invoice?.amount ?? draft?.amount ?? null));
    setCurrency(invoice?.currency ?? client.currency);
    setPaid(Boolean(invoice?.paid_on));
    setPaidOn(invoice?.paid_on ?? today);
  }, [open, invoice, draft, client, today]);

  const save = useApiMutation(
    async (api, v: { number: string; concept: string; issued_on: string; due_on: string | null; amount: number; currency: Currency; paid_on: string | null }) => {
      if (invoice) await api.updateInvoice(invoice.id, v);
      else await api.createInvoice({ ...v, client_id: client.id });
    },
    [qk.invoices],
  );
  const remove = useApiMutation((api, id: string) => api.deleteInvoice(id), [qk.invoices], 'No se pudo borrar');
  const parsed = parseAmount(amount);
  const badDates = Boolean(due && due < issued);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={invoice ? `Factura ${invoice.number}` : 'Nueva factura'}
      width={560}
      footer={
        <>
          {invoice && (
            <Button variant="danger" className="mr-auto" onClick={() => confirm(`¿Borrar la factura ${invoice.number}?`) && remove.mutate(invoice.id, { onSuccess: onClose })}>
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!number.trim() || parsed == null || !issued || badDates || save.isPending}
            onClick={() =>
              save.mutate(
                { number: number.trim(), concept: concept.trim(), issued_on: issued, due_on: due || null, amount: parsed ?? 0, currency, paid_on: paid ? paidOn || today : null },
                { onSuccess: onClose },
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="cl-form-grid">
        <Field label="Número">
          <Input value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} placeholder="2026-001" />
        </Field>
        <Field label="Monto">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            <Select aria-label="Moneda" className="w-[92px] shrink-0" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </div>
        </Field>
        <div className="is-wide">
          <Field label="Concepto">
            <Input value={concept} maxLength={300} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Retainer de octubre" />
          </Field>
        </div>
        <Field label="Emitida">
          <Input
            type="date"
            value={issued}
            onChange={(e) => {
              setIssued(e.target.value);
              if (!dueTouched && e.target.value) setDue(defaultDueDate(e.target.value, client));
            }}
          />
        </Field>
        <Field label="Vence" hint={badDates ? 'Vence antes de emitirse' : `Plazo del cliente: ${client.payment_terms_days} días`}>
          <Input
            type="date"
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              setDueTouched(true);
            }}
          />
        </Field>
        <label className="cl-check">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Pagada
        </label>
        {paid && (
          <Field label="Fecha de pago">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- tarea del cliente
export function ClientTaskDialog({ open, onClose, projectId, task }: { open: boolean; onClose: () => void; projectId: string; task?: Task }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? '');
    setDue(task?.due_date ?? '');
    setDone(Boolean(task?.archived));
  }, [open, task]);

  const save = useApiMutation(
    async (api, v: { name: string; due_date: string | null; archived: boolean }) => {
      if (task) await api.updateTask(task.id, v);
      else await api.createTask({ project_id: projectId, name: v.name, due_date: v.due_date });
    },
    [qk.tasks],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? 'Editar tarea' : 'Nueva tarea'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ name: name.trim(), due_date: due || null, archived: done }, { onSuccess: onClose })}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ej. Landing de citas" />
      </Field>
      <Field label="Fecha de entrega" hint="Con fecha, la tarea aparece como entregable en la ficha y en Inicio.">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      {task && (
        <label className="cl-check">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          Hecha (se archiva en Tiempo)
        </label>
      )}
    </Dialog>
  );
}
