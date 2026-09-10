import { NextResponse } from 'next/server';
import { syncProductionEntries } from '@/lib/connecteam/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Nightly Connecteam -> production_entries BACKUP sync.
//
// Reports and MCP requests read Connecteam live; this keeps the durable copy
// underneath converged with it, so history stays queryable and an outage
// degrades a report instead of emptying it. Rows upsert on
// (form_id, external_id), so re-running a window repairs edits rather than
// skipping them, and the overlap between runs is free.
//
// Manual use:
//   ?dryRun=1                 — fetch + map but DON'T write; returns a sample.
//   ?from=YYYY-MM-DD&to=...   — re-sync a specific range.
//   ?days=N                   — rolling window size (default 10).
//   ?prune=1                  — also delete rows the live read no longer sees
//                               (submissions voided in Connecteam). Refused
//                               unless the live read completed.
//   Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; for manual calls
//   pass ?key=$CRON_SECRET.

// Wider than the old 4 days: a run that fails now heals over more subsequent
// runs, and the upsert makes re-covering the overlap cost nothing but time.
const DEFAULT_WINDOW_DAYS = 10;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authed =
      req.headers.get('authorization') === `Bearer ${secret}` ||
      url.searchParams.get('key') === secret;
    if (!authed) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const prune = url.searchParams.get('prune') === '1';
  const to = url.searchParams.get('to') || ymd(new Date());
  const daysRaw = Number(url.searchParams.get('days'));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.trunc(daysRaw), 60) : DEFAULT_WINDOW_DAYS;
  const from =
    url.searchParams.get('from') || ymd(new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86400_000));

  try {
    const result = await syncProductionEntries({ from, to, dryRun, prune });
    // Surface the run in the function logs — a silent zero is the failure mode
    // that let this go unnoticed before.
    console.log(
      `[connecteam-sync] ${from}..${to} dryRun=${dryRun} forms=${result.forms.length} fetched=${result.fetched} upserted=${result.upserted} pruned=${result.pruned} discovered=${result.discovered.length}` +
        (result.errors.length ? ` errors=${JSON.stringify(result.errors.slice(0, 3))}` : ''),
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    console.error('[connecteam-sync] failed', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    );
  }
}
