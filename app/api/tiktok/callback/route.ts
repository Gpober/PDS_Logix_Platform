import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveTikTok, tiktokRedirectUri } from '@/lib/integrations/tiktok';

// GET /api/tiktok/callback — TikTok redirects here after authorization.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/portal/content?tt=${q}`, req.url));

  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const cookieNonce = req.cookies.get('tt_oauth_state')?.value;
  if (!code || !stateRaw) return back('error');

  let state: { n?: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
  } catch {
    return back('error');
  }
  if (!cookieNonce || state.n !== cookieNonce) return back('error');

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  const { data: talent } = await supabase
    .from('talent')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!talent) return back('no_talent');
  const talentId = (talent as { id: string }).id;

  const link = await resolveTikTok(code, tiktokRedirectUri(req.url));
  if (!link) return back('error');

  const now = Date.now();
  const { error } = await supabase.from('tiktok_connections').upsert(
    {
      talent_id: talentId,
      open_id: link.openId,
      username: link.username,
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
      scope: link.scope,
      token_expiry: new Date(now + link.expiresIn * 1000).toISOString(),
      refresh_expiry: new Date(now + link.refreshExpiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'talent_id' },
  );
  if (error) {
    console.error('tiktok callback save', error.message);
    return back('save_failed');
  }

  const res = back('connected');
  res.cookies.delete('tt_oauth_state');
  return res;
}
