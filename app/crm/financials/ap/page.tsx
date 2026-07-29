import { getApAging } from '@/lib/integrations/pdsbooks';
import { Empty } from '@/components/crm/ui';
import { BooksNote, Kpi, usd, usd2 } from '@/components/crm/FinReport';

export const dynamic = 'force-dynamic';

export default async function ApPage() {
  const res = await getApAging();
  if (res.status === 'not_configured') return <BooksNote />;
  if (res.status === 'error') return <Empty>Couldn’t read payables: {res.message}</Empty>;

  const { rows, totals } = res.data;

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-stone">Accounts payable — what we owe, by age (as of today)</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Total owed" value={usd(totals.total)} />
        <Kpi label="Current" value={usd(totals.current)} />
        <Kpi label="31–60" value={usd(totals.d31_60)} />
        <Kpi label="61–90" value={usd(totals.d61_90)} />
        <Kpi label="90+" value={usd(totals.d90_plus)} bad={totals.d90_plus > 0} />
      </div>

      {rows.length === 0 ? <Empty>No open payables.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">Current</th><th className="px-4 py-3 font-medium">31–60</th><th className="px-4 py-3 font-medium">61–90</th><th className="px-4 py-3 font-medium">90+</th><th className="px-4 py-3 font-medium">Total</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vendor} className="border-t border-line hover:bg-blush/30">
                  <td className="px-4 py-2.5 text-ink">{r.vendor}</td>
                  <td className="px-4 py-2.5 tabular-nums text-stone">{r.current ? usd2(r.current) : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-stone">{r.d31_60 ? usd2(r.d31_60) : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-stone">{r.d61_90 ? usd2(r.d61_90) : '—'}</td>
                  <td className={'px-4 py-2.5 tabular-nums ' + (r.d90_plus ? 'text-[#B91C1C]' : 'text-stone')}>{r.d90_plus ? usd2(r.d90_plus) : '—'}</td>
                  <td className="px-4 py-2.5 font-medium tabular-nums text-ink">{usd2(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-blush/20 font-medium">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 tabular-nums">{usd2(totals.current)}</td>
                <td className="px-4 py-2.5 tabular-nums">{usd2(totals.d31_60)}</td>
                <td className="px-4 py-2.5 tabular-nums">{usd2(totals.d61_90)}</td>
                <td className="px-4 py-2.5 tabular-nums">{usd2(totals.d90_plus)}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink">{usd2(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
