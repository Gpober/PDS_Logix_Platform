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

// ===========================================================================
// Extended read/write surface — powers Zordon's QuickBooks tool suite. These
// all use the same signed qboFetch against the one company connection. Amounts
// are USD; dates are YYYY-MM-DD. QBO's SQL-ish query API is quirky, so we fetch
// and sort/filter in JS rather than lean on ORDER BY / WHERE on computed cols.
// ===========================================================================

function escQuery(s: string): string {
  return s.replace(/'/g, "\\'");
}
const clampMax = (n: number, def: number, max: number) =>
  Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;

// ---- Invoices --------------------------------------------------------------

export interface QboInvoice {
  id: string;
  number: string | null;
  customer: string | null;
  customerId: string | null;
  txnDate: string | null;
  dueDate: string | null;
  amount: number;
  balance: number;
  paid: boolean;
  syncToken: string;
}

function mapInvoice(inv: Record<string, any>): QboInvoice {
  const total = Number(inv.TotalAmt ?? 0);
  const balance = Number(inv.Balance ?? 0);
  return {
    id: String(inv.Id),
    number: inv.DocNumber ? String(inv.DocNumber) : null,
    customer: inv.CustomerRef?.name ?? null,
    customerId: inv.CustomerRef?.value ? String(inv.CustomerRef.value) : null,
    txnDate: inv.TxnDate ?? null,
    dueDate: inv.DueDate ?? null,
    amount: total,
    balance,
    paid: balance <= 0,
    syncToken: String(inv.SyncToken ?? '0'),
  };
}

// List invoices (newest first), one by number, or only the unpaid ones.
export async function listInvoices(opts: {
  number?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<QboInvoice[]> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const max = clampMax(Number(opts.limit), 50, 200);
  const where = opts.number ? ` where DocNumber = '${escQuery(opts.number)}'` : '';
  const q = encodeURIComponent(`select * from Invoice${where} startposition 1 maxresults ${opts.number ? 50 : max}`);
  const res = await qboFetch(conn, `query?query=${q}`);
  let rows: QboInvoice[] = (res?.QueryResponse?.Invoice ?? []).map(mapInvoice);
  if (opts.openOnly && !opts.number) rows = rows.filter((i) => !i.paid);
  rows.sort((a, b) => (a.txnDate ?? '') < (b.txnDate ?? '') ? 1 : -1);
  return rows.slice(0, max);
}

// Find a customer id by exact display name (no create). Returns null if absent.
export async function findCustomerId(name: string): Promise<string | null> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const q = encodeURIComponent(`select Id from Customer where DisplayName = '${escQuery(name)}'`);
  const res = await qboFetch(conn, `query?query=${q}`);
  const id = res?.QueryResponse?.Customer?.[0]?.Id;
  return id ? String(id) : null;
}

// Sparse-update an invoice's date and/or customer (never the amount). Skips an
// invoice that already has a payment applied. Returns the updated shape, or a
// reason it was left alone.
export async function updateInvoiceFields(
  number: string,
  fields: { txnDate?: string; dueDate?: string; customerName?: string },
): Promise<{ ok: true; invoice: QboInvoice } | { ok: false; reason: string; candidates?: string[] }> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const found = await listInvoices({ number });
  const current = found[0];
  if (!current) return { ok: false, reason: `No invoice #${number} found.` };
  if (current.balance < current.amount) return { ok: false, reason: `Invoice #${number} has a payment applied — left unchanged.` };

  const patch: Record<string, unknown> = { Id: current.id, SyncToken: current.syncToken, sparse: true };
  if (fields.txnDate) patch.TxnDate = fields.txnDate;
  if (fields.dueDate) patch.DueDate = fields.dueDate;
  if (fields.customerName) {
    const cid = await findCustomerId(fields.customerName);
    if (!cid) return { ok: false, reason: `No QuickBooks customer named "${fields.customerName}".` };
    patch.CustomerRef = { value: cid };
  }
  const res = await qboFetch(conn, 'invoice', { method: 'POST', body: JSON.stringify(patch) });
  return { ok: true, invoice: mapInvoice(res.Invoice) };
}

// Delete an invoice by id, but never a paid/partially-paid one. Re-reads first
// to get a fresh SyncToken and guard on balance.
export async function deleteInvoiceById(
  id: string,
): Promise<'deleted' | 'skipped_paid' | 'not_found'> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  let inv: QboInvoice;
  try {
    const got = await qboFetch(conn, `invoice/${id}`);
    inv = mapInvoice(got.Invoice);
  } catch {
    return 'not_found';
  }
  if (inv.balance < inv.amount) return 'skipped_paid';
  await qboFetch(conn, 'invoice?operation=delete', {
    method: 'POST',
    body: JSON.stringify({ Id: inv.id, SyncToken: inv.syncToken }),
  });
  return 'deleted';
}

// Group invoices by DocNumber and return only the numbers used more than once.
export async function findDuplicateInvoices(): Promise<
  { number: string; count: number; invoices: QboInvoice[] }[]
> {
  const all = await listInvoices({ limit: 200 });
  const byNum = new Map<string, QboInvoice[]>();
  for (const inv of all) {
    if (!inv.number) continue;
    const arr = byNum.get(inv.number) ?? [];
    arr.push(inv);
    byNum.set(inv.number, arr);
  }
  return [...byNum.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([number, invoices]) => ({ number, count: invoices.length, invoices }));
}

// ---- Vendors & bills -------------------------------------------------------

export interface QboBill {
  id: string;
  number: string | null;
  vendor: string | null;
  vendorId: string | null;
  txnDate: string | null;
  dueDate: string | null;
  amount: number;
  balance: number;
  paid: boolean;
  syncToken: string;
}

function mapBill(b: Record<string, any>): QboBill {
  const total = Number(b.TotalAmt ?? 0);
  const balance = Number(b.Balance ?? 0);
  return {
    id: String(b.Id),
    number: b.DocNumber ? String(b.DocNumber) : null,
    vendor: b.VendorRef?.name ?? null,
    vendorId: b.VendorRef?.value ? String(b.VendorRef.value) : null,
    txnDate: b.TxnDate ?? null,
    dueDate: b.DueDate ?? null,
    amount: total,
    balance,
    paid: balance <= 0,
    syncToken: String(b.SyncToken ?? '0'),
  };
}

export async function listBills(opts: { number?: string; openOnly?: boolean; limit?: number }): Promise<QboBill[]> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const max = clampMax(Number(opts.limit), 50, 200);
  const where = opts.number ? ` where DocNumber = '${escQuery(opts.number)}'` : '';
  const q = encodeURIComponent(`select * from Bill${where} startposition 1 maxresults ${opts.number ? 50 : max}`);
  const res = await qboFetch(conn, `query?query=${q}`);
  let rows: QboBill[] = (res?.QueryResponse?.Bill ?? []).map(mapBill);
  if (opts.openOnly && !opts.number) rows = rows.filter((b) => !b.paid);
  rows.sort((a, b) => (a.txnDate ?? '') < (b.txnDate ?? '') ? 1 : -1);
  return rows.slice(0, max);
}

// Find a vendor by exact display name, else create one. Returns the QBO id.
export async function ensureVendor(name: string): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const q = encodeURIComponent(`select Id from Vendor where DisplayName = '${escQuery(name)}'`);
  const found = await qboFetch(conn, `query?query=${q}`);
  const existing = found?.QueryResponse?.Vendor?.[0]?.Id;
  if (existing) return String(existing);
  const created = await qboFetch(conn, 'vendor', {
    method: 'POST',
    body: JSON.stringify({ DisplayName: name }),
  });
  return String(created.Vendor.Id);
}

// Pick an expense account: match by name if given, else the first Expense-type
// account on the books. Returns the QBO account id.
async function findExpenseAccountId(name?: string): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const q = encodeURIComponent(`select Id, Name, AccountType from Account where AccountType = 'Expense' startposition 1 maxresults 200`);
  const res = await qboFetch(conn, `query?query=${q}`);
  const accounts: { Id: string; Name: string }[] = res?.QueryResponse?.Account ?? [];
  if (!accounts.length) throw new Error('No expense account found in QuickBooks to post the bill to.');
  if (name) {
    const want = name.trim().toLowerCase();
    const hit = accounts.find((a) => a.Name?.toLowerCase() === want) ?? accounts.find((a) => a.Name?.toLowerCase().includes(want));
    if (hit) return String(hit.Id);
  }
  return String(accounts[0].Id);
}

// Create a vendor bill (money we owe — a supplier/subcontractor expense) with a
// single account-based expense line.
export async function createBill(opts: {
  vendorId: string;
  amount: number;
  description?: string;
  accountName?: string;
  docNumber?: string;
  txnDate?: string;
  dueDate?: string;
}): Promise<QboBill> {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected.');
  const accountId = await findExpenseAccountId(opts.accountName);
  const payload: Record<string, unknown> = {
    VendorRef: { value: opts.vendorId },
    Line: [
      {
        Amount: opts.amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: opts.description ?? undefined,
        AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
      },
    ],
  };
  if (opts.docNumber) payload.DocNumber = opts.docNumber;
  if (opts.txnDate) payload.TxnDate = opts.txnDate;
  if (opts.dueDate) payload.DueDate = opts.dueDate;
  const created = await qboFetch(conn, 'bill', { method: 'POST', body: JSON.stringify(payload) });
  return mapBill(created.Bill);
}
