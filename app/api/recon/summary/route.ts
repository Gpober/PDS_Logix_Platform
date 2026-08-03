import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { reconSummary } from '@/lib/crm/recon';

export const dynamic = 'force-dynamic';

// The scorecard for one reconciliation: both counts, the variance, what matched,
// and the day / location / service breakdowns. Owner/admin only.
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const batch = new URL(req.url).searchParams.get('batch');
  if (!batch) return NextResponse.json({ error: 'Missing batch.' }, { status: 400 });
  return NextResponse.json({ summary: await reconSummary(batch) });
}
