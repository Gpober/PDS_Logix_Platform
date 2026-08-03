import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { reconSummary } from '@/lib/crm/recon';
import { parseReconSheet } from '@/lib/crm/reconParse';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Upload one side of a car-count reconciliation (csv / xlsx / xls).
//
// side=theirs (default) — the auction's unit list / statement (Manheim).
// side=ours             — our own count file, when it isn't in the production log.
//
// Parsed server-side so a whole month's statement loads in one request.
// Re-uploading a side REPLACES that side of the batch, so a corrected file just
// supersedes the old one. Owner/admin only.

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Owner/admin only.' }, { status: 403 });
  }

  let file: File | null = null;
  let form: FormData;
  try {
    form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a file upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });

  const str = (k: string) => String(form.get(k) ?? '').trim();
  const side = str('side') === 'ours' ? 'ours' : 'theirs';
  const batchId = str('batch_id');
  const counterparty = str('counterparty') || 'Manheim';
  const location = str('location');
  const periodStart = isDay(str('period_start')) ? str('period_start') : null;
  const periodEnd = isDay(str('period_end')) ? str('period_end') : null;
  const note = str('note');
  const label = str('label');

  const parsed = parseReconSheet(Buffer.from(await file.arrayBuffer()), location || undefined);
  if ('error' in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { units, noVin } = parsed;

  const supabase = await createServerSupabase();

  // Resolve the batch: add to an existing one, or open a new reconciliation.
  let batch: { id: string; label: string };
  if (batchId) {
    const { data } = await supabase.from('recon_batches').select('id, label').eq('id', batchId).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: 'That reconciliation no longer exists.' }, { status: 404 });
    batch = data as { id: string; label: string };
    const patch: Record<string, unknown> = {};
    if (location) patch.location = location;
    if (periodStart) patch.period_start = periodStart;
    if (periodEnd) patch.period_end = periodEnd;
    if (note) patch.note = note;
    if (Object.keys(patch).length) await supabase.from('recon_batches').update(patch).eq('id', batch.id);
  } else {
    const days = units.map((u) => u.serviced_on).filter(Boolean).sort() as string[];
    const autoLabel =
      label ||
      [counterparty, location, days.length ? `${days[0]} → ${days[days.length - 1]}` : ''].filter(Boolean).join(' · ') ||
      file.name;
    const { data, error } = await supabase
      .from('recon_batches')
      .insert({
        label: autoLabel,
        counterparty,
        location: location || null,
        period_start: periodStart ?? days[0] ?? null,
        period_end: periodEnd ?? days[days.length - 1] ?? null,
        note: note || null,
      })
      .select('id, label')
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? 'Could not open the reconciliation.' }, { status: 500 });
    }
    batch = data as { id: string; label: string };
  }

  // Re-uploading a side replaces it, so a corrected file supersedes the old one.
  await supabase.from('recon_units').delete().eq('batch_id', batch.id).eq('side', side);

  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < units.length; i += 500) {
    const chunk = units.slice(i, i + 500).map((u) => ({ ...u, batch_id: batch.id, side }));
    const { error } = await supabase.from('recon_units').insert(chunk);
    if (error) errors.push(error.message);
    else inserted += chunk.length;
  }
  if (!inserted) {
    return NextResponse.json({ ok: false, error: errors[0] ?? 'Nothing could be loaded.' }, { status: 500 });
  }

  await supabase
    .from('recon_batches')
    .update(side === 'ours' ? { ours_rows: inserted, ours_file: file.name } : { theirs_rows: inserted, theirs_file: file.name })
    .eq('id', batch.id);

  const summary = await reconSummary(batch.id);
  const whose = side === 'ours' ? 'our' : `${counterparty}’s`;
  const parts = [`Loaded ${inserted.toLocaleString('en-US')} ${whose} unit${inserted === 1 ? '' : 's'} from ${file.name}`];
  if (noVin) parts.push(`${noVin} row${noVin === 1 ? '' : 's'} had no VIN (listed as unmatchable)`);
  if (errors.length) parts.push(`${errors.length} batch error(s)`);

  return NextResponse.json({
    ok: true,
    batch_id: batch.id,
    label: batch.label,
    side,
    inserted,
    no_vin: noVin,
    message: parts.join(' · ') + '.',
    summary,
  });
}
