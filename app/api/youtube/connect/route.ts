import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  youtubeAuthUrl,
  youtubeOAuthConfigured,
  youtubeRedirectUri,
} from '@/lib/integrations/youtubeOAuth';

// GET /api/youtube/connect?account=<talent_account_id>
// Kicks off the Google OAuth flow to link a creator's YouTube channel.
export async function GET(req: NextRequest) {
  const portal = (q: string) => NextResponse.redirect(new URL(`/portal?sync=${q}`, req.url));

  if (!youtubeOAuthConfigured()) return portal('no_key');

  const accountId = req.nextUrl.searchParams.get('account');
  if (!accountId) return portal('unresolved');

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // RLS ensures the creator can only see their own account; staff can see all.
  const { data: acct } = await supabase
    .from('talent_accounts')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();
  if (!acct) return portal('not_found');

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ a: accountId, n: nonce })).toString('base64url');
  const redirectUri = youtubeRedirectUri(req.url);

  const res = NextResponse.redirect(youtubeAuthUrl(redirectUri, state));
  res.cookies.set('yt_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
