import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { disconnectGoogle } from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  await disconnectGoogle();
  // Also forget the linked sheet.
  const db = await createServerSupabase();
  await db.from('forecast_settings').update({ google_sheet_id: null, google_sheet_url: null, sheet_synced_at: null }).eq('id', 'singleton');
  return NextResponse.json({ ok: true });
}
