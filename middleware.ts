import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Supabase connection, inlined here (NOT imported from lib/supabase/config) so the
// Edge middleware bundle stays self-contained — importing a module shared with the
// server-only clients drags Node-only code into the Edge Runtime and blocks deploy.
// The URL + anon key are public by design (RLS governs access); env overrides them.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xqyxpefsukilkqevspfv.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxeXhwZWZzdWtpbGtxZXZzcGZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDg4ODQsImV4cCI6MjA5ODUyNDg4NH0.WDxOEbDew6AsMehppbKjBhlEkWZsKdG1mYgKrAETyuQ';

// Refreshes the Supabase session cookie on every request and guards /crm.
export async function middleware(request: NextRequest) {
  // OAuth safety net: if Supabase falls back to the Site URL and drops the user
  // on some page carrying a ?code=, forward it to /auth/callback so the code is
  // actually exchanged for a session instead of sitting unused in the URL.
  const incoming = request.nextUrl;
  const oauthCode = incoming.searchParams.get('code');
  // Skip API routes — they handle their own OAuth codes (e.g. the YouTube
  // "Connect" callback at /api/youtube/callback). Only the Supabase login code
  // needs forwarding to /auth/callback.
  if (oauthCode && incoming.pathname !== '/auth/callback' && !incoming.pathname.startsWith('/api/')) {
    const url = incoming.clone();
    const next = incoming.searchParams.get('next');
    url.pathname = '/auth/callback';
    url.search = '';
    url.searchParams.set('code', oauthCode);
    if (next) url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  // Canonical host: force everything onto the one domain (e.g. tulipstalent.co)
  // so the vercel.app URL and any other alias redirect to it — auth cookies then
  // only ever live on one host. Opt-in via CANONICAL_HOST so this stays inert
  // until the domain is actually attached in Vercel. Never redirect an in-flight
  // OAuth exchange (would move it cross-host and lose the PKCE verifier cookie).
  const canonicalHost = process.env.CANONICAL_HOST;
  const requestHost = request.headers.get('host');
  if (
    canonicalHost &&
    requestHost &&
    requestHost !== canonicalHost &&
    incoming.pathname !== '/auth/callback' &&
    !oauthCode
  ) {
    const url = incoming.clone();
    url.protocol = 'https:';
    url.host = canonicalHost;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  // Fail open if Supabase somehow isn't configured (SUPABASE_URL/ANON_KEY carry a
  // committed default for the PDS Logix CRM project, so this normally holds).
  // Guarding keeps a missing/blank override from 500-ing the whole site via the
  // middleware (MIDDLEWARE_INVOCATION_FAILED).
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Never let a Supabase hiccup (network blip, malformed env override, expired
  // token refresh) throw out of middleware — that surfaces as a site-wide
  // MIDDLEWARE_INVOCATION_FAILED 500. On any error, treat the caller as signed
  // out: the /crm + /portal guards below still apply, so we fail safe, not open.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  // Gate the CRM + creator portal. Public marketing pages stay open.
  if (!user && (pathname.startsWith('/crm') || pathname.startsWith('/portal'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/crm';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)'],
};
