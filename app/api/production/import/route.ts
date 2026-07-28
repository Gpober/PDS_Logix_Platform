import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bulk import of a Connecteam "Entries" production export (xlsx): each row is one
// unit serviced (who, when, VIN, model, service type). Parses server-side and
// inserts every row into production_entries — no size limit. Owner/admin only.
// 2026 only (per current scope). Idempotent: dedupes by (location, external_id).

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Map the known Connecteam headers (case-insensitive, tolerant of variants).
function colIndex(headers: string[], res: RegExp[]): number {
  for (const re of res) {
    const i = headers.findIndex((h) => re.test(h.trim()));
    if (i >= 0) return i;
  }
  return -1;
}

function toIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Owner/admin only.' }, { status: 403 });
  }

  let file: File | null = null;
  let locationOverride = '';
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
    locationOverride = String(form.get('location') ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a file upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });

  let grid: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not read the spreadsheet.' }, { status: 400 });
  }
  if (!grid.length) return NextResponse.json({ ok: false, error: 'The sheet is empty.' }, { status: 400 });

  const headers = (grid[0] as unknown[]).map((h) => String(h ?? ''));
  const iExt = colIndex(headers, [/^#$/, /entry\s*id/i, /^id$/i]);
  const iName = colIndex(headers, [/full\s*name/i, /^name$/i, /employee/i]);
  const iDate = colIndex(headers, [/submission\s*date/i, /^date$/i, /timestamp/i]);
  const iYear = colIndex(headers, [/^year$/i]);
  const iVin = colIndex(headers, [/vin/i]);
  const iModel = colIndex(headers, [/model/i]);
  const iSvc = colIndex(headers, [/service\s*type/i, /^service$/i]);
  const iCap = colIndex(headers, [/^capture$/i]);
  const iLoc = colIndex(headers, [/^location$/i, /location/i]);
  const iWo = colIndex(headers, [/work\s*order/i]);
  const iNote = colIndex(headers, [/^note$/i, /notes/i]);
  const iStatus = colIndex(headers, [/^status$/i]);
  if (iName < 0 || iSvc < 0) {
    return NextResponse.json({ ok: false, error: 'This doesn’t look like a production export (missing Full name / Service Type columns).' }, { status: 400 });
  }

  const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : undefined);

  const supabase = await createServerSupabase();

  // Staff name → id (normalized) so each unit links to a team member.
  const staffByName = new Map<string, string>();
  {
    const { data } = await supabase.from('staff').select('id, name');
    for (const s of (data ?? []) as { id: string; name: string | null }[]) {
      const n = norm(s.name).toLowerCase();
      if (n) staffByName.set(n, s.id);
    }
  }

  // Build the rows (2026 only), tracking the locations we touch.
  type Row = { external_id: string | null; location: string; staff_name: string | null; staff_id: string | null; submitted_at: string | null; service_type: string | null; vehicle_year: number | null; vin_last6: string | null; model_type: string | null; capture: string | null; work_order_number: string | null; note: string | null; status: string | null };
  const rows: Row[] = [];
  const locations = new Set<string>();
  let skippedYear = 0;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const name = norm(cell(row, iName));
    const svc = norm(cell(row, iSvc));
    const submitted = toIso(cell(row, iDate));
    if (submitted && !submitted.startsWith('2026')) { skippedYear++; continue; } // 2026 scope
    const location = norm(cell(row, iLoc)) || locationOverride || 'Unspecified';
    locations.add(location);
    const yearRaw = Number(cell(row, iYear));
    rows.push({
      external_id: norm(cell(row, iExt)) || null,
      location,
      staff_name: name || null,
      staff_id: name ? staffByName.get(name.toLowerCase()) ?? null : null,
      submitted_at: submitted,
      service_type: svc || null,
      vehicle_year: Number.isFinite(yearRaw) && yearRaw > 1900 ? Math.trunc(yearRaw) : null,
      vin_last6: norm(cell(row, iVin)) || null,
      model_type: norm(cell(row, iModel)) || null,
      capture: norm(cell(row, iCap)) || null,
      work_order_number: norm(cell(row, iWo)) || null,
      note: norm(cell(row, iNote)) || null,
      status: norm(cell(row, iStatus)) || null,
    });
  }
  if (!rows.length) return NextResponse.json({ ok: false, error: `No 2026 rows found${skippedYear ? ` (${skippedYear} rows were not 2026)` : ''}.` }, { status: 400 });

  // Dedupe against what's already stored for these locations (idempotent re-import).
  const existing = new Set<string>();
  for (const loc of locations) {
    let from = 0;
    for (;;) {
      const { data } = await supabase
        .from('production_entries')
        .select('external_id')
        .eq('location', loc)
        .not('external_id', 'is', null)
        .range(from, from + 999);
      const batch = (data ?? []) as { external_id: string | null }[];
      for (const e of batch) if (e.external_id) existing.add(`${loc}::${e.external_id}`);
      if (batch.length < 1000) break;
      from += 1000;
    }
  }

  const fresh = rows.filter((r) => !(r.external_id && existing.has(`${r.location}::${r.external_id}`)));
  const alreadyThere = rows.length - fresh.length;

  // Insert in server-side batches (no request-size worries here).
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500);
    const { error } = await supabase.from('production_entries').insert(chunk);
    if (error) errors.push(error.message);
    else inserted += chunk.length;
  }

  const locList = [...locations].join(', ');
  const parts = [`Imported ${inserted} unit${inserted === 1 ? '' : 's'} for ${locList}`];
  if (alreadyThere) parts.push(`${alreadyThere} already loaded (skipped)`);
  if (skippedYear) parts.push(`${skippedYear} non-2026 rows skipped`);
  if (errors.length) parts.push(`${errors.length} batch error(s)`);
  return NextResponse.json({
    ok: errors.length === 0 || inserted > 0,
    message: parts.join(' · ') + '.',
    inserted,
    skipped: alreadyThere,
    locations: [...locations],
    error: errors[0],
  });
}
