'use client';

import { useState } from 'react';
import type { MatrixRow } from '@/lib/crm/salesAnalytics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// Talent x month grid with a $/count toggle, mirroring the client's
// "Talent Review" sheets.
export function MatrixTable({
  rows,
  monthTotals,
  grandTotal,
}: {
  rows: MatrixRow[];
  monthTotals: number[];
  grandTotal: number;
}) {
  const [mode, setMode] = useState<'amount' | 'count'>('amount');

  const countMonthTotals = MONTHS.map((_, i) => rows.reduce((s, r) => s + r.countMonths[i], 0));
  const grandCount = rows.reduce((s, r) => s + r.totalCount, 0);
  const fmt = (n: number) => (mode === 'amount' ? (n ? usd(n) : '—') : n || '—');

  return (
    <div>
      <div className="mb-3 flex justify-center">
        <div className="flex overflow-hidden rounded-full border border-line">
          {(['amount', 'count'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                'px-3 py-1 text-xs transition-colors ' +
                (mode === m ? 'bg-ink text-ivory' : 'text-stone hover:text-ink')
              }
            >
              {m === 'amount' ? '$ Amount' : 'Count'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-stone">
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium">Talent</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-blush/30">
                <td className="sticky left-0 bg-white px-3 py-2 font-medium text-ink">{r.name}</td>
                {(mode === 'amount' ? r.months : r.countMonths).map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right text-stone">
                    {fmt(v)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium text-ink">
                  {fmt(mode === 'amount' ? r.total : r.totalCount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <td className="sticky left-0 bg-white px-3 py-2 text-ink">Total</td>
              {(mode === 'amount' ? monthTotals : countMonthTotals).map((v, i) => (
                <td key={i} className="px-3 py-2 text-right text-ink">
                  {fmt(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-ink">{fmt(mode === 'amount' ? grandTotal : grandCount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
