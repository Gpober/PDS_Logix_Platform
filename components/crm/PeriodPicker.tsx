'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PeriodKey } from '@/lib/period';

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=31536000;samesite=lax`;
}

// Global reporting time-frame dropdown. Writes the choice to cookies and
// refreshes so server components re-read the period (see lib/period.ts).
export function PeriodPicker({
  initialKey,
  initialFrom,
  initialTo,
}: {
  initialKey: PeriodKey;
  initialFrom: string | null;
  initialTo: string | null;
}) {
  const router = useRouter();
  const [key, setKey] = useState<PeriodKey>(initialKey);
  const [from, setFrom] = useState(initialFrom ?? '');
  const [to, setTo] = useState(initialTo ?? '');
  const [pending, startTransition] = useTransition();

  function apply(nextKey: PeriodKey, f = from, t = to) {
    setCookie('tt_period', nextKey);
    if (nextKey === 'custom') {
      setCookie('tt_from', f);
      setCookie('tt_to', t);
    }
    startTransition(() => router.refresh());
  }

  const control =
    'rounded-full border border-line bg-white px-3 py-1 text-xs outline-none focus:border-ink disabled:opacity-60';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-stone sm:inline">Period</span>
      <select
        value={key}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as PeriodKey;
          setKey(v);
          if (v !== 'custom') apply(v);
        }}
        className={control}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {key === 'custom' && (
        <>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={control}
          />
          <span className="text-xs text-stone">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={control}
          />
          <button
            type="button"
            disabled={pending || !from || !to}
            onClick={() => apply('custom')}
            className="rounded-full bg-ink px-3 py-1 text-xs text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
          >
            Apply
          </button>
        </>
      )}
    </div>
  );
}
