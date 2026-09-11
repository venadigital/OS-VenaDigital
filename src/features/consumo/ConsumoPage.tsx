import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, ChevronLeft, ChevronRight, Laptop, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { Page, PageHeader } from '@/components/Shell';
import { Button, Card, CardHead, cx, Dot, Empty, IconButton, Label, LiveDot, Pill, Segmented, Select, Skeleton } from '@/components/ui';
import { useCollectorStatus, useAccounts, useEntries, usePrices, useSessions, useUsage } from '@/data/hooks';
import type { AiAccount, ModelPrice } from '@/data/types';
import { accountKey, findPrice, sessionAccountKey, summarizeUsage, type AccountSummary, type UsageSummary } from '@/lib/pricing';
import { price as priceText, ratio, relativeDay, tokens, usd } from '@/lib/format';
import { dayKey, daysIn, isCurrent, RANGE_LABELS, rangeFor, rangeLabel, shiftAnchor, type RangeMode } from '@/lib/time';
import { AccountDialog, CollectorDialog, PriceDialog, PricesDialog } from './dialogs';
import { ProjectsCard, SessionsCard, useSessionRows } from './breakdown';
import { totalsByProject, useTimeData } from '@/features/tiempo/model';

export function ConsumoPage() {
  const [mode, setMode] = useState<RangeMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [accountFilter, setAccountFilter] = useState('all');
  const [priceEdit, setPriceEdit] = useState<{ model: string; price?: ModelPrice } | null>(null);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [accountEdit, setAccountEdit] = useState<{ account?: AiAccount; draft?: Partial<AiAccount> } | null>(null);
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<'model' | 'project' | 'session'>('model');

  const { from, to } = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);
  // The chart always shows days: a day is read inside its week.
  const chartRange = useMemo(() => (mode === 'day' ? rangeFor('week', anchor) : { from, to }), [mode, anchor, from, to]);

  const usageQ = useUsage(chartRange.from, chartRange.to);
  const prices = usePrices();
  const accountsQ = useAccounts();
  const status = useCollectorStatus();
  const accounts = accountsQ.data ?? [];
  const priceList = prices.data ?? [];

  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  const allRows = usageQ.data ?? [];
  const filtered = useMemo(
    () => (accountFilter === 'all' ? allRows : allRows.filter((r) => accountKey(r, accounts) === accountFilter)),
    [allRows, accountFilter, accounts],
  );
  const rangeRows = useMemo(() => filtered.filter((r) => r.day >= fromKey && r.day < toKey), [filtered, fromKey, toKey]);
  const summary = useMemo(() => summarizeUsage(rangeRows, priceList, accounts), [rangeRows, priceList, accounts]);
  const chartSummary = useMemo(() => summarizeUsage(filtered, priceList, accounts), [filtered, priceList, accounts]);
  const everyAccount = useMemo(() => summarizeUsage(allRows, priceList, accounts).byAccount, [allRows, priceList, accounts]);

  const selectedAccounts = accountFilter === 'all' ? accounts : accounts.filter((a) => a.id === accountFilter);
  const monthly = selectedAccounts.reduce((s, a) => s + a.monthly_price, 0);
  const daysInRange = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const subsForRange = mode === 'month' ? monthly : (monthly * daysInRange) / daysInMonth;
  const rendimiento = subsForRange > 0 ? summary.cost / subsForRange : null;
  const cachePct = summary.tokens > 0 ? Math.round((summary.cacheTokens / summary.tokens) * 100) : 0;

  const latest = (status.data ?? []).slice().sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))[0];
  const loading = usageQ.isLoading || prices.isLoading || accountsQ.isLoading;
  const now = new Date();
  const detected = everyAccount.filter((a) => !a.account && a.email !== 'unknown');

  // Sessions (per work folder) and the hours logged in Tiempo for linked projects.
  const sessionsQ = useSessions(from, to);
  const sessions = useMemo(
    () => (accountFilter === 'all' ? sessionsQ.data ?? [] : (sessionsQ.data ?? []).filter((x) => sessionAccountKey(x, accounts) === accountFilter)),
    [sessionsQ.data, accountFilter, accounts],
  );
  const sessionRows = useSessionRows(sessions, priceList);
  const time = useTimeData();
  const entries = useEntries(from, to);
  const minutesByProject = useMemo(
    () => new Map(totalsByProject(entries.data ?? [], from, to, new Date(), time.taskById, time.projectById).byProject.map((b) => [b.project.id, b.minutes])),
    [entries.data, from, to, time.taskById, time.projectById],
  );
  const tabs = (
    <Segmented
      options={[
        { value: 'model', label: 'Modelo' },
        { value: 'project', label: 'Proyecto' },
        { value: 'session', label: 'Sesión' },
      ]}
      value={breakdown}
      onChange={setBreakdown}
    />
  );

  return (
    <Page>
      <PageHeader
        eyebrow={
          latest ? (
            <>
              <Dot color={Date.now() - new Date(latest.last_seen_at).getTime() < 30 * 60_000 ? '#0ca30c' : '#fab219'} size={7} />
              Sincronizado {syncAgo(latest.last_seen_at)}
            </>
          ) : (
            'Colector sin conectar'
          )
        }
        title="Consumo IA"
        right={
          <>
            <div className="w-[190px]">
              <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="h-[34px] rounded-lg text-[13.5px]">
                <option value="all">Todas las cuentas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
                {detected.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.email} (sin configurar)
                  </option>
                ))}
              </Select>
            </div>
            <Segmented
              options={(['day', 'week', 'month'] as RangeMode[]).map((m) => ({ value: m, label: RANGE_LABELS[m] }))}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setAnchor(new Date());
              }}
            />
            <div className="flex h-[34px] items-center gap-0.5 rounded-lg border border-line-2 bg-white px-1">
              <IconButton label="Anterior" size={26} onClick={() => setAnchor((a) => shiftAnchor(mode, a, -1))}>
                <ChevronLeft size={16} />
              </IconButton>
              <button type="button" className="px-1 text-[13.5px] font-medium text-ink" onClick={() => setAnchor(new Date())}>
                {rangeLabel(mode, anchor, now)}
              </button>
              <IconButton label="Siguiente" size={26} disabled={isCurrent(mode, anchor, now)} onClick={() => setAnchor((a) => shiftAnchor(mode, a, 1))}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Tile label="Valor a precio API" hero value={loading ? null : usd(summary.cost)}>
          {rangeLabel(mode, anchor, now)}
          {summary.unpriced.length > 0 && ` · ${summary.unpriced.length} ${summary.unpriced.length === 1 ? 'modelo' : 'modelos'} sin precio`}
        </Tile>
        <Tile
          label="Suscripciones"
          value={
            <>
              {priceText(monthly)}
              <span className="text-[15px] font-medium tracking-normal text-ink-3">/mes</span>
            </>
          }
        >
          {selectedAccounts.length ? selectedAccounts.map((a) => a.plan || a.label).join(' · ') : 'Agrega tus cuentas'}
        </Tile>
        <Tile label="Rendimiento" value={rendimiento === null ? '—' : ratio(rendimiento)}>
          {mode === 'month' ? 'Valor a precio API ÷ lo que pagas' : 'Frente a la suscripción prorrateada'}
        </Tile>
        <Tile label="Tokens procesados" value={loading ? null : tokens(summary.tokens)}>
          {summary.tokens ? `${cachePct} % leídos desde caché` : 'Sin actividad'}
        </Tile>
      </div>

      {!loading && allRows.length === 0 ? (
        <Empty
          icon={<Sparkles size={28} />}
          title="Aún no hay datos de consumo"
          action={
            <Button variant="primary" icon={<Laptop size={16} />} onClick={() => setCollectorOpen(true)}>
              Conectar mi Mac
            </Button>
          }
        >
          El colector lee lo que usas en Claude Code y Codex desde tu Mac y lo sube aquí. Tarda un minuto en instalarse.
        </Empty>
      ) : (
        <DailyChart summary={chartSummary} from={chartRange.from} to={chartRange.to} highlight={mode === 'day' ? anchor : undefined} loading={loading} />
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {breakdown === 'model' ? (
          <ModelsCard
            tabs={tabs}
            summary={summary}
            prices={priceList}
            onEditPrice={(model) => setPriceEdit({ model, price: findPrice(model, priceList) })}
            onOpenPrices={() => setPricesOpen(true)}
          />
        ) : breakdown === 'project' ? (
          <ProjectsCard tabs={tabs} rows={sessionRows} projects={time.projects} minutesByProject={minutesByProject} />
        ) : (
          <SessionsCard tabs={tabs} rows={sessionRows} />
        )}
        <div className="flex flex-col gap-5">
          <AccountsCard
            accounts={accounts}
            byAccount={summary.byAccount}
            detected={detected}
            monthly={accounts.reduce((s, a) => s + a.monthly_price, 0)}
            factor={mode === 'month' ? 1 : daysInRange / daysInMonth}
            onEdit={(a) => setAccountEdit({ account: a })}
            onAdd={(draft) => setAccountEdit({ draft })}
          />
          <CollectorCard onConnect={() => setCollectorOpen(true)} />
        </div>
      </div>

      <PriceDialog model={priceEdit?.model ?? null} price={priceEdit?.price} onClose={() => setPriceEdit(null)} />
      <PricesDialog
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        prices={priceList}
        onEdit={(p) => setPriceEdit(p ? { model: p.model, price: p } : { model: '' })}
      />
      <AccountDialog state={accountEdit} onClose={() => setAccountEdit(null)} usedColors={accounts.map((a) => a.color)} />
      <CollectorDialog open={collectorOpen} onClose={() => setCollectorOpen(false)} />
    </Page>
  );
}

function syncAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`;
  return relativeDay(new Date(iso)).toLowerCase();
}

function Tile({ label, value, hero, children }: { label: string; value: React.ReactNode | null; hero?: boolean; children?: React.ReactNode }) {
  return (
    <Card className={cx('gap-1.5 p-4 md:p-5', hero && 'col-span-2 md:col-span-1')}>
      <Label>{label}</Label>
      {value === null ? (
        <Skeleton className="h-10 w-32" />
      ) : (
        <div
          className={cx(
            'font-semibold text-ink',
            hero ? 'text-[40px] leading-[48px] tracking-[-0.03em] md:text-[48px] md:leading-[54px]' : 'mt-auto text-[26px] leading-8 tracking-[-0.02em] md:text-[30px] md:leading-9',
          )}
        >
          {value}
        </div>
      )}
      <div className="text-[12.5px] text-ink-3">{children}</div>
    </Card>
  );
}

function DailyChart({ summary, from, to, highlight, loading }: { summary: UsageSummary; from: Date; to: Date; highlight?: Date; loading: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => daysIn(from, to), [from, to]);
  const series = summary.byAccount;
  const columns = days.map((d) => {
    const m = summary.byDay.get(dayKey(d));
    return { d, values: series.map((s) => m?.get(s.key) ?? 0) };
  });
  const maxTotal = Math.max(1, ...columns.map((c) => c.values.reduce((a, b) => a + b, 0)));
  const step = niceStep(maxTotal);
  const top = Math.ceil(maxTotal / step) * step;
  const W = 1000;
  const H = 250;
  const x0 = 44;
  const base = 216;
  const k = (base - 12) / top;
  const slot = (W - x0) / columns.length;
  const bw = Math.min(22, slot * 0.55);
  const today = new Date();
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = columns.length > 10 ? 5 : 1;
  const active = hover ?? (highlight ? columns.findIndex((c) => isSameDay(c.d, highlight)) : null);

  return (
    <Card>
      <CardHead
        title="Costo diario en USD"
        right={
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        }
      />
      {loading ? (
        <Skeleton className="h-56" />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" onMouseLeave={() => setHover(null)} role="img" aria-label="Costo diario">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={x0} x2={W} y1={base - v * k} y2={base - v * k} stroke={v ? '#ecebe6' : '#c3c2b7'} strokeWidth={1} />
                <text x={x0 - 10} y={base - v * k + 4} textAnchor="end" fontSize={11} fill="#898781" className="tnum">
                  ${v}
                </text>
              </g>
            ))}
            {columns.map((c, i) => {
              const x = x0 + i * slot + slot / 2 - bw / 2;
              let y = base;
              const segs = c.values.map((v, j) => ({ v, color: series[j].color })).filter((s) => s.v > 0);
              const isToday = isSameDay(c.d, today);
              return (
                <g key={c.d.toISOString()} onMouseEnter={() => setHover(i)}>
                  <rect x={x0 + i * slot} y={8} width={slot} height={base - 8} fill={active === i ? '#f4f3ef' : 'transparent'} rx={4} />
                  {segs.map((s, j) => {
                    const h = Math.max(1, s.v * k - (j ? 2 : 0));
                    const yTop = y - h;
                    const r = j === segs.length - 1 ? Math.min(4, h) : 0;
                    const d = `M${x} ${y} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + bw - r} Q${x + bw} ${yTop} ${x + bw} ${yTop + r} V${y} Z`;
                    y = yTop - 2;
                    return <path key={j} d={d} fill={s.color} />;
                  })}
                  {(i % labelEvery === 0 || isToday) && (
                    <text x={x + bw / 2} y={base + 20} textAnchor="middle" fontSize={11} fontWeight={isToday ? 600 : 400} fill={isToday ? '#52514e' : '#898781'}>
                      {isToday ? 'Hoy' : columns.length > 10 ? format(c.d, 'd') : format(c.d, 'EEE d', { locale: es }).replace('.', '')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {active !== null && active >= 0 && columns[active] && (
            <Tooltip
              column={columns[active]}
              series={series}
              left={((x0 + active * slot + slot) / W) * 100}
              flip={active > columns.length * 0.66}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function Tooltip({ column, series, left, flip }: { column: { d: Date; values: number[] }; series: AccountSummary[]; left: number; flip: boolean }) {
  const total = column.values.reduce((a, b) => a + b, 0);
  return (
    <div
      className="pointer-events-none absolute top-3 flex w-56 flex-col gap-1.5 rounded-[10px] border border-line bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(31,30,28,0.10)]"
      style={flip ? { right: `${100 - left + 4}%` } : { left: `calc(${left}% + 8px)` }}
    >
      <div className="text-xs font-semibold text-ink first-letter:uppercase">{format(column.d, "EEEE d 'de' MMMM", { locale: es })}</div>
      {series.map((s, j) =>
        column.values[j] > 0 ? (
          <div key={s.key} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            <span className="flex-1 truncate text-ink-2">{s.label}</span>
            <span className="tnum font-medium text-ink">{usd(column.values[j])}</span>
          </div>
        ) : null,
      )}
      <div className="h-px bg-rule" />
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
        <span className="w-2" />
        <span className="flex-1">Total</span>
        <span className="tnum">{usd(total)}</span>
      </div>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

function ModelsCard({
  tabs,
  summary,
  prices,
  onEditPrice,
  onOpenPrices,
}: {
  tabs: React.ReactNode;
  summary: UsageSummary;
  prices: ModelPrice[];
  onEditPrice: (model: string) => void;
  onOpenPrices: () => void;
}) {
  const totals = summary.byModel.reduce(
    (acc, m) => ({ input: acc.input + m.input, output: acc.output + m.output, cache: acc.cache + m.cache }),
    { input: 0, output: 0, cache: 0 },
  );
  return (
    <Card className="min-w-0">
      <CardHead title="Por modelo" right={tabs} />
      {summary.byModel.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Sin consumo en este periodo.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2 pr-3 font-medium">Modelo</th>
                <th className="py-2 pr-3 font-medium">Fuente</th>
                <th className="py-2 pr-3 text-right font-medium">Entrada</th>
                <th className="py-2 pr-3 text-right font-medium">Salida</th>
                <th className="py-2 pr-3 text-right font-medium">Caché</th>
                <th className="py-2 text-right font-medium">Costo</th>
              </tr>
            </thead>
            <tbody>
              {summary.byModel.map((m) => (
                <tr key={`${m.source}:${m.model}`} className="border-b border-rule last:border-0">
                  <td className="py-3 pr-3 font-mono text-[12.5px] text-ink">
                    <button type="button" onClick={() => onEditPrice(m.model)} className="text-left hover:text-accent" title="Editar precio">
                      {m.model}
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-ink-2">{m.source === 'codex' ? 'Codex' : 'Claude Code'}</td>
                  <td className="tnum py-3 pr-3 text-right text-ink-2">{tokens(m.input)}</td>
                  <td className="tnum py-3 pr-3 text-right text-ink-2">{tokens(m.output)}</td>
                  <td className="tnum py-3 pr-3 text-right text-ink-2">{tokens(m.cache)}</td>
                  <td className="py-3 text-right">
                    {m.cost === null ? (
                      <button type="button" onClick={() => onEditPrice(m.model)} className="inline-flex items-center gap-1.5 font-medium text-accent">
                        <AlertTriangle size={14} className="text-warn" />
                        Definir precio
                      </button>
                    ) : (
                      <span className="tnum font-semibold text-ink">{usd(m.cost)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-semibold text-ink">
                <td className="py-3 pr-3">Total</td>
                <td />
                <td className="tnum py-3 pr-3 text-right">{tokens(totals.input)}</td>
                <td className="tnum py-3 pr-3 text-right">{tokens(totals.output)}</td>
                <td className="tnum py-3 pr-3 text-right">{tokens(totals.cache)}</td>
                <td className="tnum py-3 text-right">{usd(summary.cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {summary.unpriced.length > 0 && (
        <p className="text-[12.5px] text-ink-3">
          {summary.unpriced.join(', ')} no {summary.unpriced.length === 1 ? 'suma' : 'suman'} al total hasta que definas su precio por millón de tokens.
        </p>
      )}
      {prices.length === 0 && <p className="text-[12.5px] text-ink-3">Cargando la tabla de precios de referencia…</p>}
      <button type="button" onClick={onOpenPrices} className="flex items-center gap-0.5 self-start text-[13px] font-medium text-accent">
        Tabla de precios <ChevronRight size={14} />
      </button>
    </Card>
  );
}

function AccountsCard({
  accounts,
  byAccount,
  detected,
  monthly,
  factor,
  onEdit,
  onAdd,
}: {
  accounts: AiAccount[];
  byAccount: AccountSummary[];
  detected: AccountSummary[];
  monthly: number;
  factor: number;
  onEdit: (a: AiAccount) => void;
  onAdd: (draft: Partial<AiAccount>) => void;
}) {
  return (
    <Card>
      <CardHead title="Cuentas y suscripciones" right={<span className="tnum text-[13px] text-ink-3">{priceText(monthly)}/mes</span>} />
      <div className="-mt-2 flex flex-col">
        {accounts.length === 0 && <p className="py-2 text-[13.5px] text-ink-3">Agrega tus planes para comparar lo que pagas con lo que usas.</p>}
        {accounts.map((a, i) => {
          const value = byAccount.find((b) => b.key === a.id)?.cost ?? 0;
          const paid = a.monthly_price * factor;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onEdit(a)}
              className={cx('flex flex-col gap-2 py-3 text-left', i > 0 && 'border-t border-rule')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-[7px] text-[14px] font-semibold text-ink">
                    <Dot color={a.color} />
                    <span className="truncate">{a.plan || a.label}</span>
                    {a.plan && a.plan !== a.label && <span className="truncate font-medium text-ink-3">· {a.label}</span>}
                  </span>
                  <span className="truncate pl-[15px] text-[12.5px] text-ink-3">{a.email || (a.provider === 'openai' ? 'OpenAI' : 'Sin correo')}</span>
                  {a.renews_day && <span className="pl-[15px] text-[12.5px] text-ink-3">renueva el día {a.renews_day}</span>}
                </div>
                <span className="tnum text-[14px] font-semibold text-ink">
                  {priceText(a.monthly_price)}
                  <span className="text-[12.5px] font-medium text-ink-3">/mes</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
                <span>
                  Valor a precio API: <span className="tnum font-semibold text-ink">{usd(value)}</span>
                </span>
                {paid > 0 && <Pill>Rinde {ratio(value / paid)}</Pill>}
              </div>
            </button>
          );
        })}
        {detected.map((d) => (
          <div key={d.key} className="flex items-center gap-2 border-t border-rule py-3 text-[13px]">
            <AlertTriangle size={15} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-ink-2">
              Cuenta detectada: <span className="font-medium break-all text-ink">{d.email}</span>
            </span>
            <Button
              size="sm"
              onClick={() =>
                onAdd({
                  provider: d.source === 'codex' ? 'openai' : 'anthropic',
                  email: d.source === 'codex' ? null : d.email,
                  label: d.source === 'codex' ? 'ChatGPT' : '',
                })
              }
            >
              Configurar
            </Button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onAdd({})} className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent">
        <Plus size={16} strokeWidth={2.2} />
        Agregar suscripción
      </button>
    </Card>
  );
}

function CollectorCard({ onConnect }: { onConnect: () => void }) {
  const status = useCollectorStatus();
  const machines = status.data ?? [];
  return (
    <Card>
      <CardHead title="Colector local" right={machines.length ? <LiveDot label="Activo" /> : undefined} />
      {machines.length === 0 ? (
        <p className="text-[13.5px] leading-5 text-ink-3">Instálalo en tu Mac para medir Claude Code y Codex automáticamente.</p>
      ) : (
        machines.map((m) => (
          <div key={m.machine} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-fill">
                <Laptop size={18} className="text-ink-2" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] font-medium text-ink">{m.machine}</span>
                <span className="text-[12.5px] text-ink-3">Lee ~/.claude y ~/.codex cada 5 min</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <RefreshCw size={14} className="text-ink-3" />
              Última subida {syncAgo(m.last_seen_at)}
            </div>
            {m.current_account && (
              <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <Dot color="#c3c2b7" size={7} />
                <span className="truncate">Sesión activa en Claude Code: {m.current_account}</span>
              </div>
            )}
          </div>
        ))
      )}
      <Button icon={<Laptop size={15} />} onClick={onConnect} className="self-start">
        {machines.length ? 'Conectar otro equipo' : 'Conectar mi Mac'}
      </Button>
    </Card>
  );
}
