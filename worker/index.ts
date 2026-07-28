import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from './db';
import { buildSnapshot } from './snapshot';
import { runSpecialistOverSnapshot } from './crew';

// The Zordon operations-team worker. Runs on Railway as an always-on service:
// polls the team_runs queue, claims a queued run, builds a business snapshot,
// works the specialist crew over it with NO request timeout, and writes the
// results back incrementally so the Team view fills in as it goes.

const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

// Which specialists the crew runs by default, plus a couple the brief can add.
const DEFAULT_CREW = ['operations_analyst', 'pipeline_strategist'];

interface Run {
  id: string;
  scope: string;
}

interface ResultItem {
  target: string;
  specialist: string;
  label: string;
  report: string;
}

// Claim the oldest queued run atomically (update guarded by status='queued').
async function claimNext(sb: SupabaseClient): Promise<Run | null> {
  const { data: next } = await sb
    .from('team_runs')
    .select('id, scope')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return null;

  const { data: claimed } = await sb
    .from('team_runs')
    .update({ status: 'running' })
    .eq('id', (next as Run).id)
    .eq('status', 'queued')
    .select('id, scope')
    .maybeSingle();
  return (claimed as Run) ?? null; // null if another worker grabbed it first
}

function crewFor(brief: string): string[] {
  const b = brief.toLowerCase();
  const crew = [...DEFAULT_CREW];
  if (/quality|condition report|inspection/.test(b)) crew.push('quality_reviewer');
  if (/(client|account|dealer|fleet|insurer)/.test(b) && !crew.includes('client_manager')) crew.push('client_manager');
  return crew.slice(0, 3);
}

async function processRun(sb: SupabaseClient, run: Run): Promise<void> {
  const snapshot = await buildSnapshot(sb);
  const crew = crewFor(run.scope);
  const results: ResultItem[] = [];

  for (const key of crew) {
    const r = await runSpecialistOverSnapshot(key, run.scope, snapshot);
    results.push({ target: 'business', specialist: r.specialist, label: r.label, report: r.report });
    // Incremental write so the Team view shows each specialist as it finishes.
    await sb.from('team_runs').update({ results }).eq('id', run.id);
    console.log(`[worker] ${r.label} done (${results.length}/${crew.length})`);
  }

  await sb.from('team_runs').update({ status: 'done', results }).eq('id', run.id);
}

// Claim and process one queued run. Returns true if it did work.
async function tick(): Promise<boolean> {
  const sb = db();
  const run = await claimNext(sb);
  if (!run) return false;
  console.log(`[worker] claimed team run ${run.id}`);
  try {
    await processRun(sb, run);
    console.log(`[worker] run ${run.id} complete`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[worker] run ${run.id} failed:`, message);
    await sb.from('team_runs').update({ status: 'error', error: message }).eq('id', run.id);
  }
  return true;
}

// Two modes:
//   • Always-on (default): poll forever. Good for a Railway service.
//   • One-shot (RUN_ONCE=true): drain every queued run, then exit. Good for a
//     Railway cron job (cheaper — the container only runs on a schedule).
async function main(): Promise<void> {
  const runOnce = /^(1|true|yes)$/i.test(process.env.RUN_ONCE || '');

  if (runOnce) {
    console.log('[worker] one-shot mode: draining the queue');
    let processed = 0;
    while (processed < 100) {
      let did = false;
      try {
        did = await tick();
      } catch (e) {
        console.error('[worker] tick error:', e);
      }
      if (!did) break;
      processed += 1;
    }
    console.log(`[worker] one-shot done; processed ${processed} run(s)`);
    return;
  }

  console.log('[worker] always-on mode; polling every', POLL_MS, 'ms');
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error('[worker] tick error:', e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
