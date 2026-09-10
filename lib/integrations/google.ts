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
  // Sending the daily production report. Adding a scope does not retroactively
  // grant it: Google must be reconnected once (Settings -> Google -> Connect)
  // before the report can send. sendMail says so plainly rather than failing
  // with a bare 403.
  'https://www.googleapis.com/auth/gmail.send',
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

// ---- Gmail -----------------------------------------------------------------

/** RFC 2047 for a Subject that may carry non-ASCII (a worker's name, an em dash). */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export interface SendMailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an HTML email as the connected Google account.
 *
 * There is no `from` control: Gmail sends as the authorised user. A real
 * reports@ address would need a send-as alias configured on that account.
 */
export async function sendMail(opts: {
  to: string[];
  subject: string;
  html: string;
  cc?: string[];
}): Promise<SendMailResult> {
  if (!isGoogleConfigured()) return { ok: false, error: 'Google is not configured (GOOGLE_CLIENT_ID / SECRET).' };
  const auth = await getAuthedClient();
  if (!auth) return { ok: false, error: 'Google is not connected — no stored refresh token.' };
  if (!opts.to.length) return { ok: false, error: 'No recipients.' };

  const headers = [
    `To: ${opts.to.join(', ')}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].join('\r\n');

  // Body base64 too, so a long HTML line cannot trip the 998-character line limit.
  const body = Buffer.from(opts.html, 'utf8').toString('base64');
  const raw = Buffer.from(`${headers}\r\n\r\n${body}`, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { ok: true, id: res.data.id ?? undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed';
    // The likely cause the first time: the stored grant predates gmail.send.
    const hint = /insufficient|scope|403/i.test(message)
      ? ' — reconnect Google so the grant includes gmail.send.'
      : '';
    return { ok: false, error: message + hint };
  }
}
