import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAuthedClient } from '@/lib/integrations/google';
import { buildCashForecast, listForecastAdjustments } from '@/lib/crm/forecast';
import { buildSheetValues } from '@/lib/crm/cashflowSheet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → create a new Google Sheet in the connected Drive and write the forecast.
export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  const auth = await getAuthedClient();
  if (!auth) return NextResponse.json({ error: 'Connect Google first.' }, { status: 400 });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const [f, adjustments] = await Promise.all([buildCashForecast({ weeks: 13 }), listForecastAdjustments()]);
    const values = buildSheetValues(f, adjustments);

    const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: 'PDS Logix — Cash Forecast' } } });
    const id = created.data.spreadsheetId!;
    const url = created.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`;
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: 'A1', valueInputOption: 'USER_ENTERED', requestBody: { values } });

    const db = await createServerSupabase();
    await db.from('forecast_settings').update({ google_sheet_id: id, google_sheet_url: url, sheet_synced_at: new Date().toISOString() }).eq('id', 'singleton');
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create the sheet.' }, { status: 500 });
  }
}
