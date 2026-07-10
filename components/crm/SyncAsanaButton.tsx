'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncAsana } from '@/lib/asana/sync';

// Owner-only button that runs the repeatable Asana → Supabase sync.
export function SyncAsanaButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const result = await syncAsana();
      if (result.ok) {
        setMsg(
          `Synced ${result.projects} projects · ${result.tasks} tasks · ${result.deals} deals · ${result.leads} leads.`,
        );
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-full bg-ink px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
      >
        {pending ? 'Syncing…' : 'Sync Asana'}
      </button>
      {msg && <span className="text-xs text-[#5B8C5A]">{msg}</span>}
      {err && <span className="text-xs text-tulip">{err}</span>}
    </div>
  );
}
