import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { parseReconSheet } from '@/lib/crm/reconParse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Look at a car-count file WITHOUT storing anything: the chat posts a dropped
// file here so Zordon can describe what's in it before proposing the import.
// Reads .xlsx server-side, which the browser can't do without shipping the
// spreadsheet parser to every visitor. Nothing is written until the human
// confirms import_car_count, which re-sends the same file to /api/recon/import.
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Owner/admin only.' }, { status: 403 });
  }

  let file: File | null = null;
  try {
    file = (await req.formData()).get('file') as File | null;
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a file upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });

  const parsed = parseReconSheet(Buffer.from(await file.arrayBuffer()));
  if ('error' in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const days = parsed.units.map((u) => u.serviced_on).filter(Boolean).sort() as string[];
  const locations = [...new Set(parsed.units.map((u) => u.location).filter(Boolean))].slice(0, 8) as string[];
  const amounts = parsed.units.map((u) => u.amount).filter((a): a is number => a != null);

  return NextResponse.json({
    ok: true,
    count: parsed.units.length,
    no_vin: parsed.noVin,
    columns: parsed.columns,
    date_from: days[0] ?? null,
    date_to: days[days.length - 1] ?? null,
    locations,
    amount_total: amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100 : null,
    sample: parsed.units.slice(0, 8).map((u) => ({
      vin6: u.vin6,
      day: u.serviced_on,
      ref: u.external_ref,
      service: u.service_type,
      amount: u.amount,
    })),
  });
}
