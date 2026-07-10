import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { saveGoogleTokensForCurrentUser } from '@/lib/google/tokens';

// OAuth (e.g. Google) redirect target. Supabase sends the user here with a
// `code` after they authenticate with the provider; we exchange it for a
// session cookie and forward them on to wherever they were headed.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Only allow relative, same-origin redirects to avoid open-redirect abuse.
  const nextParam = searchParams.get('next');
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/crm';

  if (error) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', errorDescription || error);
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      // Capture the Google provider tokens (present only on the OAuth exchange)
      // so we can act on the user's behalf later — Calendar sync, Gmail.
      const session = data.session;
      if (session?.provider_refresh_token || session?.provider_token) {
        await saveGoogleTokensForCurrentUser({
          refreshToken: session.provider_refresh_token,
          accessToken: session.provider_token,
          expiresInSeconds: 3300,
        });
      }
      return NextResponse.redirect(new URL(next, origin));
    }
    const url = new URL('/login', origin);
    url.searchParams.set('error', exchangeError.message);
    return NextResponse.redirect(url);
  }

  // No code and no error — bounce back to login.
  return NextResponse.redirect(new URL('/login', origin));
}
