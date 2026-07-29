import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAuthedClient } from '@/lib/integrations/google';
import { buildCashForecast, listForecastAdjustments } from '@/lib/crm/forecast';
import { buildSheetValues } from '@/lib/crm/cashflowSheet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → rewrite the linked sheet from the current forecast (app → sheet).
export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  const auth = await getAuthedClient();
  if (!auth) return NextResponse.json({ error: 'Connect Google first.' }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: settings } = await supabase.from('forecast_settings').select('google_sheet_id').eq('id', 'singleton').maybeSingle();
  const id = (settings as { google_sheet_id: string | null } | null)?.google_sheet_id;
  if (!id) return NextResponse.json({ error: 'No sheet linked yet — create one first.' }, { status: 400 });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const [f, adjustments] = await Promise.all([buildCashForecast({ weeks: 13 }), listForecastAdjustments()]);
    const values = buildSheetValues(f, adjustments);
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: 'A1:Z300' });
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: 'A1', valueInputOption: 'USER_ENTERED', requestBody: { values } });
    await supabase.from('forecast_settings').update({ sheet_synced_at: new Date().toISOString() }).eq('id', 'singleton');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to push to the sheet.' }, { status: 500 });
  }
}
