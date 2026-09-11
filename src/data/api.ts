// One interface, two backends: Supabase (real data) and an in-memory demo.
import type {
  AiAccount,
  Board,
  BoardScene,
  BoardSummary,
  CollectorStatus,
  CollectorToken,
  UsageSession,
  LinkPreview,
  ModelPrice,
  ModelPriceInput,
  Note,
  NoteInput,
  Project,
  Task,
  TimeEntry,
  UsageRow,
} from './types';

export type AccountInput = Omit<AiAccount, 'id' | 'created_at'>;

export interface Api {
  readonly mode: 'supabase' | 'demo';

  // Tiempo
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; color: string; folder?: string | null }): Promise<Project>;
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'archived' | 'sort' | 'folder'>>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listTasks(): Promise<Task[]>;
  createTask(input: { project_id: string; name: string }): Promise<Task>;
  updateTask(id: string, patch: Partial<Pick<Task, 'name' | 'archived' | 'project_id'>>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  /** Entries overlapping [from, to). */
  listEntries(from: Date, to: Date): Promise<TimeEntry[]>;
  runningEntry(): Promise<TimeEntry | null>;
  startTimer(taskId: string): Promise<TimeEntry>;
  stopTimer(): Promise<void>;
  updateEntry(id: string, patch: { started_at?: string; ended_at?: string | null; task_id?: string }): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /** Live updates for the timer across devices; returns an unsubscribe function. */
  subscribeTimer(onChange: () => void): () => void;

  // Notas
  listNotes(): Promise<Note[]>;
  createNote(input: NoteInput): Promise<Note>;
  updateNote(id: string, patch: NoteInput): Promise<void>;
  deleteNote(id: string): Promise<void>;
  linkPreview(url: string): Promise<LinkPreview>;
  uploadNoteImage(file: File): Promise<string>;
  noteImageUrls(paths: string[]): Promise<Record<string, string>>;

  // Tableros
  listBoards(): Promise<BoardSummary[]>;
  getBoard(id: string): Promise<Board>;
  createBoard(name: string): Promise<BoardSummary>;
  updateBoard(id: string, patch: { name?: string; scene?: BoardScene; thumbnail?: string | null }): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  /** Images placed on a board live apart from the scene, one per Excalidraw file id. */
  uploadBoardFile(boardId: string, fileId: string, data: Blob): Promise<void>;
  /** The requested images that exist; missing ones are left out. */
  boardFiles(boardId: string, fileIds: string[]): Promise<{ id: string; data: Blob }[]>;

  // Consumo IA
  /** Rows with fromDay <= day < toDay (yyyy-mm-dd). */
  listUsage(fromDay: string, toDay: string): Promise<UsageRow[]>;
  /** Sessions active in [from, to). */
  listSessions(from: Date, to: Date): Promise<UsageSession[]>;
  listPrices(): Promise<ModelPrice[]>;
  upsertPrice(input: ModelPriceInput): Promise<void>;
  seedPrices(inputs: ModelPriceInput[]): Promise<void>;
  deletePrice(id: string): Promise<void>;
  listAccounts(): Promise<AiAccount[]>;
  createAccount(input: AccountInput): Promise<AiAccount>;
  updateAccount(id: string, patch: Partial<AccountInput>): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  listCollectorStatus(): Promise<CollectorStatus[]>;
  listCollectorTokens(): Promise<CollectorToken[]>;
  /** Returns the raw token once; only its SHA-256 is stored. */
  createCollectorToken(label: string): Promise<string>;
  revokeCollectorToken(id: string): Promise<void>;
}

export async function newCollectorToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `vos_${b64}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { token, hash };
}
