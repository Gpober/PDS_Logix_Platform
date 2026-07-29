import Link from 'next/link';
import { getCurrentProfile } from '@/lib/crm/data';
import { buildCashForecast } from '@/lib/crm/forecast';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const usd2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const fdate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return (<><CrmHeader title="Cash Flow" /><Empty>Cash forecasting is owner/admin-only.</Empty></>);
  }

  const sp = await searchParams;
  const weeks = sp.weeks === '13' ? 13 : sp.weeks === '26' ? 26 : 8;
  const f = await buildCashForecast({ weeks });

  const maxBal = Math.max(1, ...f.weeks.map((w) => Math.abs(w.endingBalance)), Math.abs(f.anchor.balance));
  const lowNegative = f.lowPoint.balance < 0;
  const sourceLabel = f.anchor.source === 'plaid' ? 'live bank (Plaid)' : f.anchor.source === 'manual' ? 'set manually' : 'the books';

  // Biggest drivers across the horizon.
  const allItems = f.weeks.flatMap((w) => w.items.map((it) => ({ ...it, weekEnd: w.weekEnd })));
  const topAr = allItems.filter((i) => i.kind === 'ar').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const payrolls = allItems.filter((i) => i.kind === 'payroll').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CrmHeader title="Cash Flow" />
      <p className="-mt-4 text-center text-sm text-stone">
        Starting from last Friday’s cash ({sourceLabel}), rolled forward with real invoices in and payroll out.
      </p>

      {/* Anchor + horizon */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="rounded-2xl border border-line bg-white px-5 py-4 text-center sm:text-left">
          <p className="text-xs uppercase tracking-wider text-stone">Cash on hand · Fri {fdate(f.anchor.date)}</p>
          <p className="font-display text-3xl tabular-nums text-ink">{usd2(f.anchor.balance)}</p>
          <p className="text-[11px] text-stone">
            {f.anchor.source === 'books' && !f.booksConnected ? 'No live balance — connect a bank on Settings' : `from ${sourceLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-stone">Horizon:</span>
          {[8, 13, 26].map((w) => (
            <Link key={w} href={`/crm/cashflow?weeks=${w}`}
              className={'rounded-full px-3 py-1.5 ' + (weeks === w ? 'bg-tulip text-ivory' : 'border border-line text-stone hover:border-ink')}>
              {w}w
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Projected low" value={usd(f.lowPoint.balance)} sub={`wk of ${fdate(f.lowPoint.weekEnd)}`} bad={lowNegative} />
        <Kpi label={`In · ${weeks}w`} value={usd(f.totalIn)} />
        <Kpi label={`Out · ${weeks}w`} value={usd(f.totalOut)} />
        <Kpi label={`End · ${fdate(f.weeks[f.weeks.length - 1].weekEnd)}`} value={usd(f.weeks[f.weeks.length - 1].endingBalance)} bad={f.weeks[f.weeks.length - 1].endingBalance < 0} />
      </div>

      {lowNegative && (
        <div className="rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-sm text-ink">
          ⚠︎ Cash is projected to go <span className="font-medium text-[#B91C1C]">negative</span> the week of {fdate(f.lowPoint.weekEnd)} ({usd2(f.lowPoint.balance)}). Pull invoices forward or plan the gap.
        </div>
      )}

      {/* Ending-balance bars */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="mb-4 text-xs uppercase tracking-wider text-stone">Projected balance by week</p>
        <div className="flex items-end gap-1.5" style={{ height: 140 }}>
          {f.weeks.map((w) => {
            const h = Math.max(4, Math.round((Math.abs(w.endingBalance) / maxBal) * 120));
            const neg = w.endingBalance < 0;
            return (
              <div key={w.index} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${fdate(w.weekEnd)}: ${usd2(w.endingBalance)}`}>
                <div className={'w-full rounded-t ' + (neg ? 'bg-[#F87171]' : 'bg-tulip')} style={{ height: h }} />
                <span className="text-[9px] text-stone">{fdate(w.weekEnd).replace(' ', ' ')}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Week table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
            <tr><th className="px-4 py-3 font-medium">Week ending</th><th className="px-4 py-3 font-medium">In</th><th className="px-4 py-3 font-medium">Out</th><th className="px-4 py-3 font-medium">(payroll)</th><th className="px-4 py-3 font-medium">Net</th><th className="px-4 py-3 font-medium">Ending</th></tr>
          </thead>
          <tbody>
            {f.weeks.map((w) => (
              <tr key={w.index} className="border-t border-line">
                <td className="px-4 py-2.5 text-ink">{fdate(w.weekEnd)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[#3E9B4F]">{w.inflow ? usd(w.inflow) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums text-stone">{w.outflow ? usd(w.outflow) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums text-stone">{w.payroll ? usd(w.payroll) : '—'}</td>
                <td className={'px-4 py-2.5 tabular-nums ' + (w.net < 0 ? 'text-[#B91C1C]' : 'text-ink')}>{usd(w.net)}</td>
                <td className={'px-4 py-2.5 font-medium tabular-nums ' + (w.endingBalance < 0 ? 'text-[#B91C1C]' : 'text-ink')}>{usd(w.endingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drivers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">Biggest money in (A/R)</p>
          {topAr.length === 0 ? <p className="text-sm text-stone">No open receivables in the window.</p> : (
            <ul className="space-y-1.5 text-sm">
              {topAr.map((i, k) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink">{i.label}</span>
                  <span className="shrink-0 tabular-nums text-stone">{usd(i.amount)}{i.date ? ` · ${fdate(i.date)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wider text-stone">Payroll paydays</p>
          {payrolls.length === 0 ? <p className="text-sm text-stone">No paydays in the window.</p> : (
            <ul className="space-y-1.5 text-sm">
              {payrolls.map((i, k) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink">{i.label}</span>
                  <span className="shrink-0 tabular-nums text-stone">{usd(i.amount)}{i.date ? ` · ${fdate(i.date)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-stone">
        Payroll marked “accruing” grows as the crew clocks in and logs cars; “projected” uses the last period’s run rate. Ask Zordon “will I make payroll Friday?” for a read.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-stone">{label}</p>
      <p className={'mt-1 font-display text-2xl tabular-nums ' + (bad ? 'text-[#B91C1C]' : 'text-ink')}>{value}</p>
      {sub && <p className="text-[11px] text-stone">{sub}</p>}
    </div>
  );
}
