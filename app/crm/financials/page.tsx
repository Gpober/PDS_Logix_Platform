import {
  getArAging,
  getCompanyFinancials,
  getCustomerFinancials,
  getFinancialsTrend,
} from '@/lib/integrations/pdsbooks';
import { resolveFinPeriod } from '@/lib/crm/finPeriod';
import { Empty } from '@/components/crm/ui';
import { BooksNote, Kpi, PeriodChips, StatRow, usd, usd2, pct } from '@/components/crm/FinReport';

export const dynamic = 'force-dynamic';

const mLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export default async function FinancialsOverview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { key, from, to, label } = resolveFinPeriod((await searchParams).period);
  const y = from.slice(0, 4);

  const [companyRes, custRes, trendRes, agingRes] = await Promise.all([
    getCompanyFinancials({ from, to }),
    getCustomerFinancials({ from, to }),
    getFinancialsTrend({ from: `${y}-01-01`, to }, 'month'),
    getArAging(),
  ]);

  if (companyRes.status === 'not_configured') return <BooksNote />;
  if (companyRes.status === 'error') return <Empty>Couldn’t read the books: {companyRes.message}</Empty>;

  const c = companyRes.data;
  const periods = trendRes.status === 'ok' ? trendRes.data.periods : [];
  const clients = custRes.status === 'ok' ? custRes.data.customers.filter((x) => x.customer !== 'Not specified').slice(0, 6) : [];
  const aging = agingRes.status === 'ok' ? agingRes.data.totals : null;
  const maxRev = Math.max(1, ...periods.map((p) => p.revenue));
  const maxClient = Math.max(1, ...clients.map((x) => x.revenue));

  return (
    <div className="space-y-6">
      <PeriodChips basePath="/crm/financials" current={key} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Revenue" value={usd(c.revenue)} />
        <Kpi label="Gross profit" value={usd(c.grossProfit)} sub={pct(c.grossMargin)} />
        <Kpi label="Net income" value={usd(c.netIncome)} sub={pct(c.netMargin)} bad={c.netIncome < 0} />
        <Kpi label="Cash on hand" value={usd(c.cashBalance)} />
        <Kpi label="A/R past due" value={usd(c.receivables.pastDue)} sub={`of ${usd(c.receivables.total)}`} bad={c.receivables.pastDue > 0} />
        <Kpi label="A/P owed" value={usd(c.payables.total)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">Profit &amp; loss — {label}</p>
          <div className="space-y-1.5 text-sm">
            <StatRow label="Revenue" value={usd2(c.revenue)} />
            <StatRow label="Cost of goods sold" value={usd2(c.cogs)} muted />
            <StatRow label="Gross profit" value={`${usd2(c.grossProfit)} · ${pct(c.grossMargin)}`} strong />
            <StatRow label="Operating expenses" value={usd2(c.operatingExpenses)} muted />
            {c.otherIncome > 0 && <StatRow label="Other income" value={usd2(c.otherIncome)} muted />}
            {c.otherExpense > 0 && <StatRow label="Other expense" value={usd2(c.otherExpense)} muted />}
            <div className="mt-1 border-t border-line pt-2">
              <StatRow label="Net income" value={`${usd2(c.netIncome)} · ${pct(c.netMargin)}`} strong bad={c.netIncome < 0} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-stone">Period: {c.period} · books as of {c.asOf || '—'}.</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">A/R aging</p>
          {aging ? (
            <div className="space-y-1.5 text-sm">
              <StatRow label="Current (≤30d)" value={usd2(aging.current)} />
              <StatRow label="31–60 days" value={usd2(aging.d31_60)} />
              <StatRow label="61–90 days" value={usd2(aging.d61_90)} />
              <StatRow label="90+ days" value={usd2(aging.d90_plus)} bad={aging.d90_plus > 0} />
              <div className="mt-1 border-t border-line pt-2"><StatRow label="Total open" value={usd2(aging.total)} strong /></div>
            </div>
          ) : <p className="text-sm text-stone">No receivables data.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="mb-4 text-xs uppercase tracking-wider text-stone">Revenue &amp; net income by month ({y})</p>
        {periods.length === 0 ? <p className="text-sm text-stone">No activity yet this year.</p> : (
          <div className="space-y-2">
            {periods.map((p) => (
              <div key={p.period} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs text-stone">{mLabel(p.period)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-ivory">
                  <div className="flex h-full items-center justify-end rounded bg-tulip px-2" style={{ width: `${Math.max(3, Math.round((p.revenue / maxRev) * 100))}%` }}>
                    <span className="text-[10px] font-medium text-ivory">{usd(p.revenue)}</span>
                  </div>
                </div>
                <span className={'w-24 shrink-0 text-right text-xs tabular-nums ' + (p.netIncome < 0 ? 'text-[#B91C1C]' : 'text-[#3E9B4F]')}>
                  {p.netIncome < 0 ? '−' : '+'}{usd(Math.abs(p.netIncome))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="mb-4 text-xs uppercase tracking-wider text-stone">Top clients by revenue — {label}</p>
        {clients.length === 0 ? <p className="text-sm text-stone">No client revenue in this period.</p> : (
          <div className="space-y-2.5">
            {clients.map((x) => (
              <div key={x.customer} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink" title={x.customer}>{x.customer.split(':').pop()}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-ivory">
                  <div className="flex h-full items-center justify-end rounded-md bg-tulip px-2" style={{ width: `${Math.max(4, Math.round((x.revenue / maxClient) * 100))}%` }}>
                    <span className="text-[11px] font-medium tabular-nums text-ivory">{usd(x.revenue)}</span>
                  </div>
                </div>
                <span className={'w-20 shrink-0 text-right text-xs tabular-nums ' + (x.netIncome < 0 ? 'text-[#B91C1C]' : 'text-stone')}>net {usd(x.netIncome)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
