// Server-side Plaid client — pulls real-time bank balances so the cash forecast
// starts from actual cash, not an estimate. Configured entirely via env; nothing
// secret ships to the browser. Products default to "transactions" (covers
// balances and future transaction-based forecasting) but can be overridden.
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';

export function isPlaidConfigured(): boolean {
  // Plaid keys AND a service-role key (to reach the token table) are both required.
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) && serviceConfigured();
}

let client: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (client) return client;
  const envName = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  const basePath = PlaidEnvironments[envName] ?? PlaidEnvironments.sandbox;
  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  client = new PlaidApi(config);
  return client;
}

const PRODUCT_MAP: Record<string, Products> = {
  auth: Products.Auth,
  transactions: Products.Transactions,
  identity: Products.Identity,
  assets: Products.Assets,
  liabilities: Products.Liabilities,
};

export function getPlaidProducts(): Products[] {
  const raw = (process.env.PLAID_PRODUCTS || 'transactions').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const products = raw.map((r) => PRODUCT_MAP[r]).filter(Boolean) as Products[];
  return products.length ? products : [Products.Transactions];
}

export function getPlaidCountryCodes(): CountryCode[] {
  const raw = (process.env.PLAID_COUNTRY_CODES || 'US').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const codes = raw.map((c) => CountryCode[c as keyof typeof CountryCode]).filter(Boolean);
  return codes.length ? codes : [CountryCode.Us];
}

export interface PlaidCash {
  connected: boolean;
  total: number;
  accounts: { name: string; mask: string | null; balance: number; institution: string | null }[];
}

// Live total across all connected depository (checking/savings/cash) accounts —
// used by both the balance route and the forecast anchor. Server-only.
export async function getPlaidCashTotal(): Promise<PlaidCash> {
  if (!isPlaidConfigured()) return { connected: false, total: 0, accounts: [] };
  const db = createServiceSupabase();
  const { data: items } = await db.from('plaid_items').select('item_id, access_token, institution_name');
  if (!items || items.length === 0) return { connected: false, total: 0, accounts: [] };
  const client = getPlaidClient();
  const accounts: PlaidCash['accounts'] = [];
  let total = 0;
  for (const item of items as { access_token: string; institution_name: string | null }[]) {
    try {
      const resp = await client.accountsBalanceGet({ access_token: item.access_token });
      for (const acct of resp.data.accounts) {
        if (acct.type !== 'depository') continue;
        const bal = acct.balances.current ?? acct.balances.available ?? 0;
        total += bal;
        accounts.push({ name: acct.name || acct.official_name || 'Account', mask: acct.mask ?? null, balance: bal, institution: item.institution_name ?? null });
      }
    } catch {
      /* skip a failing item */
    }
  }
  return { connected: true, total: Math.round(total * 100) / 100, accounts };
}
