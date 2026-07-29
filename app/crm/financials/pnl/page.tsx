import { getAccountBreakdown } from '@/lib/integrations/pdsbooks';
import { resolveFinPeriod } from '@/lib/crm/finPeriod';
import { Empty } from '@/components/crm/ui';
import { AccountSection, BooksNote, Kpi, PeriodChips, StatRow, usd, usd2, pct } from '@/components/crm/FinReport';

export const dynamic = 'force-dynamic';

export default async function PnLPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { key, from, to, label } = resolveFinPeriod((await searchParams).period);
  const res = await getAccountBreakdown({ from, to });
  if (res.status === 'not_configured') return <BooksNote />;
  if (res.status === 'error') return <Empty>Couldn’t read the P&amp;L: {res.message}</Empty>;

  const d = res.data;
  const s = d.subtotals;

  return (
    <div className="space-y-6">
      <PeriodChips basePath="/crm/financials/pnl" current={key} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Revenue" value={usd(s.revenue)} />
        <Kpi label="Gross profit" value={usd(s.grossProfit)} sub={pct(s.grossMargin)} />
        <Kpi label="Operating exp." value={usd(s.operatingExpenses)} />
        <Kpi label="Net income" value={usd(s.netIncome)} sub={pct(s.netMargin)} bad={s.netIncome < 0} />
      </div>

      <AccountSection title="Income" lines={d.income} total={s.revenue} />
      {d.costOfGoodsSold.length > 0 && <AccountSection title="Cost of goods sold" lines={d.costOfGoodsSold} total={s.cogs} />}
      <AccountSection title="Operating expenses" lines={d.expenses} total={s.operatingExpenses} />
      {d.otherIncome.length > 0 && <AccountSection title="Other income" lines={d.otherIncome} total={d.otherIncome.reduce((a, l) => a + l.amount, 0)} />}
      {d.otherExpense.length > 0 && <AccountSection title="Other expense" lines={d.otherExpense} total={d.otherExpense.reduce((a, l) => a + l.amount, 0)} />}

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="mb-3 text-xs uppercase tracking-wider text-stone">Summary — {label}</p>
        <div className="space-y-1.5 text-sm">
          <StatRow label="Revenue" value={usd2(s.revenue)} />
          <StatRow label="Cost of goods sold" value={usd2(s.cogs)} muted />
          <StatRow label="Gross profit" value={`${usd2(s.grossProfit)} · ${pct(s.grossMargin)}`} strong />
          <StatRow label="Operating expenses" value={usd2(s.operatingExpenses)} muted />
          <div className="mt-1 border-t border-line pt-2">
            <StatRow label="Net income" value={`${usd2(s.netIncome)} · ${pct(s.netMargin)}`} strong bad={s.netIncome < 0} />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-stone">Period: {d.period}. Matches QuickBooks’ P&amp;L detail. Ask Zordon to scope it to one client.</p>
      </div>
    </div>
  );
}
