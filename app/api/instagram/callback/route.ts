import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveInstagram, instagramRedirectUri } from '@/lib/integrations/instagram';

// GET /api/instagram/callback — Facebook redirects here after authorization.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/portal/content?ig=${q}`, req.url));

  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const cookieNonce = req.cookies.get('ig_oauth_state')?.value;
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
  const { data: talent } = await supabase.from('talent').select('id').eq('user_id', user.id).maybeSingle();
  if (!talent) return back('no_talent');
  const talentId = (talent as { id: string }).id;

  const link = await resolveInstagram(code, instagramRedirectUri(req.url));
  if (!link) return back('no_business'); // no IG Business account linked to a Page

  const { error } = await supabase.from('instagram_connections').upsert(
    {
      talent_id: talentId,
      ig_user_id: link.igUserId,
      username: link.username,
      page_id: link.pageId,
      access_token: link.pageToken,
      token_expiry: new Date(Date.now() + link.expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'talent_id' },
  );
  if (error) {
    console.error('instagram callback save', error.message);
    return back('save_failed');
  }

  const res = back('connected');
  res.cookies.delete('ig_oauth_state');
  return res;
}
