import { NextResponse } from 'next/server';
import { syncProductionEntries } from '@/lib/connecteam/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Connecteam → production_entries sync.
//   Vercel cron hits this each morning (see vercel.json) and syncs a rolling
//   window so late/edited entries are caught; the upsert dedupes by
//   (location, external_id) so re-runs are safe.
//
// Manual use:
//   ?dryRun=1                 — fetch + map but DON'T write; returns raw Connecteam
//                               payloads so we can verify the field mapping.
//   ?from=YYYY-MM-DD&to=...    — backfill a specific range.
//   Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; for manual calls
//   pass ?key=$CRON_SECRET.

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
  // Default window: the last 3 days (catches late/edited submissions). Backfill
  // overrides with explicit from/to.
  const from = url.searchParams.get('from') || ymd(new Date(Date.now() - 3 * 86400_000));

  try {
    const result = await syncProductionEntries({ from, to, dryRun });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    );
  }
}
