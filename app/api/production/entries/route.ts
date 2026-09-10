import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { readProduction } from '@/lib/production/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The raw units behind a number — drill-down detail. Filter by location, date
// range, service type, person, or a text search (VIN / model / #). Paginated.
//
// Served from the same source layer as the summary, so a drill-down always adds
// up to the total it was opened from — reading the number live and the detail
// from the copy is exactly how a discrepancy hides.

const DEFAULT_DAYS = 30;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const p = url.searchParams;
  const day = (k: string) => {
    const v = p.get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(p.get('offset')) || 0, 0);

  const to = day('to') ?? ymd(new Date());
  const from = day('from') ?? ymd(new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_DAYS - 1) * 86400_000));
  const location = p.get('location') || undefined;

  const read = await readProduction({ from, to, location });

  const service = p.get('service');
  const staff = p.get('staff');
  const search = (p.get('q') || '').trim().toLowerCase();

  let rows = read.rows;
  if (location) rows = rows.filter((r) => r.location === location);
  if (service) rows = rows.filter((r) => r.service_type === service);
  if (staff) rows = rows.filter((r) => r.staff_name === staff);
  if (search) {
    rows = rows.filter((r) =>
      [r.vin_last6, r.model_type, r.external_id].some((v) => v && v.toLowerCase().includes(search)),
    );
  }

  rows = rows.sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));
  const page = rows.slice(offset, offset + limit).map((r) => ({
    external_id: r.external_id,
    location: r.location,
    staff_name: r.staff_name,
    submitted_at: r.submitted_at,
    service_type: r.service_type,
    vehicle_year: r.vehicle_year,
    vin_last6: r.vin_last6,
    model_type: r.model_type,
    capture: r.capture,
  }));

  const { rows: _rows, ...source } = read;
  return NextResponse.json({ rows: page, count: rows.length, limit, offset, source });
}
