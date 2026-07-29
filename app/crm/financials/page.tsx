import Link from 'next/link';
import { getCurrentProfile } from '@/lib/crm/data';
import {
  getArAging,
  getCompanyFinancials,
  getCustomerFinancials,
  getFinancialsTrend,
} from '@/lib/integrations/pdsbooks';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const mLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export default async function FinancialsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return (<><CrmHeader title="Financials" /><Empty>Financials are owner/admin-only.</Empty></>);
  }

  const sp = await searchParams;
  const period = sp.period === 'month' || sp.period === 'last' ? sp.period : 'ytd';

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const today = `${y}-${pad(m)}-${pad(now.getUTCDate())}`;
  let from: string, to: string, label: string;
  if (period === 'month') { from = `${y}-${pad(m)}-01`; to = today; label = 'This month'; }
  else if (period === 'last') {
    const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    from = `${py}-${pad(pm)}-01`; to = `${py}-${pad(pm)}-${pad(last)}`; label = 'Last month';
  } else { from = `${y}-01-01`; to = today; label = 'Year to date'; }

  const [companyRes, custRes, trendRes, agingRes] = await Promise.all([
    getCompanyFinancials({ from, to }),
    getCustomerFinancials({ from, to }),
    getFinancialsTrend({ from: `${y}-01-01`, to: today }, 'month'),
    getArAging(),
  ]);

  if (companyRes.status === 'not_configured') {
    return (
      <>
        <CrmHeader title="Financials" />
        <Empty>
          The books aren’t connected yet. Set <code>PDS_BOOKS_SUPABASE_URL</code> / <code>PDS_BOOKS_SUPABASE_KEY</code> in
          the environment (the same QuickBooks ledger the I AM CFO dashboards read), then reload.
        </Empty>
      </>
    );
  }
  if (companyRes.status === 'error') {
    return (<><CrmHeader title="Financials" /><Empty>Couldn’t read the books: {companyRes.message}</Empty></>);
  }

  const c = companyRes.data;
  const periods = trendRes.status === 'ok' ? trendRes.data.periods : [];
  const clients = custRes.status === 'ok' ? custRes.data.customers.filter((x) => x.customer !== 'Not specified').slice(0, 6) : [];
  const aging = agingRes.status === 'ok' ? agingRes.data.totals : null;

  const maxRev = Math.max(1, ...periods.map((p) => p.revenue));
  const maxClient = Math.max(1, ...clients.map((x) => x.revenue));
  const chip = (key: string, txt: string) => (
    <Link href={`/crm/financials?period=${key}`}
      className={'rounded-full px-3 py-1.5 text-sm ' + (period === key ? 'bg-tulip text-ivory' : 'border border-line text-stone hover:border-ink')}>
      {txt}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CrmHeader title="Financials" />
      <p className="-mt-4 text-center text-sm text-stone">The real books from QuickBooks — same ledger as I AM CFO. Period: {c.period}.</p>

      <div className="flex items-center justify-center gap-2">
        {chip('month', 'This month')}
        {chip('last', 'Last month')}
        {chip('ytd', 'Year to date')}
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Revenue" value={usd(c.revenue)} />
        <Kpi label="Gross profit" value={usd(c.grossProfit)} sub={pct(c.grossMargin)} />
        <Kpi label="Net income" value={usd(c.netIncome)} sub={pct(c.netMargin)} bad={c.netIncome < 0} />
        <Kpi label="Cash on hand" value={usd(c.cashBalance)} />
        <Kpi label="A/R past due" value={usd(c.receivables.pastDue)} sub={`of ${usd(c.receivables.total)}`} bad={c.receivables.pastDue > 0} />
        <Kpi label="A/P owed" value={usd(c.payables.total)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* P&L summary */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">Profit &amp; loss — {label}</p>
          <dl className="space-y-1.5 text-sm">
            <Row label="Revenue" value={usd(c.revenue)} />
            <Row label="Cost of goods sold" value={usd(c.cogs)} muted />
            <Row label="Gross profit" value={`${usd(c.grossProfit)} · ${pct(c.grossMargin)}`} strong />
            <Row label="Operating expenses" value={usd(c.operatingExpenses)} muted />
            {c.otherIncome > 0 && <Row label="Other income" value={usd(c.otherIncome)} muted />}
            {c.otherExpense > 0 && <Row label="Other expense" value={usd(c.otherExpense)} muted />}
            <div className="mt-1 border-t border-line pt-2">
              <Row label="Net income" value={`${usd(c.netIncome)} · ${pct(c.netMargin)}`} strong bad={c.netIncome < 0} />
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-stone">Books as of {c.asOf || '—'}.</p>
        </div>

        {/* A/R aging */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">A/R aging</p>
          {aging ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="Current (≤30d)" value={usd(aging.current)} />
              <Row label="31–60 days" value={usd(aging.d31_60)} />
              <Row label="61–90 days" value={usd(aging.d61_90)} />
              <Row label="90+ days" value={usd(aging.d90_plus)} bad={aging.d90_plus > 0} />
              <div className="mt-1 border-t border-line pt-2"><Row label="Total open" value={usd(aging.total)} strong /></div>
            </dl>
          ) : <p className="text-sm text-stone">No receivables data.</p>}
        </div>
      </div>

      {/* Monthly trend */}
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

      {/* Top clients */}
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

      <p className="text-center text-xs text-stone">Want the full detail? Ask Zordon for an itemized P&amp;L, a quarterly trend, or a client profitability report.</p>
    </div>
  );
}

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-stone">{label}</p>
      <p className={'mt-1 font-display text-xl tabular-nums ' + (bad ? 'text-[#B91C1C]' : 'text-ink')}>{value}</p>
      {sub && <p className="text-[11px] text-stone">{sub}</p>}
    </div>
  );
}

function Row({ label, value, muted, strong, bad }: { label: string; value: string; muted?: boolean; strong?: boolean; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? 'text-stone' : strong ? 'font-medium text-ink' : 'text-ink'}>{label}</span>
      <span className={'tabular-nums ' + (bad ? 'text-[#B91C1C]' : strong ? 'font-medium text-ink' : muted ? 'text-stone' : 'text-ink')}>{value}</span>
    </div>
  );
}
