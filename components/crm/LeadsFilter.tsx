'use client';

import { useRouter, useSearchParams } from 'next/navigation';

// Owner + "due only" filter for the leads list. Drives ?owner= / ?due= in the
// URL so the server component re-queries.
export function LeadsFilter({ owners }: { owners: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const owner = params.get('owner') ?? '';
  const due = params.get('due') === '1';

  function update(next: { owner?: string; due?: boolean }) {
    const p = new URLSearchParams(params.toString());
    if ('owner' in next) {
      if (next.owner) p.set('owner', next.owner);
      else p.delete('owner');
    }
    if ('due' in next) {
      if (next.due) p.set('due', '1');
      else p.delete('due');
    }
    const qs = p.toString();
    router.push(qs ? `/crm/leads?${qs}` : '/crm/leads');
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
      <select
        value={owner}
        onChange={(e) => update({ owner: e.target.value })}
        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
      >
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-stone">
        <input
          type="checkbox"
          checked={due}
          onChange={(e) => update({ due: e.target.checked })}
          className="h-4 w-4 accent-tulip"
        />
        Due only
      </label>
    </div>
  );
}
