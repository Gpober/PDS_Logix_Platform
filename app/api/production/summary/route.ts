import { NextResponse } from 'next/server';
import { getCurrentProfile, productionSummary, resolveMonthlyGoal } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Aggregated production for a location + date range (drives the dashboard), plus
// the resolved monthly goal for the focus month. Owner/admin only.
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const day = (k: string) => { const v = url.searchParams.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; };
  const location = url.searchParams.get('location') || undefined;
  const month = url.searchParams.get('month') || undefined; // 'YYYY-MM' focus month for the goal

  const summary = await productionSummary({ location, from: day('from'), to: day('to') });

  let goal = null as null | { target: number; actual: number; location: string | null; period: string };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const supabase = await createServerSupabase();
    const target = await resolveMonthlyGoal(location ?? null, month);
    // actual units for that month + location
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    let q = supabase.from('production_entries').select('*', { count: 'exact', head: true }).gte('submitted_at', start).lt('submitted_at', end);
    if (location) q = q.eq('location', location);
    const { count } = await q;
    goal = { target, actual: count ?? 0, location: location ?? null, period: month };
  }

  return NextResponse.json({ summary, goal });
}
