import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware — intentionally DEPENDENCY-FREE. It imports only `next/server`,
// so nothing Node-only (e.g. a transitive `__dirname` reference) can ever leak
// into the Edge bundle and take the whole site down with
// MIDDLEWARE_INVOCATION_FAILED. Real auth is validated server-side: the /crm
// layout calls getCurrentProfile() and redirects to /login when there's no
// session. Here we only do cheap, Edge-safe routing.

// Presence check only — is there a Supabase auth cookie at all? The cookie name
// is `sb-<project-ref>-auth-token` (sometimes chunked .0/.1), so match by shape
// to stay correct even if the Supabase URL/ref changes. This is NOT validation
// (a forged/expired cookie still can't read data — the server layout re-checks);
// it just avoids flashing the CRM before the server redirect.
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

export function middleware(request: NextRequest) {
  const incoming = request.nextUrl;

  // OAuth safety net: if Supabase drops the user on some page carrying a ?code=,
  // forward it to /auth/callback so the code is exchanged for a session. Skip
  // API routes — they handle their own OAuth codes.
  const oauthCode = incoming.searchParams.get('code');
  if (oauthCode && incoming.pathname !== '/auth/callback' && !incoming.pathname.startsWith('/api/')) {
    const url = incoming.clone();
    const next = incoming.searchParams.get('next');
    url.pathname = '/auth/callback';
    url.search = '';
    url.searchParams.set('code', oauthCode);
    if (next) url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  // Canonical host: force everything onto one domain so auth cookies only ever
  // live on one host. Opt-in via CANONICAL_HOST. Never redirect an in-flight
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

  // Fast gate for the CRM. The authoritative check is server-side in the layout;
  // this just sends an obviously-signed-out visitor straight to /login.
  if (incoming.pathname.startsWith('/crm') && !hasSupabaseSession(request)) {
    const url = incoming.clone();
    url.pathname = '/login';
    url.searchParams.set('next', incoming.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)'],
};
