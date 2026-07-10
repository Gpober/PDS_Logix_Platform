'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Search + status filter + sort + Cards/List switch for the Deals list.
// URL-driven like the Companies/Talent lists; the period stays cookie-backed
// (see the header PeriodPicker), so the two never collide.
export function DealsToolbar({ showBudget }: { showBudget: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get('search') ?? '');

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  useEffect(() => {
    const current = params.get('search') ?? '';
    if (search === current) return;
    const t = setTimeout(() => update({ search: search || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? 'date';
  const order = params.get('order') ?? (sort === 'date' ? 'desc' : 'asc');
  const view = params.get('view') === 'list' ? 'list' : 'cards';

  const selectClass =
    'rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink';

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-[220px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone">⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or talent…"
          className="w-full rounded-xl border border-line bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-ink"
        />
      </div>

      <select value={status} onChange={(e) => update({ status: e.target.value })} className={selectClass}>
        <option value="">All statuses</option>
        <option value="pitched">Pitched</option>
        <option value="confirmed">Confirmed</option>
        <option value="live">Live</option>
        <option value="completed">Completed</option>
      </select>

      <select value={sort} onChange={(e) => update({ sort: e.target.value })} className={selectClass}>
        <option value="date">Date</option>
        <option value="company">Company</option>
        <option value="talent">Talent</option>
        <option value="status">Status</option>
        {showBudget && <option value="budget">Budget</option>}
      </select>
      <button
        onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc' })}
        className="rounded-xl border border-line bg-white px-3 py-2 text-sm hover:border-ink"
        aria-label="Toggle sort direction"
        title={order === 'asc' ? 'Ascending' : 'Descending'}
      >
        {order === 'asc' ? '↑' : '↓'}
      </button>

      <div className="flex overflow-hidden rounded-xl border border-line">
        <button
          onClick={() => update({ view: null })}
          className={`px-3 py-2 text-sm ${view === 'cards' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
        >
          Cards
        </button>
        <button
          onClick={() => update({ view: 'list' })}
          className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
        >
          List
        </button>
      </div>
    </div>
  );
}
