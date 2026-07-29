import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { googleStatus } from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  return NextResponse.json(await googleStatus());
}
