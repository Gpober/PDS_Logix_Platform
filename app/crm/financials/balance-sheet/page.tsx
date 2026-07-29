import { getBalanceSheet } from '@/lib/integrations/pdsbooks';
import { Empty } from '@/components/crm/ui';
import { AccountSection, BooksNote, Kpi, StatRow, usd, usd2 } from '@/components/crm/FinReport';

export const dynamic = 'force-dynamic';

const fdate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function BalanceSheetPage() {
  const res = await getBalanceSheet();
  if (res.status === 'not_configured') return <BooksNote />;
  if (res.status === 'error') return <Empty>Couldn’t read the balance sheet: {res.message}</Empty>;

  const d = res.data;
  const totalLiabEquity = Math.round((d.totalLiabilities + d.totalEquity) * 100) / 100;
  const balanced = Math.abs(totalLiabEquity - d.totalAssets) < 1;

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-stone">As of {fdate(d.asOf)}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Total assets" value={usd(d.totalAssets)} />
        <Kpi label="Total liabilities" value={usd(d.totalLiabilities)} />
        <Kpi label="Total equity" value={usd(d.totalEquity)} />
      </div>

      <AccountSection title="Assets" lines={d.assets} total={d.totalAssets} />
      <AccountSection title="Liabilities" lines={d.liabilities} total={d.totalLiabilities} />

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-stone">Equity</p>
          <span className="font-display text-lg tabular-nums text-ink">{usd2(d.totalEquity)}</span>
        </div>
        <div className="space-y-1 border-t border-line pt-2 text-sm">
          {d.equity.map((l) => <StatRow key={l.account} label={l.account} value={usd2(l.amount)} muted />)}
          <StatRow label="Net income (current period)" value={usd2(d.netIncome)} muted />
        </div>
      </div>

      <div className={'rounded-2xl border p-5 ' + (balanced ? 'border-line bg-white' : 'border-[#FBBF24]/50 bg-[#FBBF24]/10')}>
        <StatRow label="Total liabilities + equity" value={usd2(totalLiabEquity)} strong />
        <p className="mt-1 text-[11px] text-stone">
          {balanced ? 'Balances against total assets ✓' : `Off from total assets by ${usd2(totalLiabEquity - d.totalAssets)} — likely a timing or unclassified-account difference.`}
        </p>
      </div>
    </div>
  );
}
