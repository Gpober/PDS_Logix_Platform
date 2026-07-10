'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Search + filter + view controls for the Companies list. Everything lives in
// the URL (?search/type/status/sort/order/view/page) so the server component
// can read it, results stay shareable, and Supabase RLS runs server-side.
export function CompaniesToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get('search') ?? '');

  // Push a set of param changes, always resetting to page 1 on a filter change.
  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  // Debounce the search box so we don't hammer the server on every keystroke.
  useEffect(() => {
    const current = params.get('search') ?? '';
    if (search === current) return;
    const t = setTimeout(() => update({ search: search || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const view = params.get('view') === 'list' ? 'list' : 'cards';
  const sort = params.get('sort') ?? 'name';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';

  const selectClass =
    'rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink';

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-[220px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone">
          ⌕
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, category, website…"
          className="w-full rounded-xl border border-line bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-ink"
        />
      </div>

      <select value={type} onChange={(e) => update({ type: e.target.value })} className={selectClass}>
        <option value="">All types</option>
        <option value="brand">Brands</option>
        <option value="agency">Agencies</option>
        <option value="other">Other</option>
      </select>

      <select
        value={status}
        onChange={(e) => update({ status: e.target.value })}
        className={selectClass}
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="prospect">Prospect</option>
        <option value="inactive">Inactive</option>
      </select>

      {/* Sort control (works for both card and list views). */}
      <select value={sort} onChange={(e) => update({ sort: e.target.value })} className={selectClass}>
        <option value="name">Name</option>
        <option value="type">Type</option>
        <option value="category">Category</option>
        <option value="status">Status</option>
        <option value="contact_count">Contacts</option>
        <option value="deal_count">Bookings</option>
        <option value="date_last_booked">Last booked</option>
      </select>
      <button
        onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc' }, false)}
        className="rounded-xl border border-line bg-white px-3 py-2 text-sm hover:border-ink"
        aria-label="Toggle sort direction"
        title={order === 'asc' ? 'Ascending' : 'Descending'}
      >
        {order === 'asc' ? '↑' : '↓'}
      </button>

      <div className="flex overflow-hidden rounded-xl border border-line">
        <button
          onClick={() => update({ view: null }, false)}
          className={`px-3 py-2 text-sm ${view === 'cards' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
        >
          Cards
        </button>
        <button
          onClick={() => update({ view: 'list' }, false)}
          className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
        >
          List
        </button>
      </div>
    </div>
  );
}

// A clickable, sort-aware column header for the list view. Renders a link that
// toggles order when you click the active column, else sorts ascending by it.
export function SortHeader({
  label,
  column,
}: {
  label: string;
  column: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeSort = params.get('sort') ?? 'name';
  const activeOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const isActive = activeSort === column;

  function go() {
    const next = new URLSearchParams(params.toString());
    next.set('sort', column);
    next.set('order', isActive && activeOrder === 'asc' ? 'desc' : 'asc');
    next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={go} className="flex items-center gap-1 hover:text-ink">
        {label}
        <span className="text-[10px]">{isActive ? (activeOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}
