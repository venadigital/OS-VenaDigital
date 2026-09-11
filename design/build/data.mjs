// Sample data shared by all screens so numbers agree everywhere.
// "Today" is Friday 11 Sep 2026, 14:47:18; the running timer started 14:05.
import { S } from './shared.mjs';

// ---- Tiempo: projects → tasks → sessions ----
export const PROJECTS = [
  { id: 'os', name: 'OS Vena Digital', short: 'OS Vena', color: S[0], today: 110, week: 540 },
  { id: 'academia', name: 'Academia IA', short: 'Academia IA', color: S[1], today: 75, week: 480 },
  { id: 'contenidos', name: 'Contenidos', short: 'Contenidos', color: S[2], today: 55, week: 395 },
  { id: 'podcast', name: 'Podcast', short: 'Podcast', color: S[3], today: 25, week: 215 },
  { id: 'admin', name: 'Administración', short: 'Administración', color: S[4], today: 10, week: 160 },
];
export const proj = (id) => PROJECTS.find((p) => p.id === id);

export const TASKS = [
  { id: 'diseno', project: 'os', name: 'Diseño de pantallas', today: 42, running: true },
  { id: 'colector', project: 'os', name: 'Colector de consumo IA', today: 68 },
  { id: 'clase4', project: 'academia', name: 'Clase 4 · grabación', today: 75 },
  { id: 'clase5', project: 'academia', name: 'Clase 5 · guion', today: 0 },
  { id: 'carrusel', project: 'contenidos', name: 'Carrusel Instagram', today: 55 },
  { id: 'newsletter', project: 'contenidos', name: 'Newsletter', today: 0 },
  { id: 'ep12', project: 'podcast', name: 'Edición episodio 12', today: 25 },
  { id: 'facturas', project: 'admin', name: 'Facturación clientes', today: 10 },
];
export const task = (id) => TASKS.find((t) => t.id === id);
export const RUNNING = { task: 'Diseño de pantallas', project: 'OS Vena Digital', since: '14:05', elapsed: '00:42:18' };

export const TODAY_TOTAL = PROJECTS.reduce((s, p) => s + p.today, 0); // 275
export const WEEK_TOTAL = PROJECTS.reduce((s, p) => s + p.week, 0); // 1790

// Sessions today, oldest first. end=null → running.
export const SESSIONS = [
  { task: 'colector', start: '08:30', end: '09:38', min: 68 },
  { task: 'clase4', start: '09:45', end: '11:00', min: 75 },
  { task: 'ep12', start: '11:10', end: '11:35', min: 25 },
  { task: 'facturas', start: '11:40', end: '11:50', min: 10 },
  { task: 'carrusel', start: '12:00', end: '12:55', min: 55 },
  { task: 'diseno', start: '14:05', end: null, min: 42 },
];
export const NOW = '14:47';

// Minutes per project per weekday (Mon–Sun), stacked in PROJECTS order.
export const WEEK = [
  { d: 'Lun', v: { os: 120, academia: 110, contenidos: 80, podcast: 40, admin: 20 } },
  { d: 'Mar', v: { os: 90, academia: 95, contenidos: 85, podcast: 30, admin: 40 } },
  { d: 'Mié', v: { os: 130, academia: 100, contenidos: 95, podcast: 60, admin: 40 } },
  { d: 'Jue', v: { os: 90, academia: 100, contenidos: 80, podcast: 60, admin: 50 } },
  { d: 'Vie', v: { os: 110, academia: 75, contenidos: 55, podcast: 25, admin: 10 }, today: true },
  { d: 'Sáb', v: {} },
  { d: 'Dom', v: {} },
];

// ---- Consumo IA (1–11 Sep) ----
// Tools (for the per-model table).
export const SRC = {
  cc: { name: 'Claude Code' },
  codex: { name: 'Codex' },
};
// Accounts = chart series, stacked bottom→top in this order.
export const ACCOUNTS = [
  { id: 'personal', name: 'Claude · Personal', color: S[1] },
  { id: 'vena', name: 'Claude · Vena Digital', color: S[2] },
  { id: 'codex', name: 'Codex · ChatGPT Plus', color: S[0] },
];
// [personal, vena, codex] USD per day
export const DAYS = [
  [20.9, 3.2, 2.8], [26.3, 5.1, 4.1], [15.8, 2.4, 3.6], [29.9, 6.9, 5.2], [12.3, 0, 1.1], [6.4, 0, 0],
  [25.3, 4.6, 4.9], [31.4, 9.8, 6.3], [28.25, 5.25, 3.8], [23.3, 4.3, 4.2], [16.95, 4.2, 2.88],
];
export const API_TOTAL = 321.43;
export const SUBS_TOTAL = 140;
export const RATIO = '2,3×';

// tokens in millions; cache = read + write
export const MODELS = [
  { id: 'claude-opus-5', src: 'cc', input: 0.9, output: 1.6, cache: 223, cost: 230.75 },
  { id: 'claude-sonnet-5', src: 'cc', input: 0.6, output: 0.9, cache: 101.5, cost: 45.45 },
  { id: 'claude-haiku-4-5', src: 'cc', input: 0.4, output: 0.3, cache: 23.8, cost: 6.35 },
  { id: 'gpt-5.3-codex', src: 'codex', input: 6.2, output: 1.1, cache: 58, cost: 26.0 },
  { id: 'gpt-5.5', src: 'codex', input: 3.1, output: 0.6, cache: 24, cost: 12.88 },
  { id: 'gpt-5.6-sol', src: 'codex', input: 2.4, output: 0.4, cache: 19, cost: null },
];

export const SUBS = [
  { plan: 'Claude Max 5x', account: 'Personal', email: 'tu correo personal', color: S[1], renew: 'renueva el 24 sep', price: 100, value: 236.8, ratio: '2,4×' },
  { plan: 'Claude Pro', account: 'Vena Digital', email: 'correo de Vena Digital', color: S[2], renew: 'renueva el 17 sep', price: 20, value: 45.75, ratio: '2,3×' },
  { plan: 'ChatGPT Plus', account: 'Codex', email: 'OpenAI', color: S[0], renew: 'renueva el 3 oct', price: 20, value: 38.88, ratio: '1,9×' },
];

// ---- Notas ----
export const TYPES = {
  hacer: { label: 'Por hacer', tint: '#FDF4D3', dot: S[3], count: 7 },
  investigar: { label: 'Por investigar', tint: '#EAF2FB', dot: S[0], count: 5 },
  link: { label: 'Link', tint: '#FFFFFF', dot: '#898781', count: 6 },
  nota: { label: 'Nota', tint: '#E9F5EE', dot: S[2], count: 4 },
  inspiracion: { label: 'Inspiración', tint: '#FBEEF3', dot: S[4], count: 2 },
};
export const NOTES_TOTAL = 24;

// ---- Tableros ----
export const BOARDS = [
  { name: 'Arquitectura OS Vena', meta: 'Editado hace 1 h', sketch: 'arch' },
  { name: 'Funnel Academia IA', meta: 'Editado ayer', sketch: 'funnel' },
  { name: 'Calendario de contenidos', meta: 'Editado el 8 sep', sketch: 'calendar' },
  { name: 'Flujo n8n · onboarding', meta: 'Editado el 2 sep', sketch: 'flow' },
  { name: 'Mapa del podcast T2', meta: 'Editado el 28 ago', sketch: 'mindmap' },
  { name: 'Ideas sueltas', meta: 'Editado el 20 ago', sketch: 'loose' },
];
