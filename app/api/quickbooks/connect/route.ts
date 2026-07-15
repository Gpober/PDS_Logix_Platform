import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentProfile } from '@/lib/crm/data';
import { qboConfigured, getAuthorizeUrl } from '@/lib/integrations/quickbooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Kick off the QuickBooks OAuth flow: team-only, then redirect to Intuit.
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return NextResponse.redirect(new URL('/login?next=/crm/settings', request.url));
  }
  if (!qboConfigured()) {
    return NextResponse.redirect(new URL('/crm/settings?qbo=unconfigured', request.url));
  }

  const state = randomUUID();
  const authorizeUrl = getAuthorizeUrl(request.nextUrl.origin, state);
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set('qbo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
