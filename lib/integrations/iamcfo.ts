// Server-to-server client for I AM CFO's billing engine. I AM CFO owns the
// QuickBooks connection and the invoice/bill creation; Tulips calls it to bill a
// deal. Never import from client components.
//
// Env:
//   IAMCFO_BILLING_URL      — full URL of I AM CFO's /api/talent-agencies/create-billing
//   IAMCFO_BILLING_API_KEY  — shared secret, sent as x-api-key (matches
//                             TULIPS_BILLING_API_KEY on the I AM CFO side)

export function iamcfoBillingConfigured(): boolean {
  return Boolean(process.env.IAMCFO_BILLING_URL && process.env.IAMCFO_BILLING_API_KEY);
}

export interface BillingResult {
  status: string; // created | duplicate | pending_config | wrong_company | error
  invoiceId?: string;
  invoiceNumber?: string;
  billId?: string;
  billNumber?: string;
  talentPayable?: number;
  payoutPct?: number;
  message?: string;
}

export interface BillingRequest {
  dealId: string;
  customer: string; // brand name
  amount: number; // invoice total to the brand
  talent?: string; // talent name (skips the payout bill when absent)
  talentComp?: { type: 'percent' | 'fixed'; value: number } | string;
  description?: string;
  salesTerm?: string;
  invoiceDate?: string; // YYYY-MM-DD — invoice and bill share this date
  qboClass?: string;
  skipBill?: boolean; // invoice-only: don't create the talent payout bill
  customerId?: string; // explicit QBO Customer.Id (from dropdown)
  vendorId?: string; // explicit QBO Vendor.Id (from dropdown)
}

export interface QboRef {
  id: string;
  name: string;
}
export interface QboClassOption extends QboRef {
  fullyQualifiedName: string;
}
export interface QboRefs {
  customers: QboRef[];
  vendors: QboRef[];
  classes: QboClassOption[];
  // Diagnostics so the UI can explain an empty result instead of hiding it.
  ok: boolean; // true when the /qbo-refs call returned 200
  status: number; // HTTP status (0 = network error, -1 = not configured)
}

// Fetch the Tulips org's QBO customers, vendors, and classes from I AM CFO in
// one call, to populate the Billing card's synced dropdowns.
export async function fetchIamcfoRefs(): Promise<QboRefs> {
  const empty = { customers: [], vendors: [], classes: [] };
  const url = process.env.IAMCFO_BILLING_URL;
  const key = process.env.IAMCFO_BILLING_API_KEY;
  if (!url || !key) return { ...empty, ok: false, status: -1 };
  const refsUrl = url.replace(/\/create-billing\/?$/, '/qbo-refs');
  try {
    const res = await fetch(refsUrl, { headers: { 'x-api-key': key }, cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as Partial<QboRefs> | null;
    return {
      customers: data?.customers ?? [],
      vendors: data?.vendors ?? [],
      classes: data?.classes ?? [],
      ok: res.ok,
      status: res.status,
    };
  } catch {
    return { ...empty, ok: false, status: 0 };
  }
}

// Calls I AM CFO to create the brand invoice + talent bill in QuickBooks.
// Returns null when the integration isn't configured or the call fails hard.
export async function createIamcfoBilling(req: BillingRequest): Promise<BillingResult | null> {
  const url = process.env.IAMCFO_BILLING_URL;
  const key = process.env.IAMCFO_BILLING_API_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(req),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as BillingResult | null;
    if (!data) return { status: 'error', message: `I AM CFO returned ${res.status}` };
    return data;
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'request failed' };
  }
}
