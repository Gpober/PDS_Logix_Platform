import { NextResponse } from 'next/server';
import { getCurrentProfile, resolveMonthlyGoal } from '@/lib/crm/data';
import { productionSummaryFromSource } from '@/lib/production/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Aggregated production for a location + date range (drives the dashboard), plus
// the resolved monthly goal for the focus month. Owner/admin only.
//
// Reads Connecteam live for recent windows and the synced copy for older ones;
// the response carries `source` so the dashboard can say which it is showing and
// flag a degraded read rather than presenting a stale number as current.

const DEFAULT_DAYS = 30;
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
  const location = url.searchParams.get('location') || undefined;
  const month = url.searchParams.get('month') || undefined; // 'YYYY-MM' focus month for the goal

  // A live read needs a bounded window — an unbounded "everything on record"
  // request is served from the copy, which is what holds the full history.
  const to = day('to') ?? ymd(new Date());
  const from = day('from') ?? ymd(new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_DAYS - 1) * 86400_000));

  const { summary, read } = await productionSummaryFromSource({ from, to, location });

  let goal = null as null | { target: number; actual: number; location: string | null; period: string };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const target = await resolveMonthlyGoal(location ?? null, month);
    // Actual units for that month, from the same source as the summary so the
    // goal and the number it is measured against can never disagree.
    const [y, m] = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = ymd(new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 86400_000));
    const { summary: monthSummary } = await productionSummaryFromSource({
      from: monthStart,
      to: monthEnd,
      location,
    });
    goal = { target, actual: monthSummary.total_units, location: location ?? null, period: month };
  }

  return NextResponse.json({ summary, goal, source: read });
}
