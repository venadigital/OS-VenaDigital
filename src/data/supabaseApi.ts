import type { SupabaseClient } from '@supabase/supabase-js';
import { newCollectorToken, type Api } from './api';
import type {
  AiAccount,
  Board,
  BoardSummary,
  CollectorStatus,
  CollectorToken,
  LinkPreview,
  ModelPrice,
  Note,
  Project,
  Task,
  TimeEntry,
  UsageRow,
} from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function createSupabaseApi(sb: SupabaseClient): Api {
  return {
    mode: 'supabase',

    // ---------- Tiempo ----------
    async listProjects() {
      return check(await sb.from('projects').select('*').order('sort').order('created_at')) as Project[];
    },
    async createProject(input) {
      return check(await sb.from('projects').insert(input).select().single()) as Project;
    },
    async updateProject(id, patch) {
      check(await sb.from('projects').update(patch).eq('id', id));
    },
    async deleteProject(id) {
      check(await sb.from('projects').delete().eq('id', id));
    },
    async listTasks() {
      return check(await sb.from('tasks').select('*').order('created_at')) as Task[];
    },
    async createTask(input) {
      return check(await sb.from('tasks').insert(input).select().single()) as Task;
    },
    async updateTask(id, patch) {
      check(await sb.from('tasks').update(patch).eq('id', id));
    },
    async deleteTask(id) {
      check(await sb.from('tasks').delete().eq('id', id));
    },
    async listEntries(from, to) {
      const res = await sb
        .from('time_entries')
        .select('id, task_id, started_at, ended_at')
        .lt('started_at', to.toISOString())
        .or(`ended_at.is.null,ended_at.gt.${from.toISOString()}`)
        .order('started_at', { ascending: false })
        .limit(5000);
      return check(res) as TimeEntry[];
    },
    async runningEntry() {
      const res = await sb.from('time_entries').select('id, task_id, started_at, ended_at').is('ended_at', null).maybeSingle();
      return check(res) as TimeEntry | null;
    },
    async startTimer(taskId) {
      return check(await sb.rpc('start_timer', { p_task_id: taskId })) as TimeEntry;
    },
    async stopTimer() {
      check(await sb.rpc('stop_timer'));
    },
    async updateEntry(id, patch) {
      check(await sb.from('time_entries').update(patch).eq('id', id));
    },
    async deleteEntry(id) {
      check(await sb.from('time_entries').delete().eq('id', id));
    },
    subscribeTimer(onChange) {
      const channel = sb
        .channel('time_entries_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => onChange())
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },

    // ---------- Notas ----------
    async listNotes() {
      return check(await sb.from('notes').select('*').order('created_at', { ascending: false }).limit(2000)) as Note[];
    },
    async createNote(input) {
      return check(await sb.from('notes').insert(input).select().single()) as Note;
    },
    async updateNote(id, patch) {
      check(await sb.from('notes').update(patch).eq('id', id));
    },
    async deleteNote(id) {
      const note = check(await sb.from('notes').select('image_path').eq('id', id).maybeSingle()) as Pick<Note, 'image_path'> | null;
      check(await sb.from('notes').delete().eq('id', id));
      if (note?.image_path) await sb.storage.from('notes').remove([note.image_path]);
    },
    async linkPreview(url) {
      const res = await sb.rpc('link_preview', { p_url: url });
      if (res.error) return {};
      return (res.data ?? {}) as LinkPreview;
    },
    async uploadNoteImage(file) {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) throw new Error('Sesión expirada');
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const res = await sb.storage.from('notes').upload(path, file, { contentType: file.type, upsert: false });
      if (res.error) throw new Error(res.error.message);
      return path;
    },
    async noteImageUrls(paths) {
      if (!paths.length) return {};
      const res = await sb.storage.from('notes').createSignedUrls(paths, 60 * 60);
      if (res.error) return {};
      const out: Record<string, string> = {};
      for (const item of res.data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      return out;
    },

    // ---------- Tableros ----------
    async listBoards() {
      const res = await sb.from('boards').select('id, name, thumbnail, created_at, updated_at').order('updated_at', { ascending: false });
      return check(res) as BoardSummary[];
    },
    async getBoard(id) {
      return check(await sb.from('boards').select('*').eq('id', id).single()) as Board;
    },
    async createBoard(name) {
      const res = await sb.from('boards').insert({ name }).select('id, name, thumbnail, created_at, updated_at').single();
      return check(res) as BoardSummary;
    },
    async updateBoard(id, patch) {
      check(await sb.from('boards').update(patch).eq('id', id));
    },
    async deleteBoard(id) {
      check(await sb.from('boards').delete().eq('id', id));
    },

    // ---------- Consumo IA ----------
    async listUsage(fromDay, toDay) {
      const res = await sb.from('usage_daily').select('*').gte('day', fromDay).lt('day', toDay).limit(20000);
      return (check(res) as Record<string, unknown>[]).map(
        (r): UsageRow => ({
          day: String(r.day),
          source: r.source as UsageRow['source'],
          account: String(r.account),
          model: String(r.model),
          input_tokens: num(r.input_tokens),
          output_tokens: num(r.output_tokens),
          cache_read_tokens: num(r.cache_read_tokens),
          cache_write_tokens: num(r.cache_write_tokens),
          cache_write_1h_tokens: num(r.cache_write_1h_tokens),
          messages: num(r.messages),
        }),
      );
    },
    async listPrices() {
      const rows = check(await sb.from('model_prices').select('*').order('model')) as Record<string, unknown>[];
      return rows.map(
        (r): ModelPrice => ({
          id: String(r.id),
          model: String(r.model),
          input: num(r.input),
          output: num(r.output),
          cache_read: num(r.cache_read),
          cache_write: num(r.cache_write),
          cache_write_1h: num(r.cache_write_1h),
          updated_at: String(r.updated_at),
        }),
      );
    },
    async upsertPrice(input) {
      check(await sb.from('model_prices').upsert(input, { onConflict: 'user_id,model' }));
    },
    async seedPrices(inputs) {
      check(await sb.from('model_prices').upsert(inputs, { onConflict: 'user_id,model', ignoreDuplicates: true }));
    },
    async deletePrice(id) {
      check(await sb.from('model_prices').delete().eq('id', id));
    },
    async listAccounts() {
      const rows = check(await sb.from('ai_accounts').select('*').order('created_at')) as Record<string, unknown>[];
      return rows.map((r) => ({ ...r, monthly_price: num(r.monthly_price) }) as AiAccount);
    },
    async createAccount(input) {
      const row = check(await sb.from('ai_accounts').insert(input).select().single()) as Record<string, unknown>;
      return { ...row, monthly_price: num(row.monthly_price) } as AiAccount;
    },
    async updateAccount(id, patch) {
      check(await sb.from('ai_accounts').update(patch).eq('id', id));
    },
    async deleteAccount(id) {
      check(await sb.from('ai_accounts').delete().eq('id', id));
    },
    async listCollectorStatus() {
      return check(await sb.from('collector_status').select('machine, last_seen_at, current_account, version')) as CollectorStatus[];
    },
    async listCollectorTokens() {
      const res = await sb.from('collector_tokens').select('id, label, created_at, last_used_at, revoked_at').order('created_at', { ascending: false });
      return check(res) as CollectorToken[];
    },
    async createCollectorToken(label) {
      const { token, hash } = await newCollectorToken();
      check(await sb.from('collector_tokens').insert({ label, token_hash: hash }));
      return token;
    },
    async revokeCollectorToken(id) {
      check(await sb.from('collector_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id));
    },
  };
}
