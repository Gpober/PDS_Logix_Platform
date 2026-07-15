import { createServerSupabase } from '@/lib/supabase/server';

// QuickBooks Online integration (server-only). One company-wide OAuth connection
// stored in `quickbooks_connection`; access tokens are refreshed on demand. Never
// import this from a client component — it handles secrets and tokens.

const MINOR_VERSION = '73';
const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';

export type QboEnv = 'sandbox' | 'production';

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function env(): QboEnv {
  return process.env.QBO_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
}

function apiBase(): string {
  return env() === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

function basicAuth(): string {
  return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString(
    'base64',
  );
}

// The redirect URI must match one registered in the Intuit app. We derive it from
// the request origin, overridable with QBO_REDIRECT_URI.
export function redirectUri(origin: string): string {
  return process.env.QBO_REDIRECT_URI || `${origin}/api/quickbooks/callback`;
}

export function getAuthorizeUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (~3600)
  x_refresh_token_expires_in: number; // seconds (~8726400)
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`QuickBooks token request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

function expiryFrom(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// Exchange the OAuth code for tokens and persist the connection (called from the
// callback route, which also has the realmId from the query string).
export async function connect(code: string, origin: string, realmId: string, userId?: string) {
  const tok = await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(origin),
    }),
  );
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('quickbooks_connection').upsert({
    id: 1,
    realm_id: realmId,
    environment: env(),
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    access_token_expires_at: expiryFrom(tok.expires_in),
    refresh_token_expires_at: expiryFrom(tok.x_refresh_token_expires_in),
    connected_by: userId ?? null,
  });
  if (error) throw new Error(error.message);
}

interface Connection {
  realmId: string;
  accessToken: string;
}

// Read the connection, refreshing the access token if it's expired/near expiry.
async function getConnection(): Promise<Connection | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('quickbooks_connection').select('*').eq('id', 1).maybeSingle();
  if (!data) return null;

  const expMs = data.access_token_expires_at ? new Date(data.access_token_expires_at).getTime() : 0;
  // Refresh if it expires within two minutes.
  if (expMs - Date.now() > 120_000) {
    return { realmId: data.realm_id, accessToken: data.access_token };
  }

  const tok = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
  );
  await supabase
    .from('quickbooks_connection')
    .update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      access_token_expires_at: expiryFrom(tok.expires_in),
      refresh_token_expires_at: expiryFrom(tok.x_refresh_token_expires_in),
    })
    .eq('id', 1);
  return { realmId: data.realm_id, accessToken: tok.access_token };
}

export async function isConnected(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('quickbooks_connection').select('id').eq('id', 1).maybeSingle();
  return Boolean(data);
}

export async function disconnect(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from('quickbooks_connection').delete().eq('id', 1);
}

// Signed API call against the QBO company. `conn` carries a fresh access token.
async function qboFetch(conn: Connection, path: string, init?: RequestInit) {
  const url = `${apiBase()}/v3/company/${conn.realmId}/${path}${
    path.includes('?') ? '&' : '?'
  }minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`QuickBooks API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Find a customer by exact display name, else create one. Returns the QBO id.
export async function ensureCustomer(name: string): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');

  const safe = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`select Id from Customer where DisplayName = '${safe}'`);
  const found = await qboFetch(conn, `query?query=${query}`);
  const existing = found?.QueryResponse?.Customer?.[0]?.Id;
  if (existing) return String(existing);

  const created = await qboFetch(conn, 'customer', {
    method: 'POST',
    body: JSON.stringify({ DisplayName: name }),
  });
  return String(created.Customer.Id);
}

export interface InvoiceResult {
  invoiceId: string;
  balance: number | null;
  status: 'paid' | 'unpaid' | 'partial';
}

function statusFor(total: number, balance: number): InvoiceResult['status'] {
  if (balance <= 0) return 'paid';
  if (balance < total) return 'partial';
  return 'unpaid';
}

// Create an invoice for a customer with a single line item.
export async function createInvoice(
  customerId: string,
  amount: number,
  description: string,
): Promise<InvoiceResult> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');

  const created = await qboFetch(conn, 'invoice', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: customerId },
      Line: [
        {
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          Description: description,
          SalesItemLineDetail: {},
        },
      ],
    }),
  });
  const inv = created.Invoice;
  const total = Number(inv.TotalAmt ?? amount);
  const balance = Number(inv.Balance ?? total);
  return { invoiceId: String(inv.Id), balance, status: statusFor(total, balance) };
}

// Re-read an invoice to pull current balance / payment status.
export async function getInvoiceStatus(invoiceId: string): Promise<InvoiceResult> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const got = await qboFetch(conn, `invoice/${invoiceId}`);
  const inv = got.Invoice;
  const total = Number(inv.TotalAmt ?? 0);
  const balance = Number(inv.Balance ?? 0);
  return { invoiceId: String(inv.Id), balance, status: statusFor(total, balance) };
}
