// Token → USD at API prices. Prices are editable rows; cost is computed on read.
import type { AiAccount, ModelPrice, ModelPriceInput, UsageRow } from '@/data/types';

type Rates = Omit<ModelPriceInput, 'model'>;

// Anthropic: cache read = 0.1× input, 5-min write = 1.25×, 1-h write = 2× (Fable 5.1 reads at $0.25).
const claude = (input: number, output: number, cacheRead = input * 0.1): Rates => ({
  input,
  output,
  cache_read: cacheRead,
  cache_write: input * 1.25,
  cache_write_1h: input * 2,
});
// OpenAI: cached input is its own rate; no cache-write charge.
const openai = (input: number, cached: number, output: number): Rates => ({
  input,
  output,
  cache_read: cached,
  cache_write: 0,
  cache_write_1h: 0,
});

/** Reference API prices (USD per 1M tokens), checked 11 Sep 2026. */
export const DEFAULT_PRICES: ModelPriceInput[] = [
  { model: 'claude-fable-5-1', ...claude(10, 50, 0.25) },
  { model: 'claude-fable-5', ...claude(10, 50) },
  { model: 'claude-opus-5', ...claude(5, 25) },
  { model: 'claude-opus-4-8', ...claude(5, 25) },
  { model: 'claude-opus-4-7', ...claude(5, 25) },
  { model: 'claude-opus-4-6', ...claude(5, 25) },
  { model: 'claude-opus-4-5', ...claude(5, 25) },
  { model: 'claude-opus-4-1', ...claude(15, 75) },
  { model: 'claude-sonnet-5', ...claude(2, 10) },
  { model: 'claude-sonnet-4-6', ...claude(3, 15) },
  { model: 'claude-sonnet-4-5', ...claude(3, 15) },
  { model: 'claude-haiku-4-5', ...claude(1, 5) },
  { model: 'gpt-6-astra', ...openai(10, 1, 50) },
  { model: 'gpt-5.6-sol', ...openai(4, 0.4, 20) },
  { model: 'gpt-5.6-terra', ...openai(2, 0.2, 12) },
  { model: 'gpt-5.6-luna', ...openai(0.2, 0.02, 1.2) },
  { model: 'gpt-5.5', ...openai(5, 0.5, 30) },
  { model: 'gpt-5.4', ...openai(2.5, 0.25, 15) },
  { model: 'gpt-5.4-mini', ...openai(0.75, 0.075, 4.5) },
  { model: 'gpt-5.3-codex', ...openai(1.75, 0.175, 14) },
  { model: 'gpt-5.2', ...openai(1.75, 0.175, 14) },
  // Codex variants not listed on the pricing page: same rate as their base model.
  { model: 'gpt-5.2-codex', ...openai(1.75, 0.175, 14) },
  { model: 'gpt-5.1', ...openai(1.25, 0.125, 10) },
  { model: 'gpt-5.1-codex', ...openai(1.25, 0.125, 10) },
  { model: 'gpt-5', ...openai(1.25, 0.125, 10) },
  { model: 'gpt-5-codex', ...openai(1.25, 0.125, 10) },
  { model: 'gpt-5-mini', ...openai(0.25, 0.025, 2) },
];

/** "claude-opus-4-1-20250805" → "claude-opus-4-1"; "claude-sonnet-4-6[1m]" → "claude-sonnet-4-6". */
export function baseModel(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '');
}

export function findPrice(model: string, prices: ModelPrice[]): ModelPrice | undefined {
  const exact = prices.find((p) => p.model === model);
  if (exact) return exact;
  const base = baseModel(model);
  return prices.find((p) => baseModel(p.model) === base);
}

export function rowTokens(r: UsageRow): number {
  return r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens + r.cache_write_1h_tokens;
}

export function rowCost(r: UsageRow, p: Rates): number {
  return (
    (r.input_tokens * p.input +
      r.output_tokens * p.output +
      r.cache_read_tokens * p.cache_read +
      r.cache_write_tokens * p.cache_write +
      r.cache_write_1h_tokens * p.cache_write_1h) /
    1e6
  );
}

export const UNKNOWN_ACCOUNT = 'unknown';

/** Which configured account a usage row belongs to (Claude by email, Codex to the OpenAI account). */
export function accountFor(r: UsageRow, accounts: AiAccount[]): AiAccount | undefined {
  if (r.source === 'codex') {
    const openaiAccounts = accounts.filter((a) => a.provider === 'openai');
    return openaiAccounts.find((a) => a.email && a.email.toLowerCase() === r.account.toLowerCase()) ?? openaiAccounts[0];
  }
  return accounts.find((a) => a.provider === 'anthropic' && a.email && a.email.toLowerCase() === r.account.toLowerCase());
}

export function accountKey(r: UsageRow, accounts: AiAccount[]): string {
  const acc = accountFor(r, accounts);
  return acc ? acc.id : `detected:${r.source}:${r.account}`;
}

export type ModelSummary = {
  model: string;
  source: UsageRow['source'];
  input: number;
  output: number;
  cache: number;
  tokens: number;
  cost: number | null;
};

export type AccountSummary = {
  key: string; // account id, or `detected:<email>` for accounts not configured yet
  account?: AiAccount;
  label: string;
  email: string;
  source: UsageRow['source'];
  color: string;
  cost: number;
  tokens: number;
};

export type UsageSummary = {
  cost: number;
  tokens: number;
  cacheTokens: number;
  unpriced: string[];
  byModel: ModelSummary[];
  byAccount: AccountSummary[];
  /** day key → account key → cost */
  byDay: Map<string, Map<string, number>>;
};

const FALLBACK_COLORS = ['#eb6834', '#1baf7a', '#2a78d6', '#eda100', '#e87ba4', '#4a3aa7'];

export function summarizeUsage(rows: UsageRow[], prices: ModelPrice[], accounts: AiAccount[]): UsageSummary {
  const byModel = new Map<string, ModelSummary>();
  const byAccount = new Map<string, AccountSummary>();
  const byDay = new Map<string, Map<string, number>>();
  const unpriced = new Set<string>();
  let cost = 0;
  let tokens = 0;
  let cacheTokens = 0;

  for (const r of rows) {
    const price = findPrice(r.model, prices);
    const c = price ? rowCost(r, price) : 0;
    const t = rowTokens(r);
    if (!price && t > 0) unpriced.add(r.model);
    cost += c;
    tokens += t;
    cacheTokens += r.cache_read_tokens + r.cache_write_tokens + r.cache_write_1h_tokens;

    const mk = `${r.source}:${r.model}`;
    const m = byModel.get(mk) ?? { model: r.model, source: r.source, input: 0, output: 0, cache: 0, tokens: 0, cost: price ? 0 : null };
    m.input += r.input_tokens;
    m.output += r.output_tokens;
    m.cache += r.cache_read_tokens + r.cache_write_tokens + r.cache_write_1h_tokens;
    m.tokens += t;
    if (price) m.cost = (m.cost ?? 0) + c;
    byModel.set(mk, m);

    const acc = accountFor(r, accounts);
    const ak = accountKey(r, accounts);
    const a =
      byAccount.get(ak) ??
      ({
        key: ak,
        account: acc,
        label: acc ? acc.label : r.account === UNKNOWN_ACCOUNT ? 'Sin cuenta asignada' : r.account,
        email: acc?.email ?? r.account,
        source: r.source,
        color: acc?.color ?? FALLBACK_COLORS[byAccount.size % FALLBACK_COLORS.length],
        cost: 0,
        tokens: 0,
      } satisfies AccountSummary);
    a.cost += c;
    a.tokens += t;
    byAccount.set(ak, a);

    const day = byDay.get(r.day) ?? new Map<string, number>();
    day.set(ak, (day.get(ak) ?? 0) + c);
    byDay.set(r.day, day);
  }

  return {
    cost,
    tokens,
    cacheTokens,
    unpriced: [...unpriced].sort(),
    byModel: [...byModel.values()].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens - a.tokens),
    byAccount: [...byAccount.values()].sort((a, b) => b.cost - a.cost),
    byDay,
  };
}
