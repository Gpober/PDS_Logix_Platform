import { createServerSupabase } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase';

// Scopes requested at Google sign-in. Beyond the basic identity scopes we ask
// for Calendar (auto-sync bookings) and Gmail send. Both are "sensitive" (not
// "restricted"), so the app needs only brand verification — deliberately no
// gmail.readonly, which would trigger a CASA security assessment.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_SKEW_MS = 60_000;

type TokenRow = {
  refresh_token: string | null;
  access_token: string | null;
  expiry: string | null;
  scopes: string | null;
};

function googleClientConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Persist the tokens Google hands back at the OAuth callback. The refresh token
// only arrives when we requested offline access + forced consent, and only the
// FIRST time — so never overwrite a stored refresh token with null.
export async function saveGoogleTokensForCurrentUser(params: {
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresInSeconds?: number | null;
  scopes?: string | null;
}): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const expiry =
    params.expiresInSeconds != null
      ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
      : null;

  const row: Record<string, unknown> = {
    user_id: user.id,
    access_token: params.accessToken ?? null,
    expiry,
    scopes: params.scopes ?? GOOGLE_SCOPES,
  };
  // Only set refresh_token when we actually received one.
  if (params.refreshToken) row.refresh_token = params.refreshToken;

  await supabase.from('user_google_tokens').upsert(row, { onConflict: 'user_id' });
}

// Return a valid Google access token for the current user, refreshing via the
// stored refresh token when the cached one is stale. Returns null when the user
// hasn't connected Google (e.g. signed in with a password) or the client isn't
// configured — callers treat null as "Google not available" and no-op.
export async function getGoogleAccessToken(): Promise<string | null> {
  if (!googleClientConfigured()) return null;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_google_tokens')
    .select('refresh_token, access_token, expiry, scopes')
    .eq('user_id', user.id)
    .maybeSingle();
  const row = data as TokenRow | null;
  if (!row) return null;

  const fresh =
    row.access_token &&
    row.expiry &&
    new Date(row.expiry).getTime() - EXPIRY_SKEW_MS > Date.now();
  if (fresh) return row.access_token;

  if (!row.refresh_token) return null;

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed) return null;

  await supabase
    .from('user_google_tokens')
    .update({
      access_token: refreshed.accessToken,
      expiry: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    })
    .eq('user_id', user.id);

  return refreshed.accessToken;
}

// Returns a fresh Gmail access token for an owner/admin, looked up WITHOUT a
// user session via the service-role key. Used to send email on behalf of the
// team from anonymous contexts (e.g. a website lead). Returns null if the
// service key isn't set, no owner has connected Google, or the refresh fails.
export async function getOwnerGoogleAccessToken(): Promise<{
  token: string;
  ownerEmail: string | null;
} | null> {
  if (!googleClientConfigured()) return null;
  const admin = createServiceClient();
  if (!admin) return null;

  const { data: owners } = await admin
    .from('profiles')
    .select('id, email, role')
    .in('role', ['owner', 'admin']);
  if (!owners || owners.length === 0) return null;

  const ids = owners.map((o) => (o as { id: string }).id);
  const { data: tokenRow } = await admin
    .from('user_google_tokens')
    .select('user_id, refresh_token, access_token, expiry')
    .in('user_id', ids)
    .not('refresh_token', 'is', null)
    .limit(1)
    .maybeSingle();
  const row = tokenRow as
    | { user_id: string; refresh_token: string | null; access_token: string | null; expiry: string | null }
    | null;
  if (!row) return null;

  const owner = owners.find((o) => (o as { id: string }).id === row.user_id) as
    | { email: string | null }
    | undefined;
  const ownerEmail = owner?.email ?? null;

  const fresh =
    row.access_token && row.expiry && new Date(row.expiry).getTime() - EXPIRY_SKEW_MS > Date.now();
  if (fresh) return { token: row.access_token!, ownerEmail };

  if (!row.refresh_token) return null;
  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed) return null;

  await admin
    .from('user_google_tokens')
    .update({
      access_token: refreshed.accessToken,
      expiry: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    })
    .eq('user_id', row.user_id);

  return { token: refreshed.accessToken, ownerEmail };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

// True when the current user has a stored Google connection we can act through.
export async function isGoogleConnected(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();
  return Boolean((data as { refresh_token: string | null } | null)?.refresh_token);
}
