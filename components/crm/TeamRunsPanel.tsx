'use client';

import { useEffect, useState } from 'react';
import { startTeamRun, removeTeamRun } from '@/lib/crm/actions';
import type { TeamRun } from '@/lib/crm/types';

const STATUS: Record<TeamRun['status'], { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'bg-stone/15 text-stone' },
  running: { label: 'Running…', cls: 'bg-[#4A7C8C]/15 text-[#4A7C8C]' },
  done: { label: 'Done', cls: 'bg-[#5B8C5A]/15 text-[#5B8C5A]' },
  error: { label: 'Error', cls: 'bg-tulip/15 text-tulip-dark' },
};

const QUICK_BRIEFS = [
  'Review the whole operation — where jobs are stuck, margin leaks, and what to invoice next.',
  'Find where our next revenue is: leads to follow up and clients due for repeat work.',
  'Review job quality — condition reports that are missing detail and slow turnarounds.',
];

export function TeamRunsPanel({ initialRuns }: { initialRuns: TeamRun[] }) {
  const [runs, setRuns] = useState<TeamRun[]>(initialRuns);
  const [brief, setBrief] = useState('');

  // Poll while anything is in flight so results appear as the worker finishes.
  useEffect(() => {
    const active = runs.some((r) => r.status === 'queued' || r.status === 'running');
    if (!active) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/crm/team-runs', { cache: 'no-store' });
        if (res.ok) setRuns((await res.json()).runs ?? []);
      } catch {
        /* keep last */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [runs]);

  return (
    <div className="space-y-8">
      <form action={startTeamRun} className="rounded-2xl border border-line bg-white p-5">
        <textarea
          name="scope"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder="Brief for the crew — e.g. “review the operation and tell me where the next revenue is”"
          className="mb-3 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_BRIEFS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBrief(q)}
              className="rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-ink hover:text-ink"
            >
              {q.split('—')[0].trim()}
            </button>
          ))}
        </div>
        <button className="rounded-full bg-tulip px-5 py-2.5 text-sm text-ivory transition-opacity hover:opacity-90">
          Run the team
        </button>
        <p className="mt-2 text-xs text-stone">
          The crew runs in the background on the worker — no need to wait on this page.
        </p>
      </form>

      {runs.length === 0 ? (
        <p className="text-center text-sm text-stone">No runs yet. Launch one above.</p>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => (
            <div key={run.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={'rounded-full px-2.5 py-0.5 text-xs ' + STATUS[run.status].cls}>{STATUS[run.status].label}</span>
                <span className="text-sm text-ink">{run.scope}</span>
                <span className="ml-auto text-xs text-stone">
                  {new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <form action={removeTeamRun}>
                  <input type="hidden" name="id" value={run.id} />
                  <button className="rounded-full border border-line px-2.5 py-0.5 text-xs text-stone hover:border-tulip hover:text-tulip">
                    Remove
                  </button>
                </form>
              </div>

              {run.status === 'error' && run.error && <p className="text-sm text-tulip-dark">{run.error}</p>}

              {run.results && run.results.length > 0 && (
                <div className="mt-3 space-y-3">
                  {run.results.map((item, i) => (
                    <div key={i} className="rounded-xl border border-line p-4">
                      <div className="mb-1 text-xs uppercase tracking-wider text-stone">{item.label}</div>
                      <p className="whitespace-pre-wrap text-sm text-ink">{item.report}</p>
                    </div>
                  ))}
                </div>
              )}

              {(run.status === 'queued' || run.status === 'running') && (
                <p className="text-sm text-stone">The crew is working… results appear here as they land.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
