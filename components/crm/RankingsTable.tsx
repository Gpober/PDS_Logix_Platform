'use client';

import Link from 'next/link';
import { useState } from 'react';

export type RankRow = {
  id: string;
  name: string;
  deals: number;
  billed: number;
  owed: number;
  total: number;
};

type Dimension = 'creators' | 'companies';
type SortKey = 'total' | 'billed' | 'owed' | 'deals';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const DIMS: { key: Dimension; label: string; hrefBase: string }[] = [
  { key: 'creators', label: 'By creator', hrefBase: '/crm/talent' },
  { key: 'companies', label: 'By company', hrefBase: '/crm/companies' },
];

export function RankingsTable({
  creators,
  companies,
  showMoney,
}: {
  creators: RankRow[];
  companies: RankRow[];
  showMoney: boolean;
}) {
  const [dim, setDim] = useState<Dimension>('creators');
  const [sort, setSort] = useState<SortKey>(showMoney ? 'total' : 'deals');
  const [view, setView] = useState<'cards' | 'list'>('cards');

  const active = DIMS.find((d) => d.key === dim)!;
  const rows = [...(dim === 'creators' ? creators : companies)].sort((a, b) => b[sort] - a[sort]);
  const max = Math.max(1, ...rows.map((r) => r.total));

  // Money columns only make sense to owners/admins; everyone can sort by deals.
  const cols: { key: SortKey; label: string; money: boolean }[] = [
    { key: 'billed', label: 'Paid', money: true },
    { key: 'owed', label: 'Owed', money: true },
    { key: 'total', label: 'Total', money: true },
    { key: 'deals', label: 'Deals', money: false },
  ];
  const visibleCols = cols.filter((c) => showMoney || !c.money);

  return (
    <div>
      {/* Dimension toggle + sort */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex rounded-full border border-line p-0.5">
          {DIMS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDim(d.key)}
              className={
                'rounded-full px-4 py-1.5 text-sm transition-colors ' +
                (dim === d.key ? 'bg-ink text-ivory' : 'text-stone hover:text-ink')
              }
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone">
          <span>Sort by</span>
          {visibleCols.map((c) => (
            <button
              key={c.key}
              onClick={() => setSort(c.key)}
              className={
                'rounded-full border px-2.5 py-1 transition-colors ' +
                (sort === c.key ? 'border-ink text-ink' : 'border-line hover:border-ink hover:text-ink')
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-full border border-line">
          {(['cards', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'px-3 py-1 text-xs capitalize transition-colors ' +
                (view === v ? 'bg-ink text-ivory' : 'text-stone hover:text-ink')
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-stone">No deals yet.</p>
      ) : view === 'cards' ? (
        <div className="mx-auto mt-5 max-w-3xl space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <Link href={`${active.hrefBase}/${r.id}`} className="font-medium hover:text-tulip">
                  <span className="mr-1.5 text-stone">#{i + 1}</span>
                  {r.name}
                </Link>
                <span className="text-sm text-stone">
                  {r.deals} {r.deals === 1 ? 'deal' : 'deals'}
                </span>
              </div>
              {showMoney && (
                <>
                  <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-line">
                    <div className="bg-[#5B8C5A]" style={{ width: `${(r.billed / max) * 100}%` }} />
                    <div className="bg-tulip" style={{ width: `${(r.owed / max) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="text-[#5B8C5A]">Paid {usd(r.billed)}</span>
                    <span className="text-tulip-dark">Owed {usd(r.owed)}</span>
                    <span className="text-stone">Total {usd(r.total)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-5 max-w-3xl overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">{dim === 'creators' ? 'Creator' : 'Company'}</th>
                <th className="px-4 py-3 font-medium">Deals</th>
                {showMoney && (
                  <>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Owed</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-blush/30">
                  <td className="border-t border-line px-4 py-3 text-stone">{i + 1}</td>
                  <td className="border-t border-line px-4 py-3">
                    <Link href={`${active.hrefBase}/${r.id}`} className="font-medium text-ink hover:text-tulip">
                      {r.name}
                    </Link>
                  </td>
                  <td className="border-t border-line px-4 py-3">{r.deals}</td>
                  {showMoney && (
                    <>
                      <td className="border-t border-line px-4 py-3 text-right text-[#5B8C5A]">{usd(r.billed)}</td>
                      <td className="border-t border-line px-4 py-3 text-right text-tulip-dark">{usd(r.owed)}</td>
                      <td className="border-t border-line px-4 py-3 text-right">{usd(r.total)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showMoney && (
        <p className="mt-5 text-center text-sm text-stone">Dollar amounts are shown to owners and admins only.</p>
      )}
    </div>
  );
}
