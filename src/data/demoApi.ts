// In-memory backend with realistic sample data, so the OS can be explored
// (and checked visually) without a Supabase project or an account.
import { addDays, addMinutes, isWeekend, setHours, setMinutes, startOfDay, startOfMonth, subDays, subMinutes, subSeconds } from 'date-fns';
import type { AccountInput, Api } from './api';
import type {
  AiAccount,
  Board,
  CollectorStatus,
  CollectorToken,
  ModelPrice,
  Note,
  NoteInput,
  Project,
  Task,
  TimeEntry,
  UsageRow,
} from './types';
import { DEFAULT_PRICES } from '@/lib/pricing';
import { SERIES } from '@/lib/palette';
import { dayKey } from '@/lib/time';
import { sketchDataUrl } from './demoSketches';

let seq = 0;
const uid = () => `demo-${Date.now().toString(36)}-${++seq}`;
const iso = (d: Date) => d.toISOString();
const clone = <T>(v: T): T => structuredClone(v);

type Store = {
  projects: Project[];
  tasks: Task[];
  entries: TimeEntry[];
  notes: Note[];
  boards: Board[];
  accounts: AiAccount[];
  prices: ModelPrice[];
  usage: UsageRow[];
  status: CollectorStatus[];
  tokens: CollectorToken[];
};

function seed(now: Date): Store {
  const created = iso(subDays(now, 40));
  const projects: Project[] = ['OS Vena Digital', 'Academia IA', 'Contenidos', 'Podcast', 'Administración'].map((name, i) => ({
    id: uid(),
    name,
    color: SERIES[i],
    archived: false,
    sort: i,
    created_at: created,
  }));
  const [os, academia, contenidos, podcast, admin] = projects;
  const t = (p: Project, name: string): Task => ({ id: uid(), project_id: p.id, name, archived: false, created_at: created });
  const tasks = [
    t(os, 'Diseño de pantallas'),
    t(os, 'Colector de consumo IA'),
    t(academia, 'Clase 4 · grabación'),
    t(academia, 'Clase 5 · guion'),
    t(contenidos, 'Carrusel Instagram'),
    t(contenidos, 'Newsletter'),
    t(podcast, 'Edición episodio 12'),
    t(admin, 'Facturación clientes'),
  ];
  const [diseno, colector, clase4, clase5, carrusel, newsletter, ep12, facturas] = tasks;

  const entries: TimeEntry[] = [];
  const add = (task: Task, start: Date, minutes: number | null) =>
    entries.push({ id: uid(), task_id: task.id, started_at: iso(start), ended_at: minutes == null ? null : iso(addMinutes(start, minutes)) });

  // Today: a running timer plus the sessions before it.
  const runStart = subSeconds(subMinutes(now, 42), 18);
  let cursor = subMinutes(runStart, 70);
  for (const [task, min] of [
    [carrusel, 55],
    [facturas, 10],
    [ep12, 25],
    [clase4, 75],
    [colector, 68],
  ] as const) {
    cursor = subMinutes(cursor, min);
    add(task, cursor, min);
    cursor = subMinutes(cursor, 7);
  }
  add(diseno, runStart, null);

  // Past weekdays (this month and the week before it).
  const plans: [Task, number][][] = [
    [[colector, 120], [clase4, 110], [carrusel, 80], [ep12, 40], [facturas, 20]],
    [[diseno, 90], [clase5, 95], [newsletter, 85], [ep12, 30], [facturas, 40]],
    [[colector, 130], [clase4, 100], [carrusel, 95], [ep12, 60], [facturas, 40]],
    [[diseno, 90], [clase5, 100], [newsletter, 80], [ep12, 60], [facturas, 50]],
    [[colector, 70], [clase4, 85], [carrusel, 60], [ep12, 45], [facturas, 25]],
  ];
  const first = subDays(startOfMonth(now), 7);
  for (let d = startOfDay(first), i = 0; d < startOfDay(now); d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    let at = setMinutes(setHours(d, 8), 30);
    plans[i++ % plans.length].forEach(([task, min], k) => {
      add(task, at, min);
      at = addMinutes(at, min + (k === 2 ? 60 : 10));
    });
  }

  const note = (daysAgo: number, n: Partial<Note> & Pick<Note, 'type'>): Note => ({
    id: uid(),
    body: '',
    url: null,
    link_title: null,
    link_description: null,
    link_image: null,
    link_site: null,
    image_path: null,
    pinned: false,
    done: false,
    due_date: null,
    created_at: iso(subMinutes(subDays(now, daysAgo), 30)),
    updated_at: iso(subDays(now, daysAgo)),
    ...n,
  });
  const notes: Note[] = [
    note(0, { type: 'hacer', body: 'Grabar la clase 5 de Academia IA antes del martes.', pinned: true, due_date: dayKey(addDays(now, 4)) }),
    note(1, { type: 'investigar', body: '¿Cuánto cuesta cada modelo nuevo de Codex? Revisar la tabla de precios de Consumo IA.', pinned: true }),
    note(2, { type: 'nota', body: '“Primero ordenas. Luego automatizas.” Frase para el carrusel del lunes.', pinned: true }),
    note(1, { type: 'link', url: 'https://supabase.com/docs/guides/database/postgres/row-level-security', link_site: 'supabase.com', link_title: 'Row Level Security', link_description: 'Políticas para que cada fila solo la vea su dueña.' }),
    note(1, { type: 'hacer', body: 'Enviar las facturas de agosto a los clientes.' }),
    note(3, { type: 'inspiracion', body: 'Paleta cálida para la landing de Academia: arena, terracota y café.' }),
    note(3, { type: 'investigar', body: 'Excalidraw: ¿exportToBlob sirve para las miniaturas de los tableros?' }),
    note(4, { type: 'nota', body: 'Episodio del podcast: cómo organizo mi semana con IA sin volverme loca.' }),
    note(5, { type: 'link', url: 'https://github.com/excalidraw/excalidraw', link_site: 'github.com', link_title: 'excalidraw/excalidraw', link_description: 'Pizarra open source (MIT) embebida en Tableros.' }),
    note(6, { type: 'hacer', body: 'Revisar métricas de Instagram de agosto.', done: true }),
    note(7, { type: 'inspiracion', body: 'Menos caos, más sistema.' }),
    note(8, { type: 'investigar', body: 'Push en PWA de iOS: ¿qué tan confiables son los avisos?' }),
    note(9, { type: 'link', url: 'https://developer.apple.com/design/human-interface-guidelines', link_site: 'developer.apple.com', link_title: 'Human Interface Guidelines', link_description: 'Referencia de estilo para el OS.' }),
  ];

  const board = (name: string, kind: string, hoursAgo: number, scene: Board['scene'] = {}): Board => ({
    id: uid(),
    name,
    thumbnail: sketchDataUrl(kind),
    scene,
    created_at: iso(subDays(now, 20)),
    updated_at: iso(subMinutes(now, hoursAgo * 60)),
  });
  const boards: Board[] = [
    board('Arquitectura OS Vena', 'arch', 1, { skeleton: ARCH_SKELETON }),
    board('Funnel Academia IA', 'funnel', 26),
    board('Calendario de contenidos', 'calendar', 72),
    board('Flujo n8n · onboarding', 'flow', 220),
    board('Mapa del podcast T2', 'mindmap', 330),
    board('Ideas sueltas', 'loose', 520),
  ];

  const accounts: AiAccount[] = [
    { id: uid(), provider: 'anthropic', email: 'personal@ejemplo.com', label: 'Personal', plan: 'Claude Max 5x', monthly_price: 100, renews_day: 24, color: SERIES[1], created_at: created },
    { id: uid(), provider: 'anthropic', email: 'vena@ejemplo.com', label: 'Vena Digital', plan: 'Claude Pro', monthly_price: 20, renews_day: 17, color: SERIES[2], created_at: created },
    { id: uid(), provider: 'openai', email: null, label: 'ChatGPT Plus', plan: 'ChatGPT Plus', monthly_price: 20, renews_day: 3, color: SERIES[0], created_at: created },
  ];

  const prices: ModelPrice[] = DEFAULT_PRICES.map((p) => ({ ...p, id: uid(), updated_at: created }));

  const usage: UsageRow[] = [];
  const weekdayFactor = [0.25, 1, 1.2, 0.85, 1.35, 0.95, 0.4];
  const row = (day: string, source: UsageRow['source'], account: string, model: string, f: number, t: [number, number, number, number]): UsageRow => ({
    day,
    source,
    account,
    model,
    input_tokens: Math.round(t[0] * f),
    output_tokens: Math.round(t[1] * f),
    cache_read_tokens: Math.round(t[2] * f),
    cache_write_tokens: Math.round(t[3] * f),
    cache_write_1h_tokens: 0,
    messages: Math.round(120 * f),
  });
  for (let d = subDays(startOfMonth(now), 7); d <= now; d = addDays(d, 1)) {
    const wd = d.getDay();
    const f = weekdayFactor[wd] * (0.85 + ((d.getDate() * 7) % 5) / 10);
    const day = dayKey(d);
    usage.push(row(day, 'claude_code', 'personal@ejemplo.com', 'claude-opus-5', f, [80_000, 150_000, 19_000_000, 1_100_000]));
    usage.push(row(day, 'claude_code', 'personal@ejemplo.com', 'claude-haiku-4-5', f, [40_000, 30_000, 2_000_000, 150_000]));
    if (wd === 2 || wd === 4 || wd === 5) usage.push(row(day, 'claude_code', 'vena@ejemplo.com', 'claude-sonnet-5', f, [50_000, 80_000, 8_000_000, 600_000]));
    usage.push(row(day, 'codex', 'demo-chatgpt', 'gpt-5.3-codex', f, [500_000, 100_000, 5_000_000, 0]));
    if (wd === 1 || wd === 3) usage.push(row(day, 'codex', 'demo-chatgpt', 'gpt-5.6-sol', f, [220_000, 40_000, 1_800_000, 0]));
    if (wd === 3) usage.push(row(day, 'codex', 'demo-chatgpt', 'codex-auto-review', f, [30_000, 5_000, 200_000, 0]));
  }

  return {
    projects,
    tasks,
    entries,
    notes,
    boards,
    accounts,
    prices,
    usage,
    status: [{ machine: 'MacBook Pro', last_seen_at: iso(subMinutes(now, 3)), current_account: 'personal@ejemplo.com', version: '1.0.0' }],
    tokens: [{ id: uid(), label: 'MacBook Pro', created_at: created, last_used_at: iso(subMinutes(now, 3)), revoked_at: null }],
  };
}

// Excalidraw element skeleton for the demo "Arquitectura OS Vena" board.
const ARCH_SKELETON = [
  { type: 'text', x: 60, y: 20, text: 'Arquitectura v1', fontSize: 36, fontFamily: 2 },
  { type: 'rectangle', x: 60, y: 160, width: 240, height: 100, backgroundColor: '#ffffff', label: { text: 'MacBook · colector\nlee ~/.claude y ~/.codex', fontFamily: 2 } },
  { type: 'rectangle', x: 460, y: 140, width: 260, height: 140, backgroundColor: '#b2f2bb', label: { text: 'Supabase\nPostgres · Auth · Storage', fontFamily: 2 } },
  { type: 'rectangle', x: 860, y: 40, width: 250, height: 100, backgroundColor: '#a5d8ff', label: { text: 'App web · Hostinger', fontFamily: 2 } },
  { type: 'rectangle', x: 860, y: 300, width: 250, height: 100, backgroundColor: '#a5d8ff', label: { text: 'iPhone · PWA', fontFamily: 2 } },
  { type: 'arrow', x: 305, y: 210, width: 150, height: 0, label: { text: 'cada 5 min', fontFamily: 2 } },
  { type: 'arrow', x: 855, y: 95, width: -130, height: 90 },
  { type: 'arrow', x: 855, y: 345, width: -130, height: -95 },
  { type: 'rectangle', x: 470, y: 360, width: 230, height: 110, backgroundColor: '#ffec99', label: { text: '¿Qué más medimos?', fontFamily: 2 } },
];

const later = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

export function createDemoApi(): Api {
  const s = seed(new Date());
  const timerListeners = new Set<() => void>();
  const notifyTimer = () => timerListeners.forEach((fn) => fn());

  return {
    mode: 'demo',

    // ---------- Tiempo ----------
    listProjects: async () => later(clone(s.projects).sort((a, b) => a.sort - b.sort)),
    async createProject(input) {
      const p: Project = { id: uid(), archived: false, sort: s.projects.length, created_at: iso(new Date()), ...input };
      s.projects.push(p);
      return later(clone(p));
    },
    async updateProject(id, patch) {
      Object.assign(s.projects.find((p) => p.id === id) ?? {}, patch);
      return later(undefined);
    },
    async deleteProject(id) {
      const taskIds = new Set(s.tasks.filter((t) => t.project_id === id).map((t) => t.id));
      s.entries = s.entries.filter((e) => !taskIds.has(e.task_id));
      s.tasks = s.tasks.filter((t) => t.project_id !== id);
      s.projects = s.projects.filter((p) => p.id !== id);
      return later(undefined);
    },
    listTasks: async () => later(clone(s.tasks)),
    async createTask(input) {
      const t: Task = { id: uid(), archived: false, created_at: iso(new Date()), ...input };
      s.tasks.push(t);
      return later(clone(t));
    },
    async updateTask(id, patch) {
      Object.assign(s.tasks.find((t) => t.id === id) ?? {}, patch);
      return later(undefined);
    },
    async deleteTask(id) {
      s.entries = s.entries.filter((e) => e.task_id !== id);
      s.tasks = s.tasks.filter((t) => t.id !== id);
      return later(undefined);
    },
    async listEntries(from, to) {
      const list = s.entries.filter((e) => new Date(e.started_at) < to && (!e.ended_at || new Date(e.ended_at) > from));
      return later(clone(list).sort((a, b) => b.started_at.localeCompare(a.started_at)));
    },
    runningEntry: async () => later(clone(s.entries.find((e) => !e.ended_at) ?? null)),
    async startTimer(taskId) {
      const now = iso(new Date());
      for (const e of s.entries) if (!e.ended_at) e.ended_at = now;
      const e: TimeEntry = { id: uid(), task_id: taskId, started_at: now, ended_at: null };
      s.entries.push(e);
      notifyTimer();
      return later(clone(e));
    },
    async stopTimer() {
      const now = iso(new Date());
      for (const e of s.entries) if (!e.ended_at) e.ended_at = now;
      notifyTimer();
      return later(undefined);
    },
    async updateEntry(id, patch) {
      Object.assign(s.entries.find((e) => e.id === id) ?? {}, patch);
      notifyTimer();
      return later(undefined);
    },
    async deleteEntry(id) {
      s.entries = s.entries.filter((e) => e.id !== id);
      return later(undefined);
    },
    subscribeTimer(onChange) {
      timerListeners.add(onChange);
      return () => timerListeners.delete(onChange);
    },

    // ---------- Notas ----------
    listNotes: async () => later(clone(s.notes).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    async createNote(input: NoteInput) {
      const now = iso(new Date());
      const n: Note = {
        id: uid(),
        type: 'nota',
        body: '',
        url: null,
        link_title: null,
        link_description: null,
        link_image: null,
        link_site: null,
        image_path: null,
        pinned: false,
        done: false,
        due_date: null,
        created_at: now,
        updated_at: now,
        ...input,
      };
      s.notes.push(n);
      return later(clone(n));
    },
    async updateNote(id, patch) {
      Object.assign(s.notes.find((n) => n.id === id) ?? {}, patch, { updated_at: iso(new Date()) });
      return later(undefined);
    },
    async deleteNote(id) {
      s.notes = s.notes.filter((n) => n.id !== id);
      return later(undefined);
    },
    async linkPreview(url) {
      try {
        return later({ site: new URL(url).hostname.replace(/^www\./, '') });
      } catch {
        return later({});
      }
    },
    async uploadNoteImage(file) {
      // Demo: keep the image in memory as a data URL.
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return data;
    },
    async noteImageUrls(paths) {
      return Object.fromEntries(paths.map((p) => [p, p]));
    },

    // ---------- Tableros ----------
    listBoards: async () =>
      later(
        s.boards
          .map(({ scene: _scene, ...b }) => clone(b))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      ),
    async getBoard(id) {
      const b = s.boards.find((x) => x.id === id);
      if (!b) throw new Error('Tablero no encontrado');
      return later(clone(b));
    },
    async createBoard(name) {
      const now = iso(new Date());
      const b: Board = { id: uid(), name, scene: {}, thumbnail: null, created_at: now, updated_at: now };
      s.boards.push(b);
      const { scene: _scene, ...summary } = b;
      return later(clone(summary));
    },
    async updateBoard(id, patch) {
      Object.assign(s.boards.find((b) => b.id === id) ?? {}, patch, { updated_at: iso(new Date()) });
      return later(undefined);
    },
    async deleteBoard(id) {
      s.boards = s.boards.filter((b) => b.id !== id);
      return later(undefined);
    },

    // ---------- Consumo IA ----------
    listUsage: async (fromDay, toDay) => later(clone(s.usage.filter((r) => r.day >= fromDay && r.day < toDay))),
    listPrices: async () => later(clone(s.prices).sort((a, b) => a.model.localeCompare(b.model))),
    async upsertPrice(input) {
      const existing = s.prices.find((p) => p.model === input.model);
      if (existing) Object.assign(existing, input, { updated_at: iso(new Date()) });
      else s.prices.push({ ...input, id: uid(), updated_at: iso(new Date()) });
      return later(undefined);
    },
    async seedPrices(inputs) {
      for (const input of inputs) if (!s.prices.some((p) => p.model === input.model)) s.prices.push({ ...input, id: uid(), updated_at: iso(new Date()) });
      return later(undefined);
    },
    async deletePrice(id) {
      s.prices = s.prices.filter((p) => p.id !== id);
      return later(undefined);
    },
    listAccounts: async () => later(clone(s.accounts)),
    async createAccount(input: AccountInput) {
      const a: AiAccount = { id: uid(), created_at: iso(new Date()), ...input };
      s.accounts.push(a);
      return later(clone(a));
    },
    async updateAccount(id, patch) {
      Object.assign(s.accounts.find((a) => a.id === id) ?? {}, patch);
      return later(undefined);
    },
    async deleteAccount(id) {
      s.accounts = s.accounts.filter((a) => a.id !== id);
      return later(undefined);
    },
    listCollectorStatus: async () => later(clone(s.status)),
    listCollectorTokens: async () => later(clone(s.tokens)),
    async createCollectorToken(label) {
      s.tokens.unshift({ id: uid(), label, created_at: iso(new Date()), last_used_at: null, revoked_at: null });
      return later('vos_demo-token-no-sirve-fuera-del-modo-demo');
    },
    async revokeCollectorToken(id) {
      Object.assign(s.tokens.find((t) => t.id === id) ?? {}, { revoked_at: iso(new Date()) });
      return later(undefined);
    },
  };
}
