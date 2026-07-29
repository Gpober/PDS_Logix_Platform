import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAuthedClient } from '@/lib/integrations/google';
import { parseAdjustments } from '@/lib/crm/cashflowSheet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → read the sheet's ADJUSTMENTS block and pull it back into the app
// (sheet → app). Replaces the sheet-sourced adjustments; app-entered ones stay.
export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  const auth = await getAuthedClient();
  if (!auth) return NextResponse.json({ error: 'Connect Google first.' }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: settings } = await supabase.from('forecast_settings').select('google_sheet_id').eq('id', 'singleton').maybeSingle();
  const id = (settings as { google_sheet_id: string | null } | null)?.google_sheet_id;
  if (!id) return NextResponse.json({ error: 'No sheet linked yet.' }, { status: 400 });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'A1:Z300' });
    const parsed = parseAdjustments((resp.data.values ?? []) as (string | number)[][]);

    await supabase.from('forecast_adjustments').delete().eq('source', 'sheet');
    if (parsed.length) {
      await supabase.from('forecast_adjustments').insert(parsed.map((p) => ({ week_ending: p.week_ending, label: p.label, amount: p.amount, source: 'sheet' })));
    }
    await supabase.from('forecast_settings').update({ sheet_synced_at: new Date().toISOString() }).eq('id', 'singleton');
    return NextResponse.json({ ok: true, imported: parsed.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to pull from the sheet.' }, { status: 500 });
  }
}
