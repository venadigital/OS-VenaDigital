// Row shapes shared by the Supabase and demo backends.

export type Project = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  sort: number;
  /** Work folder linked to this project (Consumo IA sessions). */
  folder?: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  name: string;
  archived: boolean;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
};

export type NoteType = 'hacer' | 'investigar' | 'link' | 'nota' | 'inspiracion';

export type Note = {
  id: string;
  type: NoteType;
  body: string;
  url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  link_site: string | null;
  image_path: string | null;
  pinned: boolean;
  done: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteInput = Partial<Omit<Note, 'id' | 'created_at' | 'updated_at'>>;

export type BoardSummary = {
  id: string;
  name: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
};

export type Board = BoardSummary & {
  scene: BoardScene;
};

export type BoardScene = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  /** Element skeletons (convertToExcalidrawElements) — used by demo boards. */
  skeleton?: unknown[];
};

export type Provider = 'anthropic' | 'openai';

export type AiAccount = {
  id: string;
  provider: Provider;
  email: string | null;
  label: string;
  plan: string | null;
  monthly_price: number;
  renews_day: number | null;
  color: string;
  created_at: string;
};

export type ModelPrice = {
  id: string;
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cache_write_1h: number;
  updated_at: string;
};

export type ModelPriceInput = Omit<ModelPrice, 'id' | 'updated_at'>;

export type UsageSource = 'claude_code' | 'codex';

export type UsageRow = {
  day: string; // yyyy-mm-dd (local day of the machine that produced it)
  source: UsageSource;
  account: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_1h_tokens: number;
  messages: number;
};

export type TokenCounts = {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cache_write_1h: number;
  messages: number;
};

export type UsageSession = {
  source: UsageSource;
  session_id: string;
  project: string; // folder name
  account: string;
  started_at: string;
  ended_at: string;
  models: Record<string, TokenCounts>;
};

export type CollectorStatus = {
  machine: string;
  last_seen_at: string;
  current_account: string | null;
  version: string | null;
};

export type CollectorToken = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type LinkPreview = {
  site?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
};
