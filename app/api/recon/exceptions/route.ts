import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { reconExceptions, type ReconStatus } from '@/lib/crm/recon';

export const dynamic = 'force-dynamic';

// The units behind a number — filter by status (only_theirs / only_ours /
// matched / no_vin) and side. `format=csv` downloads the list to work the
// exceptions with the auction. Owner/admin only.

const STATUSES: ReconStatus[] = ['matched', 'only_ours', 'only_theirs', 'no_vin'];

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const p = new URL(req.url).searchParams;
  const batchId = p.get('batch');
  if (!batchId) return NextResponse.json({ error: 'Missing batch.' }, { status: 400 });

  const statusParam = p.get('status');
  const status = STATUSES.includes(statusParam as ReconStatus) ? (statusParam as ReconStatus) : undefined;
  const sideParam = p.get('side');
  const side = sideParam === 'ours' || sideParam === 'theirs' ? sideParam : undefined;
  const csv = p.get('format') === 'csv';

  const { count, rows } = await reconExceptions({
    batchId,
    status,
    side,
    limit: csv ? 1000 : Math.min(Math.max(Number(p.get('limit')) || 100, 1), 500),
    offset: csv ? 0 : Math.max(Number(p.get('offset')) || 0, 0),
  });

  if (!csv) return NextResponse.json({ count, rows });

  const head = ['side', 'status', 'serviced_on', 'vin6', 'vin', 'location', 'service_type', 'vehicle_desc', 'external_ref', 'amount', 'staff_name'];
  const body = rows.map((r) => head.map((h) => csvCell((r as unknown as Record<string, unknown>)[h])).join(','));
  return new NextResponse([head.join(','), ...body].join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="car-count-recon-${status ?? 'all'}.csv"`,
    },
  });
}
