'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Multi-select "filter by creator" dropdown for the staff content view. Selection
// lives in the URL (?talent=<id>&talent=<id>) so the page stays server-rendered
// and the filtered view is shareable. The active month is preserved on change.
export function TalentFilter({
  talents,
  selected,
}: {
  talents: { id: string; name: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const apply = (ids: string[]) => {
    // Preserve every other param (month, view, sort, order); only rewrite talent.
    const sp = new URLSearchParams(params.toString());
    sp.delete('talent');
    ids.forEach((id) => sp.append('talent', id));
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
  };

  const toggle = (id: string) =>
    apply(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const label =
    selected.length === 0
      ? 'All creators'
      : selected.length === 1
        ? (talents.find((t) => t.id === selected[0])?.name ?? '1 creator')
        : `${selected.length} creators`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink hover:border-ink"
      >
        <span aria-hidden>🔎</span>
        {label}
        <span className="text-stone">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-72 w-60 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-lg">
            <button
              type="button"
              onClick={() => apply([])}
              className={
                'mb-1 w-full rounded-lg px-2 py-1.5 text-left text-sm ' +
                (selected.length === 0 ? 'bg-blush/60 text-ink' : 'text-stone hover:bg-blush/40')
              }
            >
              All creators
            </button>
            {talents.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-blush/40"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className="accent-tulip"
                />
                <span className="truncate">{t.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
