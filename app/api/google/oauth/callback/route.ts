import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { exchangeAndStore, isGoogleConfigured } from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET ?code=… → exchange the code for tokens, store them, and return to the page.
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  const back = new URL('/crm/cashflow', req.nextUrl.origin);
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    back.searchParams.set('google', 'forbidden');
    return NextResponse.redirect(back);
  }
  const code = req.nextUrl.searchParams.get('code');
  if (!code || !isGoogleConfigured()) {
    back.searchParams.set('google', 'error');
    return NextResponse.redirect(back);
  }
  try {
    await exchangeAndStore(req.nextUrl.origin, code);
    back.searchParams.set('google', 'connected');
  } catch {
    back.searchParams.set('google', 'error');
  }
  return NextResponse.redirect(back);
}
