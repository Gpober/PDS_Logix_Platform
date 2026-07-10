import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  exchangeYouTubeCode,
  fetchMyYouTubeChannel,
  youtubeRedirectUri,
} from '@/lib/integrations/youtubeOAuth';

// GET /api/youtube/callback — Google redirects here after the creator authorizes.
export async function GET(req: NextRequest) {
  const portal = (q: string) => NextResponse.redirect(new URL(`/portal?sync=${q}`, req.url));

  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const cookieNonce = req.cookies.get('yt_oauth_state')?.value;
  if (!code || !stateRaw) return portal('api_error');

  let state: { a?: string; n?: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return portal('api_error');
  }
  // CSRF: the signed nonce in the URL must match the one we set as a cookie.
  if (!cookieNonce || state.n !== cookieNonce || !state.a) return portal('api_error');
  const accountId = state.a;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // Re-verify ownership (RLS) before writing anything.
  const { data: acct } = await supabase
    .from('talent_accounts')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();
  if (!acct) return portal('not_found');

  const redirectUri = youtubeRedirectUri(req.url);
  const tokens = await exchangeYouTubeCode(code, redirectUri);
  if (!tokens) return portal('api_error');

  const channel = await fetchMyYouTubeChannel(tokens.accessToken);
  if (!channel) return portal('no_channel');

  const expiry = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

  // Store the connection (tokens stay server-side under RLS).
  const { error: connErr } = await supabase.from('youtube_connections').upsert(
    {
      talent_account_id: accountId,
      channel_id: channel.channelId,
      channel_title: channel.title,
      // Keep any existing refresh_token if Google didn't send a new one.
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      access_token: tokens.accessToken,
      expiry,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'talent_account_id' },
  );

  // Reflect the verified stats onto the (public-safe) account row.
  const { error: acctErr } = await supabase
    .from('talent_accounts')
    .update({
      followers: channel.subscribers,
      verified: true,
      yt_channel_id: channel.channelId,
      url: `https://youtube.com/channel/${channel.channelId}`,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (connErr || acctErr) {
    console.error('youtube callback save', connErr?.message, acctErr?.message);
    return portal('save_failed');
  }

  const res = portal('connected');
  res.cookies.delete('yt_oauth_state');
  return res;
}
