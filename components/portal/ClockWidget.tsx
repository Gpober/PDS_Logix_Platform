'use client';

import { useEffect, useState, useTransition } from 'react';
import { portalClockIn, portalClockOut } from '@/lib/crm/actions';

// Clock in / out with a live elapsed timer. State comes from the server (the
// worker's open time entry, if any); the buttons call the scoped server actions
// which revalidate the page. Timer ticks locally so the shift feels live.
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function ClockWidget({ openSince, entryId }: { openSince: string | null; entryId: string | null }) {
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const open = Boolean(openSince && entryId);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const elapsed = openSince ? now - new Date(openSince).getTime() : 0;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-wider text-stone">Time clock</p>
      {open ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#4ADE80]" />
            <span className="font-display text-4xl tabular-nums text-ink">{fmt(elapsed)}</span>
          </div>
          <p className="mt-1 text-sm text-stone">
            On the clock since{' '}
            {new Date(openSince as string).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
          <button
            onClick={() => start(() => portalClockOut(entryId as string))}
            disabled={pending}
            className="mt-4 w-full rounded-full bg-tulip px-4 py-3 text-sm font-medium text-ivory transition-colors hover:bg-tulip-dark disabled:opacity-50"
          >
            {pending ? 'Clocking out…' : 'Clock out'}
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl text-ink">You’re clocked out</p>
          <p className="mt-1 text-sm text-stone">Tap below to start your shift.</p>
          <button
            onClick={() => start(() => portalClockIn())}
            disabled={pending}
            className="mt-4 w-full rounded-full bg-tulip px-4 py-3 text-sm font-medium text-ivory transition-colors hover:bg-tulip-dark disabled:opacity-50"
          >
            {pending ? 'Clocking in…' : 'Clock in'}
          </button>
        </>
      )}
    </div>
  );
}
