// Server-side read of the financials the I AM CFO platform produces for Tulips.
//
// Tulips Talent is a client (organization) inside I AM CFO. I AM CFO does the
// books and computes the P&L / cash / AR / AP, and exposes them to us through a
// token-secured partner endpoint. We read it here, server-side only.
//
// All three env vars are server-only (no NEXT_PUBLIC_ prefix), so the base URL,
// the shared secret, and the org identifier never reach the browser. This module
// must only ever be imported from server components / server actions.

const API_URL = process.env.IAMCFO_API_URL; // e.g. https://app.iamcfo.com
const API_TOKEN = process.env.IAMCFO_API_TOKEN; // shared secret (PARTNER_API_TOKEN on the I AM CFO side)
const ORG_ID = process.env.IAMCFO_ORG_ID; // Tulips' organization id in I AM CFO
const ORG_SUBDOMAIN = process.env.IAMCFO_ORG_SUBDOMAIN ?? 'tulipstalent'; // ...or its subdomain

// Deep link to Tulips' own dashboard in I AM CFO. I AM CFO is org-routed by
// subdomain, so this is the live, full-detail books for the same org we read
// above. Available even when the inline read isn't configured.
export function iamcfoPortalUrl(): string {
  return process.env.IAMCFO_PORTAL_URL ?? `https://${ORG_SUBDOMAIN}.iamcfo.com`;
}

export interface Financials {
  orgId: string;
  subdomain: string | null;
  orgName: string;
  period: string; // "YYYY-MM"
  currency: string;
  profitAndLoss: {
    revenue: number;
    expenses: number;
    netIncome: number;
    netMargin: number;
  };
  cash: { balance: number; runwayMonths: number };
  receivables: { total: number; pastDue: number };
  payables: { total: number };
  generatedAt: string;
}

export type FinancialsResult =
  | { status: 'ok'; data: Financials }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export async function getFinancials(range?: {
  from: string | null;
  to: string | null;
}): Promise<FinancialsResult> {
  if (!API_URL || !API_TOKEN || (!ORG_ID && !ORG_SUBDOMAIN)) {
    return { status: 'not_configured' };
  }

  const params = new URLSearchParams();
  if (ORG_ID) params.set('orgId', ORG_ID);
  else if (ORG_SUBDOMAIN) params.set('subdomain', ORG_SUBDOMAIN);
  // Pass the selected time frame through; the partner endpoint scopes the P&L to
  // it when supported (otherwise it returns its default current-month figures).
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);

  const url = `${API_URL.replace(/\/$/, '')}/api/partner/financials?${params.toString()}`;

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

    const data = (await res.json()) as Financials;
    return { status: 'ok', data };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not reach the I AM CFO platform',
    };
  }
}
