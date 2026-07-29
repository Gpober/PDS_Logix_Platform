'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Search + position filter + pay-group filter + sort + Cards/List switch for the
// team roster. URL-driven and server-rendered, mirroring the Tulips talent page.
export function StaffToolbar({ positions }: { positions: string[] }) {
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

  const position = params.get('position') ?? '';
  const group = params.get('group') ?? '';
  const sort = params.get('sort') ?? 'name';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';
  const view = params.get('view') === 'list' ? 'list' : 'cards';
  const selectClass = 'rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink';

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-[220px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone">⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, role…"
          className="w-full rounded-xl border border-line bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-ink"
        />
      </div>

      <select value={position} onChange={(e) => update({ position: e.target.value })} className={selectClass}>
        <option value="">All positions</option>
        {positions.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <select value={group} onChange={(e) => update({ group: e.target.value })} className={selectClass}>
        <option value="">All pay groups</option>
        <option value="A">Group A</option>
        <option value="B">Group B</option>
      </select>

      <select value={sort} onChange={(e) => update({ sort: e.target.value })} className={selectClass}>
        <option value="name">Name</option>
        <option value="title">Position</option>
        <option value="group">Pay group</option>
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
        <button onClick={() => update({ view: null })} className={`px-3 py-2 text-sm ${view === 'cards' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}>Cards</button>
        <button onClick={() => update({ view: 'list' })} className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}>List</button>
      </div>
    </div>
  );
}
