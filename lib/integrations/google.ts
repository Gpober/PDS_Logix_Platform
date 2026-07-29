// Google OAuth + Sheets access for the cash-forecast sync. Tokens live in the
// service-role-only google_connections table (refresh_token is secret). Single-
// tenant. Configured via GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (+ optional
// GOOGLE_REDIRECT_URI); the redirect URI must be registered in Google Cloud.
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
];

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) && serviceConfigured();
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/oauth/callback`;
}

function baseClient(origin?: string): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    origin ? redirectUri(origin) : undefined,
  );
}

export function authUrl(origin: string): string {
  return baseClient(origin).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES });
}

export async function exchangeAndStore(origin: string, code: string): Promise<void> {
  const client = baseClient(origin);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    email = (await oauth2.userinfo.get()).data.email ?? null;
  } catch {
    /* email is best-effort */
  }

  const payload: Record<string, unknown> = {
    id: 'singleton',
    access_token: tokens.access_token ?? null,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    google_email: email,
    scope: tokens.scope ?? GOOGLE_SCOPES.join(' '),
    updated_at: new Date().toISOString(),
  };
  // Google only returns a refresh_token on first consent — keep the old one if absent.
  if (tokens.refresh_token) payload.refresh_token = tokens.refresh_token;

  await createServiceSupabase().from('google_connections').upsert(payload, { onConflict: 'id' });
}

// An OAuth client seeded with the stored refresh token; auto-refreshes access
// tokens and persists them. Returns null if Google isn't connected.
export async function getAuthedClient(): Promise<OAuth2Client | null> {
  const db = createServiceSupabase();
  const { data } = await db.from('google_connections').select('refresh_token').eq('id', 'singleton').maybeSingle();
  const refresh = (data as { refresh_token: string | null } | null)?.refresh_token;
  if (!refresh) return null;
  const client = baseClient();
  client.setCredentials({ refresh_token: refresh });
  client.on('tokens', (t) => {
    void db.from('google_connections').update({
      access_token: t.access_token ?? null,
      token_expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', 'singleton');
  });
  return client;
}

export async function googleStatus(): Promise<{ configured: boolean; connected: boolean; email: string | null }> {
  if (!isGoogleConfigured()) return { configured: false, connected: false, email: null };
  const { data } = await createServiceSupabase().from('google_connections').select('google_email, refresh_token').eq('id', 'singleton').maybeSingle();
  const row = data as { google_email: string | null; refresh_token: string | null } | null;
  return { configured: true, connected: Boolean(row?.refresh_token), email: row?.google_email ?? null };
}

export async function disconnectGoogle(): Promise<void> {
  await createServiceSupabase().from('google_connections').delete().eq('id', 'singleton');
}
