import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveInstagramGraph, instagramGraphRedirectUri } from '@/lib/integrations/instagramGraph';

// GET /api/instagram-fb/callback — Facebook redirects here after the creator
// authorizes. We capture the Page + linked IG business account and store it.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/portal?igfb=${q}`, req.url));

  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const cookieNonce = req.cookies.get('igfb_oauth_state')?.value;
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

  const link = await resolveInstagramGraph(code, instagramGraphRedirectUri(req.url));
  if (!link) return back('no_ig'); // no Page-linked IG Business account found

  const { error } = await supabase.from('instagram_graph_connections').upsert(
    {
      talent_id: talentId,
      ig_business_id: link.igBusinessId,
      ig_username: link.igUsername,
      page_id: link.pageId,
      page_token: link.pageToken,
      user_token: link.userToken,
      token_expiry: new Date(Date.now() + link.expiresIn * 1000).toISOString(),
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'talent_id' },
  );
  if (error) {
    console.error('instagram-fb callback save', error.message);
    return back('save_failed');
  }

  const res = back('connected');
  res.cookies.delete('igfb_oauth_state');
  return res;
}
