import { NextResponse } from 'next/server';
import { syncProductionEntries } from '@/lib/connecteam/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Connecteam → production_entries sync.
//   Vercel cron hits this each morning (see vercel.json) and syncs a rolling
//   window so yesterday's units land, late/edited entries are caught, and a
//   missed run heals itself on the next one; the dedupe by
//   (location, external_id) makes the overlap free.
//
// Manual use:
//   ?dryRun=1                 — fetch + map but DON'T write; returns raw Connecteam
//                               payloads so we can verify the field mapping.
//   ?from=YYYY-MM-DD&to=...    — backfill a specific range.
//   ?days=N                    — rolling window size (default 4).
//   Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; for manual calls
//   pass ?key=$CRON_SECRET.

const DEFAULT_WINDOW_DAYS = 4;

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
  const to = url.searchParams.get('to') || ymd(new Date());
  const daysRaw = Number(url.searchParams.get('days'));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.trunc(daysRaw), 60) : DEFAULT_WINDOW_DAYS;
  // Default window: the last few days ending today — yesterday's production plus
  // enough slack to cover a skipped run or a late/edited submission. Backfill
  // overrides with explicit from/to.
  const from =
    url.searchParams.get('from') || ymd(new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86400_000));

  try {
    const result = await syncProductionEntries({ from, to, dryRun });
    // Surface the run in the function logs — a silent zero is the failure mode
    // that let this go unnoticed before.
    console.log(
      `[connecteam-sync] ${from}..${to} dryRun=${dryRun} fetched=${result.fetched} inserted=${result.inserted} skipped=${result.skipped}` +
        (result.error ? ` error=${result.error}` : ''),
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
