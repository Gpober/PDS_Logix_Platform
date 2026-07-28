import { NextResponse } from 'next/server';
import { getCurrentProfile, listTeamRuns } from '@/lib/crm/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Owner/admin feed the Team view polls to watch runs progress from
// queued → running → done as the Railway worker processes them.
export async function GET() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) return NextResponse.json({ runs: [] });
  return NextResponse.json({ runs: await listTeamRuns() });
}
