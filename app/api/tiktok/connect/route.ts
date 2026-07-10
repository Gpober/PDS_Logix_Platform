import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { tiktokAuthUrl, tiktokConfigured, tiktokRedirectUri } from '@/lib/integrations/tiktok';

// GET /api/tiktok/connect — starts TikTok Login to link the creator's account.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/portal/content?tt=${q}`, req.url));

  if (!tiktokConfigured()) return back('no_app');

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

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ n: nonce })).toString('base64url');
  const res = NextResponse.redirect(tiktokAuthUrl(tiktokRedirectUri(req.url), state));
  res.cookies.set('tt_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
