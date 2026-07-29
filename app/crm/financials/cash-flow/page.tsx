import { getCashFlowStatement } from '@/lib/integrations/pdsbooks';
import { resolveFinPeriod } from '@/lib/crm/finPeriod';
import { Empty } from '@/components/crm/ui';
import { BooksNote, Kpi, PeriodChips, StatRow, usd, usd2 } from '@/components/crm/FinReport';

export const dynamic = 'force-dynamic';

function Lines({ title, lines }: { title: string; lines: { account: string; amount: number }[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="mb-2 text-xs uppercase tracking-wider text-stone">{title}</p>
      <div className="space-y-1 border-t border-line pt-2 text-sm">
        {lines.slice(0, 60).map((l, i) => (
          <StatRow key={l.account + i} label={l.account} value={usd2(l.amount)} muted bad={l.amount < 0} />
        ))}
      </div>
    </div>
  );
}

export default async function CashFlowStatementPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { key, from, to, label } = resolveFinPeriod((await searchParams).period);
  const res = await getCashFlowStatement({ from, to });
  if (res.status === 'not_configured') return <BooksNote />;
  if (res.status === 'error') return <Empty>Couldn’t read the cash-flow statement: {res.message}</Empty>;

  const d = res.data;

  return (
    <div className="space-y-6">
      <PeriodChips basePath="/crm/financials/cash-flow" current={key} />
      <p className="text-center text-xs text-stone">Statement of Cash Flows — {label} · direct/offset method (reconciles to QuickBooks).</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Operating" value={usd(d.operating)} bad={d.operating < 0} />
        <Kpi label="Investing" value={usd(d.investing)} bad={d.investing < 0} />
        <Kpi label="Financing" value={usd(d.financing)} bad={d.financing < 0} />
        <Kpi label="Net change" value={usd(d.netChange)} bad={d.netChange < 0} />
      </div>

      {d.cashAtBeginning != null && (
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="space-y-1.5 text-sm">
            <StatRow label="Cash at beginning" value={usd2(d.cashAtBeginning)} muted />
            <StatRow label="Net change in cash" value={usd2(d.netChange)} bad={d.netChange < 0} />
            <div className="mt-1 border-t border-line pt-2"><StatRow label="Cash at end" value={usd2(d.cashAtEnd ?? 0)} strong /></div>
          </div>
        </div>
      )}

      <Lines title="Operating — money in" lines={d.operatingInflows} />
      <Lines title="Operating — money out" lines={d.operatingOutflows} />
      <Lines title="Investing" lines={d.investingLines} />
      <Lines title="Financing" lines={d.financingLines} />

      <p className="text-center text-[11px] text-stone">Positive = cash in, negative = cash out. Bank-to-bank transfers net to zero. For the forward projection, see Cash Forecast.</p>
    </div>
  );
}
