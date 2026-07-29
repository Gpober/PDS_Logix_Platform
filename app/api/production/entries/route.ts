import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// The raw units behind a number — drill-down detail. Filter by location, date
// range, service type, person, or a text search (VIN / model / #). Paginated.
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const p = url.searchParams;
  const day = (k: string) => { const v = p.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; };
  const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(p.get('offset')) || 0, 0);

  const supabase = await createServerSupabase();
  let q = supabase
    .from('production_entries')
    .select('external_id, location, staff_name, submitted_at, service_type, vehicle_year, vin_last6, model_type, capture', { count: 'exact' });

  const location = p.get('location');
  const from = day('from');
  const to = day('to');
  const service = p.get('service');
  const staff = p.get('staff');
  const search = (p.get('q') || '').trim();

  if (location) q = q.eq('location', location);
  if (from) q = q.gte('submitted_at', from);
  if (to) { const t = new Date(`${to}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); q = q.lt('submitted_at', t.toISOString().slice(0, 10)); }
  if (service) q = q.eq('service_type', service);
  if (staff) q = q.eq('staff_name', staff);
  if (search) q = q.or(`vin_last6.ilike.%${search}%,model_type.ilike.%${search}%,external_id.ilike.%${search}%`);

  const { data, count, error } = await q.order('submitted_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], count: count ?? 0, limit, offset });
}
