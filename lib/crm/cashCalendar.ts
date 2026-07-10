// Server-side read of the dated cash events I AM CFO produces for Tulips.
//
// Tulips is a client (organization) inside I AM CFO, which does the books and
// syncs QuickBooks. Its partner endpoint exposes the org's real AR/AP cash
// events — money in (paid), money due (open receivables), money out (payables
// to talent) — with true due/payment dates. We read it here, server-side only,
// and render our own cash calendar over it. Same token + org envs as
// lib/crm/financials.ts.

const API_URL = process.env.IAMCFO_API_URL;
const API_TOKEN = process.env.IAMCFO_API_TOKEN;
const ORG_ID = process.env.IAMCFO_ORG_ID;
const ORG_SUBDOMAIN = process.env.IAMCFO_ORG_SUBDOMAIN ?? 'tulipstalent';

export interface CashDocumentLine {
  description: string | null;
  item: string | null;
  account: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  class: string | null;
}

export interface CashLinkedDocument {
  docNumber: string;
  amount: number;
  documentAmount: number | null;
  customerMemo?: string | null;
  privateNote?: string | null;
  terms?: string | null;
  dueDate?: string | null;
  lines?: CashDocumentLine[];
}

export interface CashEvent {
  date: string; // YYYY-MM-DD
  type: 'inflow' | 'outflow';
  name: string;
  amount: number;
  source: 'ar' | 'ap';
  status: 'due' | 'paid';
  reference?: string | null;
  originalAmount?: number | null;
  dueDate?: string | null;
  linkedDocuments?: CashLinkedDocument[];
}

export interface CashCalendar {
  orgName: string | null;
  from: string;
  to: string;
  currency: string;
  events: CashEvent[];
}

export type CashCalendarResult =
  | { status: 'ok'; data: CashCalendar }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export function cashCalendarConfigured(): boolean {
  return Boolean(API_URL && API_TOKEN && (ORG_ID || ORG_SUBDOMAIN));
}

export async function getCashCalendar(range?: {
  from?: string | null;
  to?: string | null;
}): Promise<CashCalendarResult> {
  if (!cashCalendarConfigured()) return { status: 'not_configured' };

  const params = new URLSearchParams();
  if (ORG_ID) params.set('orgId', ORG_ID);
  else if (ORG_SUBDOMAIN) params.set('subdomain', ORG_SUBDOMAIN);
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);

  const url = `${API_URL!.replace(/\/$/, '')}/api/partner/cash-calendar?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        status: 'error',
        message: body?.error ? `${res.status}: ${body.error}` : `Request failed (${res.status})`,
      };
    }

    const json = (await res.json()) as {
      orgName?: string | null;
      from: string;
      to: string;
      currency?: string;
      events?: CashEvent[];
    };
    return {
      status: 'ok',
      data: {
        orgName: json.orgName ?? null,
        from: json.from,
        to: json.to,
        currency: json.currency ?? 'USD',
        events: Array.isArray(json.events) ? json.events : [],
      },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Request failed' };
  }
}
