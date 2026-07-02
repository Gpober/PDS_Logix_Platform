import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the Supabase session cookie on every request and guards /crm.
export async function middleware(request: NextRequest) {
  // OAuth safety net: if a ?code= lands on some page other than the callback,
  // forward it so it's actually exchanged for a session.
  const incoming = request.nextUrl;
  const oauthCode = incoming.searchParams.get('code');
  if (oauthCode && incoming.pathname !== '/auth/callback') {
    const url = incoming.clone();
    const next = incoming.searchParams.get('next');
    url.pathname = '/auth/callback';
    url.search = '';
    url.searchParams.set('code', oauthCode);
    if (next) url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Gate the CRM. Public marketing pages stay open.
  if (!user && pathname.startsWith('/crm')) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
