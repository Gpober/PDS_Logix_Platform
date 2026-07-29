import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → forget the linked sheet (leaves the Google connection intact).
export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  const db = await createServerSupabase();
  await db.from('forecast_settings').update({ google_sheet_id: null, google_sheet_url: null, sheet_synced_at: null }).eq('id', 'singleton');
  return NextResponse.json({ ok: true });
}
