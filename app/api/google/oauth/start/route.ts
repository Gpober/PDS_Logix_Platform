import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { authUrl, isGoogleConfigured } from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET → redirect the owner to Google's consent screen.
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: 'Google isn’t configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  }
  return NextResponse.redirect(authUrl(req.nextUrl.origin));
}
