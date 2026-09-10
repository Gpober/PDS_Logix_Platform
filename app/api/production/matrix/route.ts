import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { readProduction } from '@/lib/production/source';
import type { ProductionRow } from '@/lib/connecteam/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Row x month matrix of units (dimension = staff | service | location). Returns
// long-format cells; the client pivots into a grid with totals.
//
// Built from the same source layer as the summary and the drill-down rather than
// its own RPC over the stored copy — three views of one number must not be able
// to read from two different places.

const DEFAULT_DAYS = 180;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const day = (k: string) => {
    const v = url.searchParams.get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  const dimRaw = url.searchParams.get('dimension');
  const dimension = dimRaw === 'service' || dimRaw === 'location' ? dimRaw : 'staff';
  const location = url.searchParams.get('location') || undefined;

  const to = day('to') ?? ymd(new Date());
  const from = day('from') ?? ymd(new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_DAYS - 1) * 86400_000));

  const read = await readProduction({ from, to, location });

  const pick = (r: ProductionRow) =>
    dimension === 'service' ? r.service_type : dimension === 'location' ? r.location : r.staff_name;

  // Nested maps rather than a joined string key — a person's name contains
  // spaces, so any flat separator risks splitting the row label apart again.
  const byKey = new Map<string, Map<string, number>>();
  for (const r of read.rows) {
    if (location && r.location !== location) continue;
    const month = r.submitted_at?.slice(0, 7);
    if (!month) continue;
    const key = pick(r) || 'Unassigned';
    let months = byKey.get(key);
    if (!months) {
      months = new Map<string, number>();
      byKey.set(key, months);
    }
    months.set(month, (months.get(month) ?? 0) + 1);
  }

  const cells: { key: string; month: string; units: number }[] = [];
  for (const [key, months] of byKey) {
    for (const [month, units] of months) cells.push({ key, month, units });
  }

  const { rows: _rows, ...source } = read;
  return NextResponse.json({ cells, source });
}
