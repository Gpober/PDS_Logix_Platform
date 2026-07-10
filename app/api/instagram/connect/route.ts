import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  instagramAuthUrl,
  instagramConfigured,
  instagramRedirectUri,
} from '@/lib/integrations/instagram';

// GET /api/instagram/connect — starts Facebook Login to link the creator's IG.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/portal/content?ig=${q}`, req.url));

  if (!instagramConfigured()) return back('no_app');

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // Confirm the caller has a talent row (RLS current_talent_id) to attach to.
  const { data: talent } = await supabase.from('talent').select('id').eq('user_id', user.id).maybeSingle();
  if (!talent) return back('no_talent');

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ n: nonce })).toString('base64url');
  const res = NextResponse.redirect(instagramAuthUrl(instagramRedirectUri(req.url), state));
  res.cookies.set('ig_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
