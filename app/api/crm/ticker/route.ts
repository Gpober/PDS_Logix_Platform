import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { getTickerHighlights } from '@/lib/crm/ticker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Owner/admin performance + market ticker. Kept out of the layout render path so
// pages stay fast; the ticker component polls this and refreshes on its own.
export async function GET() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await getTickerHighlights() });
}
