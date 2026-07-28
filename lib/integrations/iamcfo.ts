// PDS Logix ↔ I AM CFO partner API (server-only).
//
// PDS's QuickBooks lives in the I AM CFO platform, under the "PDS Logix" org
// (a.k.a. Pride Dealer Services — QBO realm 123146415591129). We never talk to
// Intuit directly; every read/write goes through I AM CFO's partner API, org-
// routed by subdomain, exactly how Tulips runs its books. Bearer auth with a
// shared secret; the QBO tokens stay on the I AM CFO side.
//
// Config (all server-only):
//   IAMCFO_API_URL        e.g. https://app.iamcfo.com
//   IAMCFO_API_TOKEN      the shared secret (PARTNER_API_TOKEN on I AM CFO)
//   IAMCFO_ORG_SUBDOMAIN  which org's books — defaults to 'pdslogix'
//   IAMCFO_ORG_ID         optional explicit org id (wins over the subdomain)

const API_URL = process.env.IAMCFO_API_URL;
const API_TOKEN = process.env.IAMCFO_API_TOKEN;
const ORG_ID = process.env.IAMCFO_ORG_ID;
const ORG_SUBDOMAIN = process.env.IAMCFO_ORG_SUBDOMAIN ?? 'pdslogix';

export function iamcfoConfigured(): boolean {
  return Boolean(API_URL && API_TOKEN && (ORG_ID || ORG_SUBDOMAIN));
}

// The org identifier as a query string (GET) or a body object (POST).
function orgQuery(): string {
  return ORG_ID ? `orgId=${encodeURIComponent(ORG_ID)}` : `subdomain=${encodeURIComponent(ORG_SUBDOMAIN)}`;
}
function orgBody(): Record<string, string> {
  return ORG_ID ? { orgId: ORG_ID } : { subdomain: ORG_SUBDOMAIN };
}

export type Result<T> =
  | { status: 'ok'; data: T }
  | { status: 'not_configured' }
  | { status: 'error'; message: string; candidates?: string[] };

async function request<T>(method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>): Promise<Result<T>> {
  if (!iamcfoConfigured()) return { status: 'not_configured' };
  const base = API_URL!.replace(/\/$/, '');
  const url = method === 'GET' ? `${base}${path}${path.includes('?') ? '&' : '?'}${orgQuery()}` : `${base}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST' ? JSON.stringify({ ...orgBody(), ...(payload ?? {}) }) : undefined,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        status: 'error',
        message: typeof body.error === 'string' ? body.error : `Request failed (${res.status})`,
        candidates: Array.isArray(body.candidates) ? (body.candidates as string[]) : undefined,
      };
    }
    return { status: 'ok', data: body as T };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not reach the I AM CFO platform.' };
  }
}

// ---- Reads -----------------------------------------------------------------

export interface IamcfoInvoice {
  number: string;
  customer: string;
  totalAmount: number;
  balance: number;
  paid: boolean;
  txnDate: string;
  dueDate: string;
  terms?: string;
  description?: string;
  memo?: string;
}

export interface IamcfoBill {
  id: string;
  docNumber: string;
  vendorRef?: string;
  totalAmount: number;
  balance: number;
  paid?: boolean;
  txnDate?: string;
  dueDate?: string;
}

export async function getInvoices(opts: { number?: string; openOnly?: boolean; limit?: number }): Promise<
  Result<{ found?: boolean; invoice?: IamcfoInvoice; count?: number; invoices?: IamcfoInvoice[] }>
> {
  const p = new URLSearchParams();
  if (opts.number) p.set('number', opts.number);
  if (opts.openOnly) p.set('status', 'open');
  if (opts.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return request('GET', `/api/partner/invoice${qs ? `?${qs}` : ''}`);
}

export async function getBills(opts: { number?: string; openOnly?: boolean; limit?: number }): Promise<
  Result<{ found?: boolean; bill?: IamcfoBill; count?: number; bills?: IamcfoBill[] }>
> {
  const p = new URLSearchParams();
  if (opts.number) p.set('number', opts.number);
  if (opts.openOnly) p.set('status', 'open');
  if (opts.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return request('GET', `/api/partner/bill${qs ? `?${qs}` : ''}`);
}

export interface DuplicateInvoice {
  id: string;
  docNumber: string;
  customer: string;
  totalAmount: number;
  txnDate: string;
  paid: boolean;
}
export async function getDuplicateInvoices(): Promise<
  Result<{ groups: { docNumber: string; count: number; invoices: DuplicateInvoice[] }[]; summary: { duplicate_numbers: number; extra_invoices: number } }>
> {
  return request('GET', '/api/partner/duplicate-invoices');
}

// ---- Writes (only called from the confirmed action route) ------------------

export interface CreateInvoiceInput {
  customerName: string;
  amount: number;
  description?: string;
  docNumber?: string;
  dueDate?: string;
  txnDate?: string;
  memo?: string;
}
export interface CreatedInvoice {
  id: string;
  docNumber: string;
  customer: string;
  totalAmount: number;
  balance: number;
  dueDate: string;
  txnDate: string;
}
export async function createInvoice(input: CreateInvoiceInput): Promise<Result<{ invoice: CreatedInvoice }>> {
  return request('POST', '/api/partner/create-invoice', { ...input });
}

export interface CreateBillInput {
  vendorName: string;
  amount: number;
  description?: string;
  accountName?: string;
  docNumber?: string;
  dueDate?: string;
  txnDate?: string;
  memo?: string;
}
export interface CreatedBill {
  id: string;
  docNumber: string;
  vendor: string;
  totalAmount: number;
  balance: number;
}
export async function createBill(input: CreateBillInput): Promise<Result<{ bill: CreatedBill }>> {
  return request('POST', '/api/partner/create-bill', { ...input });
}

export interface UpdateInvoiceInput {
  invoiceNumber: string;
  txnDate?: string;
  dueDate?: string;
  customerName?: string;
}
export interface UpdatedInvoiceResponse {
  ok: boolean;
  skipped?: string;
  message?: string;
  invoice?: { id: string; docNumber: string; customer: string; txnDate: string; dueDate: string; totalAmount: number };
}
export async function updateInvoice(input: UpdateInvoiceInput): Promise<Result<UpdatedInvoiceResponse>> {
  return request('POST', '/api/partner/update-invoice', { ...input });
}

export interface DeleteInvoicesResponse {
  ok: boolean;
  deleted_count: number;
  deleted: string[];
  skipped_paid: string[];
  not_found: string[];
  errors: string[];
}
export async function deleteInvoices(ids: string[]): Promise<Result<DeleteInvoicesResponse>> {
  return request('POST', '/api/partner/delete-invoices', { ids });
}

// A lightweight connection probe for Settings/job pages: is the partner API
// reachable and the org's QBO actually connected? (A 1-invoice read.)
export async function iamcfoConnected(): Promise<boolean> {
  const res = await getInvoices({ limit: 1 });
  return res.status === 'ok';
}

// ---- Books: financials, cash calendar, refresh ----------------------------
// The books I AM CFO keeps for PDS (Pride Dealer Services), read live through
// the one canonical QBO connection. These feed Zordon's financial reports.

export interface Financials {
  orgName: string;
  period: string; // "YYYY-MM"
  currency: string;
  profitAndLoss: { revenue: number; expenses: number; netIncome: number; netMargin: number };
  cash: { balance: number; runwayMonths: number };
  receivables: { total: number; pastDue: number };
  payables: { total: number };
  generatedAt: string;
}

// P&L (revenue / expenses / net income / margin), cash + runway, A/R (incl.
// past due) and A/P — scoped to from/to when given, else the current month.
export async function getFinancials(range?: { from?: string; to?: string }): Promise<Result<Financials>> {
  const p = new URLSearchParams();
  if (range?.from) p.set('from', range.from);
  if (range?.to) p.set('to', range.to);
  const qs = p.toString();
  return request('GET', `/api/partner/financials${qs ? `?${qs}` : ''}`);
}

export interface CashEvent {
  date: string;
  type: 'inflow' | 'outflow';
  name: string;
  amount: number;
  source: 'ar' | 'ap';
  status: 'due' | 'paid';
  reference?: string | null;
  dueDate?: string | null;
}
export interface CashCalendar {
  orgName: string | null;
  from: string;
  to: string;
  currency: string;
  events: CashEvent[];
}

// Dated money-in (received), money-due (open A/R with real due dates) and
// money-out (A/P), for a period. Defaults to the current month.
export async function getCashCalendar(range?: { from?: string; to?: string }): Promise<Result<CashCalendar>> {
  const p = new URLSearchParams();
  if (range?.from) p.set('from', range.from);
  if (range?.to) p.set('to', range.to);
  const qs = p.toString();
  return request('GET', `/api/partner/cash-calendar${qs ? `?${qs}` : ''}`);
}

// Ask I AM CFO to re-pull QuickBooks (journal lines + A/R + A/P) into the mirror
// the books read from — so a report reflects the latest QBO data.
export async function refreshBooks(): Promise<Result<{ ok?: boolean; syncedLines?: number }>> {
  return request('POST', '/api/partner/refresh-qbo');
}
