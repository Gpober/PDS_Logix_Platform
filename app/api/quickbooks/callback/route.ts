import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { connect } from '@/lib/integrations/quickbooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Intuit redirects here after the user authorizes: ?code=...&realmId=...&state=...
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const settings = (q: string) => NextResponse.redirect(new URL(`/crm/settings?qbo=${q}`, origin));

  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) return NextResponse.redirect(new URL('/login', origin));

  if (searchParams.get('error')) return settings('denied');

  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const state = searchParams.get('state');
  const expectedState = request.cookies.get('qbo_oauth_state')?.value;
  if (!code || !realmId) return settings('error');
  if (!state || !expectedState || state !== expectedState) return settings('state_mismatch');

  try {
    await connect(code, origin, realmId, profile?.id);
  } catch {
    return settings('error');
  }

  const res = settings('connected');
  res.cookies.delete('qbo_oauth_state');
  return res;
}
