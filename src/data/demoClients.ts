// Sample clients for the demo backend: each one with its Tiempo project, tasks,
// time entries, interactions and invoices.
import { addDays, addMinutes, isWeekend, setHours, setMinutes, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import type { Client, ClientLog, Invoice, LogKind, Project, Task, TimeEntry } from './types';
import { dayKey } from '@/lib/time';

type Seeded = { clients: Client[]; logs: ClientLog[]; invoices: Invoice[] };

type Plan = {
  client: Omit<Client, 'id' | 'project_id' | 'created_at' | 'updated_at' | 'notes' | 'contact_role' | 'company' | 'city' | 'phone' | 'email' | 'channel'> &
    Partial<Pick<Client, 'contact_role' | 'company' | 'city' | 'phone' | 'email' | 'channel' | 'notes'>>;
  color: string;
  /** name, due in days (null: none), done, minutes per weekday this month */
  tasks: [string, number | null, boolean, number][];
  logs: [number, string, LogKind, string, string][]; // days ago, HH:mm, kind, title, body
};

const PLANS: Plan[] = [
  {
    client: {
      name: 'Clínica Andina',
      status: 'activo',
      contact_name: 'Mariana Pérez',
      contact_role: 'Directora de comunicaciones',
      company: 'Clínica Andina S.A.S.',
      email: 'mariana@clinica.test',
      phone: '+57 300 000 0000',
      channel: 'whatsapp',
      city: 'Medellín',
      since: null,
      agreement: 'retainer',
      currency: 'COP',
      fee: 4_200_000,
      included_hours: 30,
      extra_hour_rate: 180_000,
      billing_day: 1,
      payment_terms_days: 15,
    },
    color: '#91b6c8',
    tasks: [
      ['Landing de citas', 3, false, 25],
      ['Integración con Google Calendar', 16, false, 18],
      ['Newsletter de octubre', 21, false, 0],
      ['Ajustes SEO', null, false, 12],
      ['Reunión mensual y seguimiento', null, false, 5],
      ['Rediseño de la home', -17, true, 0],
    ],
    logs: [
      [0, '09:30', 'reunion', 'Revisión de la landing de citas', 'Aprobaron el flujo de reserva. Piden botón de WhatsApp en la versión móvil.'],
      [2, '16:10', 'correo', 'Propuesta de newsletter enviada', 'Mariana confirma que el newsletter arranca en octubre.'],
      [3, '11:00', 'entrega', 'Ajustes SEO, fase 1', 'Entregado en la carpeta de Drive. Pendiente de feedback.'],
      [5, '15:20', 'decision', 'La integración con Google Calendar se cobra como hora extra', 'Acordado en la llamada con Mariana.'],
      [5, '15:00', 'llamada', 'Llamada con Mariana', 'Alcance de la integración con Google Calendar.'],
      [7, '18:40', 'nota', 'Idea para la sede nueva', 'Proponer un paquete de contenidos para la apertura de la nueva sede.'],
    ],
  },
  {
    client: {
      name: 'Taller Norte',
      status: 'activo',
      contact_name: 'Andrés Gómez',
      contact_role: 'Fundador',
      channel: 'correo',
      city: 'Bogotá',
      since: null,
      agreement: 'proyecto',
      currency: 'COP',
      fee: 18_000_000,
      included_hours: null,
      extra_hour_rate: null,
      billing_day: null,
      payment_terms_days: 15,
    },
    color: '#bad780',
    tasks: [
      ['Diseño final del sitio', 8, false, 30],
      ['Identidad visual', -20, true, 0],
    ],
    logs: [[5, '10:15', 'correo', 'Envío de la propuesta de home', 'Andrés pide dos variantes de color para el encabezado.']],
  },
  {
    client: {
      name: 'Estudio Mora',
      status: 'activo',
      contact_name: 'Camila Mora',
      contact_role: 'Socia',
      channel: 'reunion',
      city: 'Cali',
      since: null,
      agreement: 'proyecto',
      currency: 'COP',
      fee: 24_000_000,
      included_hours: null,
      extra_hour_rate: null,
      billing_day: null,
      payment_terms_days: 30,
    },
    color: '#9d87c0',
    tasks: [
      ['Entrega beta de la app', -3, false, 55],
      ['Pruebas con usuarios', 14, false, 15],
    ],
    logs: [[3, '14:00', 'reunion', 'Seguimiento de la beta', 'Faltan los pagos en línea; se mueve la entrega una semana.']],
  },
  {
    client: {
      name: 'Café Lumbre',
      status: 'activo',
      contact_name: 'Julián Rojas',
      channel: 'llamada',
      city: 'Pereira',
      since: null,
      agreement: 'retainer',
      currency: 'COP',
      fee: 1_800_000,
      included_hours: 12,
      extra_hour_rate: 120_000,
      billing_day: 1,
      payment_terms_days: 10,
    },
    color: '#c7ae94',
    tasks: [
      ['Calendario de contenidos', 7, false, 25],
      ['Piezas para redes', null, false, 15],
    ],
    logs: [[1, '17:30', 'llamada', 'Llamada con Julián', 'Quiere sumar historias diarias en octubre.']],
  },
  {
    client: {
      name: 'Fundación Raíces',
      status: 'activo',
      contact_name: 'Lucía Herrera',
      channel: 'correo',
      city: 'Manizales',
      since: null,
      agreement: 'horas',
      currency: 'COP',
      fee: 180_000,
      included_hours: null,
      extra_hour_rate: null,
      billing_day: null,
      payment_terms_days: 15,
    },
    color: '#c9a1b6',
    tasks: [['Asesoría de campaña', null, false, 10]],
    logs: [[16, '09:00', 'reunion', 'Diagnóstico de la campaña', 'Enviar propuesta de piezas antes de fin de mes.']],
  },
  {
    client: {
      name: 'Librería Sur',
      status: 'pausa',
      contact_name: 'Tomás Vélez',
      channel: 'correo',
      city: 'Medellín',
      since: null,
      agreement: 'retainer',
      currency: 'COP',
      fee: 1_500_000,
      included_hours: 10,
      extra_hour_rate: 110_000,
      billing_day: 1,
      payment_terms_days: 15,
      notes: 'Retoma en noviembre.',
    },
    color: '#699775',
    tasks: [['Catálogo de temporada', null, false, 0]],
    logs: [[34, '12:00', 'correo', 'Pausa hasta noviembre', 'Retoman cuando cierre la temporada escolar.']],
  },
];

export function seedClients(
  now: Date,
  uid: () => string,
  store: { projects: Project[]; tasks: Task[]; entries: TimeEntry[] },
): Seeded {
  const iso = (d: Date) => d.toISOString();
  const created = iso(subMonths(now, 7));
  const clients: Client[] = [];
  const logs: ClientLog[] = [];
  const bills: Omit<Invoice, 'number'>[] = [];

  const invoice = (client: Client, concept: string, issued: Date, amount: number, paidAfter: number | null) => {
    const due = addDays(issued, client.payment_terms_days);
    const paid = paidAfter == null ? null : addDays(issued, paidAfter);
    bills.push({
      id: uid(),
      client_id: client.id,
      concept,
      issued_on: dayKey(issued),
      due_on: dayKey(due),
      amount,
      currency: client.currency,
      paid_on: paid && paid <= now ? dayKey(paid) : null,
      created_at: iso(issued),
      updated_at: iso(issued),
    });
  };

  PLANS.forEach((plan, i) => {
    const project: Project = { id: uid(), name: plan.client.name, color: plan.color, archived: false, sort: 10 + i, created_at: created };
    store.projects.push(project);
    const client: Client = {
      contact_role: null,
      company: null,
      city: null,
      phone: null,
      email: null,
      channel: null,
      notes: '',
      ...plan.client,
      since: dayKey(subMonths(startOfMonth(now), 6 - i)),
      id: uid(),
      project_id: project.id,
      created_at: created,
      updated_at: created,
    };
    clients.push(client);

    const tasks = plan.tasks.map(([name, due, done]) => {
      const t: Task = { id: uid(), project_id: project.id, name, archived: done, due_date: due == null ? null : dayKey(addDays(now, due)), created_at: created };
      store.tasks.push(t);
      return t;
    });

    // Late-afternoon client work on every past weekday of the month.
    let k = 0;
    for (let d = startOfMonth(now); d < startOfDay(now); d = addDays(d, 1)) {
      if (isWeekend(d)) continue;
      let at = setMinutes(setHours(d, 17), i * 10);
      plan.tasks.forEach(([, , , minutes], j) => {
        if (!minutes) return;
        const m = minutes + ((k + j) % 3) * 5;
        store.entries.push({ id: uid(), task_id: tasks[j].id, started_at: iso(at), ended_at: iso(addMinutes(at, m)) });
        at = addMinutes(at, m + 2);
      });
      k++;
    }
    // Done tasks carry time from earlier months.
    plan.tasks.forEach(([, , done], j) => {
      if (!done) return;
      for (let w = 1; w <= 6; w++) {
        const at = setHours(subDays(startOfMonth(now), w * 3), 10);
        store.entries.push({ id: uid(), task_id: tasks[j].id, started_at: iso(at), ended_at: iso(addMinutes(at, 180 + w * 20)) });
      }
    });

    for (const [ago, hm, kind, title, body] of plan.logs) {
      const [h, m] = hm.split(':').map(Number);
      const at = setMinutes(setHours(subDays(now, ago), h), m);
      logs.push({ id: uid(), client_id: client.id, kind, title, body, occurred_at: iso(at > now ? now : at), created_at: iso(at > now ? now : at) });
    }
  });

  const [andina, taller, mora, lumbre, raices] = clients;
  const month = (d: Date) => d.toLocaleDateString('es-CO', { month: 'long' });
  for (let back = 6; back >= 1; back--) {
    const issued = startOfMonth(subMonths(now, back));
    invoice(andina, `Retainer de ${month(issued)}`, issued, andina.fee, 5 + (back % 4) * 3);
  }
  invoice(andina, `Retainer de ${month(now)}`, subDays(now, 8), andina.fee, null);
  invoice(taller, 'Anticipo del proyecto (40 %)', subDays(now, 70), 7_200_000, 4);
  invoice(taller, 'Hito 2: identidad visual (30 %)', subDays(now, 22), 5_400_000, 9);
  invoice(mora, 'Hito 1: diseño de la app (50 %)', subDays(now, 45), 12_000_000, 12);
  invoice(lumbre, `Retainer de ${month(subMonths(now, 1))}`, startOfMonth(subMonths(now, 1)), lumbre.fee, 6);
  invoice(lumbre, `Retainer de ${month(now)}`, subDays(now, 5), lumbre.fee, null);
  invoice(raices, 'Asesoría de agosto (6 h)', startOfMonth(subMonths(now, 1)), 6 * raices.fee, 10);

  const year = now.getFullYear();
  const invoices: Invoice[] = bills
    .sort((a, b) => a.issued_on.localeCompare(b.issued_on))
    .map((b, n) => ({ ...b, number: `${year}-${String(n + 1).padStart(3, '0')}` }))
    .reverse();

  return { clients, logs: logs.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), invoices };
}
