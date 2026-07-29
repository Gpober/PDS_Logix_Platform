import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Row × month matrix of units (dimension = staff | service | location). Returns
// long-format cells; the client pivots into a grid with totals.
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const day = (k: string) => { const v = url.searchParams.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const dimRaw = url.searchParams.get('dimension');
  const dimension = dimRaw === 'service' || dimRaw === 'location' ? dimRaw : 'staff';
  const location = url.searchParams.get('location') || null;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_production_matrix', {
    p_dimension: dimension, p_location: location, p_from: day('from'), p_to: day('to'),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cells: data ?? [] });
}
