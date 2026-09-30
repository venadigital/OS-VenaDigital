import { describe, expect, it } from 'vitest';
import type { Client, ClientLog, Invoice, Task, TimeEntry } from '@/data/types';
import { healthOf, invoiceState, issuesFor, lastContact, minutesFor, money, monthBilling, nextInvoiceNumber, summarize, todayItems, valuePerHour } from './model';

const now = new Date(2026, 8, 29, 11, 0); // lunes 29 sep 2026, 11:00
const iso = (d: number, h = 10, m = 0) => new Date(2026, 8, d, h, m).toISOString();

const client = (patch: Partial<Client> = {}): Client => ({
  id: 'c1',
  name: 'Clínica Andina',
  status: 'activo',
  project_id: 'p1',
  contact_name: null,
  contact_role: null,
  company: null,
  email: null,
  phone: null,
  channel: null,
  city: null,
  since: null,
  notes: '',
  agreement: 'retainer',
  currency: 'COP',
  fee: 4_200_000,
  included_hours: 30,
  extra_hour_rate: 180_000,
  estimated_hours: null,
  ai_keywords: [],
  logo_path: null,
  billing_day: 1,
  payment_terms_days: 15,
  created_at: iso(1),
  updated_at: iso(1),
  ...patch,
});
const task = (id: string, patch: Partial<Task> = {}): Task => ({ id, project_id: 'p1', name: id, archived: false, due_date: null, created_at: iso(1), ...patch });
const log = (d: number, kind: ClientLog['kind'] = 'reunion'): ClientLog => ({ id: `l${d}`, client_id: 'c1', kind, title: 't', body: '', occurred_at: iso(d), created_at: iso(d) });
const inv = (patch: Partial<Invoice>): Invoice => ({
  id: 'f1',
  client_id: 'c1',
  number: '2026-001',
  concept: '',
  issued_on: '2026-09-01',
  due_on: '2026-09-16',
  amount: 100,
  currency: 'COP',
  paid_on: null,
  created_at: iso(1),
  updated_at: iso(1),
  ...patch,
});

describe('clientes · dinero y facturas', () => {
  it('formats pesos without decimals and other currencies with their symbol', () => {
    expect(money(4_200_000)).toBe('$4.200.000');
    expect(money(1250.5, 'USD')).toBe('US$1.250,5');
    expect(money(900, 'EUR')).toBe('€900');
  });

  it('tells paid, overdue and pending invoices apart', () => {
    expect(invoiceState(inv({ paid_on: '2026-09-10' }), now)).toBe('pagada');
    expect(invoiceState(inv({}), now)).toBe('vencida');
    expect(invoiceState(inv({ due_on: '2026-09-29' }), now)).toBe('pendiente');
    expect(invoiceState(inv({ due_on: null }), now)).toBe('pendiente');
  });

  it('suggests the next invoice number of the year', () => {
    expect(nextInvoiceNumber([inv({ number: '2026-013' }), inv({ number: '2026-014' }), inv({ number: '2025-090' })], now)).toBe('2026-015');
    expect(nextInvoiceNumber([inv({ number: '2025-090', issued_on: '2025-12-01' })], now)).toBe('2026-001');
    expect(nextInvoiceNumber([inv({ number: 'FV-0099' })], now)).toBe('FV-0100');
    expect(nextInvoiceNumber([], now)).toBe('2026-001');
  });
});

describe('clientes · horas y acuerdo', () => {
  const entries: TimeEntry[] = [
    { id: 'e1', task_id: 'a', started_at: iso(28, 9), ended_at: iso(28, 11) },
    { id: 'e2', task_id: 'b', started_at: iso(28, 12), ended_at: iso(28, 13) },
    { id: 'e3', task_id: 'z', started_at: iso(28, 14), ended_at: iso(28, 18) },
    { id: 'e4', task_id: 'a', started_at: iso(29, 10, 30), ended_at: null },
  ];

  it('adds only the client tasks and counts the running timer up to now', () => {
    const from = new Date(2026, 8, 1);
    const to = new Date(2026, 9, 1);
    expect(minutesFor(entries, new Set(['a', 'b']), from, to, now)).toBe(120 + 60 + 30);
  });

  it('prices extra retainer hours and hourly work', () => {
    expect(monthBilling(client(), 32 * 60)).toEqual({ extraMinutes: 120, toBill: 360_000 });
    expect(monthBilling(client(), 10 * 60)).toEqual({ extraMinutes: 0, toBill: 0 });
    expect(monthBilling(client({ agreement: 'horas', fee: 180_000 }), 90).toBill).toBe(270_000);
    expect(monthBilling(client({ agreement: 'proyecto' }), 600).toBill).toBeNull();
  });

  it('works out the income per hour for each kind of agreement', () => {
    expect(valuePerHour(client(), 20 * 60, 0)).toBe(210_000);
    expect(valuePerHour(client({ agreement: 'proyecto', fee: 18_000_000 }), 0, 90 * 60)).toBe(200_000);
    expect(valuePerHour(client({ agreement: 'horas', fee: 150_000 }), 0, 0)).toBe(150_000);
    expect(valuePerHour(client(), 10, 0)).toBeNull();
  });
});

describe('clientes · salud', () => {
  it('ignores notes when looking for the last contact', () => {
    expect(lastContact([log(20), log(25, 'nota'), log(22, 'correo')])?.id).toBe('l22');
  });

  it('flags late deliveries, overdue invoices, retainer overuse and silence', () => {
    const issues = issuesFor(client(), {
      tasks: [task('Beta', { due_date: '2026-09-26' }), task('Hecha', { due_date: '2026-09-01', archived: true }), task('Luego', { due_date: '2026-10-02' })],
      invoices: [inv({})],
      logs: [log(10)],
      monthMinutes: 31 * 60,
      now,
    });
    expect(issues.map((i) => i.kind)).toEqual(['invoice', 'task', 'retainer', 'contact']);
    expect(issues[1].text).toBe('Beta: entrega vencida hace 3 días');
    expect(issues[3].text).toBe('Sin contacto hace 19 días');
    expect(healthOf(client(), issues)).toBe('crit');
  });

  it('keeps paused clients quiet and healthy ones green', () => {
    const quiet = { tasks: [task('Beta', { due_date: '2026-09-01' })], invoices: [], logs: [], monthMinutes: 0, now };
    expect(issuesFor(client({ status: 'pausa' }), quiet)).toEqual([]);
    expect(healthOf(client({ status: 'pausa' }), [])).toBe('off');
    expect(healthOf(client(), issuesFor(client({ created_at: iso(28) }), { ...quiet, tasks: [] }))).toBe('ok');
  });

  it('lists what is due this week on Inicio, late first', () => {
    const [s] = summarize([client()], {
      projects: [{ id: 'p1', name: 'Clínica Andina', color: '#000', archived: false, sort: 0, created_at: iso(1) }],
      tasks: [task('Landing', { due_date: '2026-10-02' }), task('Beta', { due_date: '2026-09-27' }), task('Lejos', { due_date: '2026-11-01' })],
      logs: [log(28)],
      invoices: [inv({ due_on: '2026-10-05' })],
      monthEntries: [],
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
      now,
    });
    expect(s.nextDue?.name).toBe('Beta');
    const items = todayItems([s], now);
    expect(items.map((i) => i.text)).toEqual(['Beta', 'Landing', 'Factura 2026-001, $100']);
    expect(items[0]).toMatchObject({ tone: 'crit', when: 'Vencida hace 2 días' });
  });
});

describe('clientes · montos escritos', () => {
  it('reads thousands separators and decimal commas', async () => {
    const { parseAmount, amountInput } = await import('./model');
    expect(parseAmount('4.200.000')).toBe(4_200_000);
    expect(parseAmount('$ 1.250,50')).toBe(1250.5);
    expect(parseAmount('1250.5')).toBe(1250.5);
    expect(parseAmount('180000')).toBe(180_000);
    expect(parseAmount('')).toBeNull();
    expect(amountInput(4_200_000)).toBe('4.200.000');
    expect(parseAmount(amountInput(1250.5))).toBe(1250.5);
  });
});

describe('clientes · barra de horas e iniciales', () => {
  it('builds initials without emoji or symbols', async () => {
    const { initials } = await import('./model');
    expect(initials('👩🏽 Diana Boldizar')).toBe('DB');
    expect(initials('🎾 CDAF')).toBe('CD');
    expect(initials('🧠 Pinares Mind Health')).toBe('PM');
    expect(initials('Clínica de la Sabana')).toBe('CS');
    expect(initials('Ñandú')).toBe('ÑA');
    expect(initials('🔥')).toBe('·');
  });

  it('measures a bar only against a limit', async () => {
    const { hoursGauge } = await import('./model');
    expect(hoursGauge(client(), 20 * 60, null)).toEqual({ label: 'Horas este mes', used: 1200, cap: 1800, over: false });
    const project = client({ agreement: 'proyecto', estimated_hours: 80 });
    expect(hoursGauge(project, 10 * 60, 90 * 60)).toEqual({ label: 'Horas del proyecto', used: 5400, cap: 4800, over: true });
    expect(hoursGauge(project, 10 * 60, null)).toBeNull();
    expect(hoursGauge(client({ agreement: 'proyecto' }), 600, 600)).toBeNull();
    expect(hoursGauge(client({ agreement: 'horas', fee: 70_000 }), 600, 600)).toBeNull();
  });

  it('warns when a project goes past its estimate', () => {
    const base = { tasks: [], invoices: [], logs: [log(28)], monthMinutes: 0, now };
    const project = client({ agreement: 'proyecto', included_hours: null, estimated_hours: 20 });
    expect(issuesFor(project, { ...base, totalMinutes: 21 * 60 }).map((i) => i.text)).toEqual(['Proyecto por encima de lo estimado: 21 h de 20 h']);
    expect(issuesFor(project, { ...base, totalMinutes: 19 * 60 })).toEqual([]);
  });
});

describe('clientes · carpetas de IA', () => {
  const project = (id: string, name: string, folder: string | null = null) => ({ id, name, color: '#000', archived: false, sort: 0, folder, created_at: iso(1) });
  const projects = [project('pd', '👩🏽 Diana Boldizar'), project('pp', '🧠 Pinares'), project('pc', '🎾 CDAF'), project('po', 'OS Vena Digital')];
  const diana = client({ id: 'd', name: '👩🏽 Diana Boldizar', project_id: 'pd' });
  const pinares = client({ id: 'p', name: '🧠 Pinares Mind Health', project_id: 'pp' });
  const cdaf = client({ id: 'c', name: '🎾 CDAF', project_id: 'pc' });

  it('takes the first meaningful word of the name as the default keyword', async () => {
    const { defaultKeywords, parseKeywords } = await import('./model');
    expect(defaultKeywords('👩🏽 Diana Boldizar')).toEqual(['Diana']);
    expect(defaultKeywords('🧠 Pinares Mind Health')).toEqual(['Pinares']);
    expect(defaultKeywords('🎾 CDAF')).toEqual(['CDAF']);
    expect(defaultKeywords('La Clínica del Sur')).toEqual(['Clínica']);
    expect(parseKeywords('Diana, Danluwi ,, diana ;Pinates')).toEqual(['Diana', 'Danluwi', 'Pinates']);
  });

  it('assigns real folder names to their client', async () => {
    const { clientForFolder } = await import('./model');
    const who = (folder: string) => clientForFolder(folder, [diana, pinares, cdaf], projects)?.id ?? null;
    for (const f of ['Diana Boldizar', 'diana_chatgpt', 'Portada libro Diana', 'Quiz_Landing_Diana', 'DANLUWI - DIANA', 'DIANA PROPUESTA 2']) expect(who(f)).toBe('d');
    for (const f of ['Pinares', 'Planeacion_Pinares', 'CRM_Pinares']) expect(who(f)).toBe('p');
    expect(who('Centro de Control CDAF')).toBe('c');
    for (const f of ['Danluwi', 'Pinates prueba', 'Daniela_Parra', 'OS Vena Digital', 'Guiones']) expect(who(f)).toBeNull();
  });

  it('uses the extra keywords and prefers the longest match', async () => {
    const { clientForFolder } = await import('./model');
    const d2 = { ...diana, ai_keywords: ['Diana', 'Danluwi'] };
    const p2 = { ...pinares, ai_keywords: ['Pinares', 'Pinates'] };
    expect(clientForFolder('Danluwi', [d2, p2], projects)?.id).toBe('d');
    expect(clientForFolder('Pinates prueba', [d2, p2], projects)?.id).toBe('p');
    const general = client({ id: 'g', name: 'Diana', project_id: null, ai_keywords: ['Diana'] });
    const specific = client({ id: 's', name: 'Libro', project_id: null, ai_keywords: ['Libro Diana'] });
    expect(clientForFolder('Portada libro Diana', [general, specific], [])?.id).toBe('s');
  });
});
