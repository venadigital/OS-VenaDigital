import { useMemo } from 'react';
import { getDaysInMonth } from 'date-fns';
import { useAccounts, usePrices, useUsage } from '@/data/hooks';
import { summarizeUsage } from '@/lib/pricing';
import type { RangeMode } from '@/lib/time';

/** Usage summary for [from, to) plus the subscription side of the comparison. */
export function useConsumo(from: Date, to: Date, mode: RangeMode = 'month') {
  const usage = useUsage(from, to);
  const prices = usePrices();
  const accounts = useAccounts();

  const summary = useMemo(
    () => summarizeUsage(usage.data ?? [], prices.data ?? [], accounts.data ?? []),
    [usage.data, prices.data, accounts.data],
  );

  const monthly = (accounts.data ?? []).reduce((s, a) => s + a.monthly_price, 0);
  // Compare like with like: prorate the monthly price to the selected range.
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  const factor = mode === 'month' ? 1 : days / getDaysInMonth(from);
  const subsForRange = monthly * factor;
  const ratio = subsForRange > 0 ? summary.cost / subsForRange : null;

  return {
    summary,
    monthly,
    subsForRange,
    factor,
    ratio,
    accounts: accounts.data ?? [],
    prices: prices.data ?? [],
    loading: usage.isLoading || prices.isLoading || accounts.isLoading,
  };
}
