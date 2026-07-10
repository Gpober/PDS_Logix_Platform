import { notFound } from 'next/navigation';
import { companyOptions, getCurrentProfile, getDeal, talentOptions } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { deleteDeal, saveDeal, createDealBilling } from '@/lib/crm/actions';
import { iamcfoBillingConfigured, fetchIamcfoRefs } from '@/lib/integrations/iamcfo';
import { CrmHeader } from '@/components/crm/ui';
import { DealFields } from '@/components/crm/DealFields';

const BILLING_MSG: Record<string, { text: string; ok?: boolean }> = {
  created: { text: 'Invoice + bill created in QuickBooks ✓', ok: true },
  exists: { text: 'This deal is already billed — invoice and bill exist in QuickBooks.', ok: true },
  not_owner: { text: 'Only an owner or admin can create invoices.' },
  no_brand: { text: 'Add a company to this deal before invoicing.' },
  no_amount: { text: 'Set a budget on this deal — that’s the invoice amount.' },
  not_configured: { text: 'Billing isn’t connected yet (I AM CFO link not configured). Ask your manager.' },
  pending_config: { text: 'QuickBooks needs a service item / expense account set on the I AM CFO side first.' },
  wrong_company: { text: 'Aborted — I AM CFO is connected to a different QuickBooks company than expected.' },
  error: { text: 'Couldn’t create the invoice/bill. Please try again.' },
};

export default async function EditDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const { id } = await params;
  const { billing } = await searchParams;
  const [deal, companies, talent, profile] = await Promise.all([
    getDeal(id),
    companyOptions(),
    talentOptions(),
    getCurrentProfile(),
  ]);
  if (!deal) notFound();
  const canEditBudget = profile?.role === 'owner' || profile?.role === 'admin';

  // Current QBO billing state for this deal (owner/admin only).
  type QboRow = { qbo_invoice_id: string | null; qbo_bill_id: string | null; invoice_number: string | null };
  let qbo: QboRow | null = null;
  if (canEditBudget) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from('deals')
      .select('qbo_invoice_id, qbo_bill_id, invoice_number')
      .eq('id', id)
      .maybeSingle();
    qbo = (data as QboRow | null) ?? null;
  }
  const billingMsg = billing ? BILLING_MSG[billing] : null;
  const alreadyBilled = Boolean(qbo?.qbo_invoice_id);
  const today = new Date().toISOString().slice(0, 10);

  // Synced QBO customers/vendors/classes for the dropdowns (best-effort).
  const showBillingForm = canEditBudget && !alreadyBilled && iamcfoBillingConfigured();
  const refs = showBillingForm
    ? await fetchIamcfoRefs()
    : { customers: [], vendors: [], classes: [], ok: true, status: 200 };
  const qboClasses = refs.classes;
  // Explain an empty result instead of silently showing blank dropdowns.
  const refsWarning =
    showBillingForm && !refs.ok
      ? refs.status === 401
        ? 'Couldn’t load QuickBooks lists — the billing key was rejected (401). Make sure IAMCFO_BILLING_API_KEY (Tulips) exactly matches TULIPS_BILLING_API_KEY (I AM CFO), then redeploy both.'
        : refs.status === 404
          ? 'Couldn’t load QuickBooks lists — the Tulips org wasn’t found in I AM CFO (404). Check TULIPS_ORG_SUBDOMAIN.'
          : `Couldn’t load QuickBooks lists (status ${refs.status}). You can still create/use by name below.`
      : null;

  // Pre-select the QBO Customer/Vendor whose name matches this deal's company/talent.
  const companyName = companies.find((c) => c.id === deal.company_id)?.name ?? '';
  const talentName = talent.find((t) => t.id === deal.talent_id)?.name ?? '';
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const matchedCustomerId = refs.customers.find((c) => eq(c.name, companyName))?.id ?? '';
  const matchedVendorId = refs.vendors.find((v) => eq(v.name, talentName))?.id ?? '';

  return (
    <div className="mx-auto max-w-lg">
      <CrmHeader title="Edit booking" />
      <form action={saveDeal}>
        <DealFields
          companies={companies}
          talent={talent}
          deal={deal}
          canEditBudget={canEditBudget}
          submitLabel="Save changes"
        />
      </form>

      {canEditBudget && (
        <section className="mt-8 max-w-lg rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-lg">Billing</h2>
          <p className="mt-1 text-sm text-stone">
            Create the company invoice and the talent payout bill in QuickBooks (via I AM CFO). The
            bill number matches the invoice number, and the company/talent are created in QuickBooks
            if they don’t exist yet.
          </p>

          {billingMsg && (
            <p
              className={
                'mt-4 rounded-xl px-4 py-2.5 text-sm ' +
                (billingMsg.ok
                  ? 'border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                  : 'border border-tulip/40 bg-blush/60 text-tulip-dark')
              }
            >
              {billingMsg.text}
            </p>
          )}

          {alreadyBilled ? (
            <div className="mt-4 space-y-1 text-sm">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#5B8C5A]/15 px-3 py-1 text-xs font-medium text-[#5B8C5A]">
                Invoiced ✓
              </p>
              <p className="text-stone">
                Invoice #{qbo?.invoice_number ?? '—'}
                {qbo?.qbo_bill_id ? ' · talent bill created (same #)' : ' · no talent bill'}
              </p>
            </div>
          ) : iamcfoBillingConfigured() ? (
            <form action={createDealBilling} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={id} />
              {refsWarning && (
                <p className="rounded-xl border border-tulip/40 bg-blush/60 px-4 py-2.5 text-xs text-tulip-dark">
                  {refsWarning}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Customer (QuickBooks)</span>
                  <select
                    name="customer_id"
                    defaultValue={matchedCustomerId}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  >
                    <option value="">＋ Create/use “{companyName || 'company'}”</option>
                    {refs.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-stone">
                    {matchedCustomerId ? 'Matched from QuickBooks.' : 'Not in QuickBooks yet — will be created.'}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Vendor · talent (QuickBooks)</span>
                  <select
                    name="vendor_id"
                    defaultValue={matchedVendorId}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  >
                    <option value="">
                      {talentName ? `＋ Create/use “${talentName}”` : 'No talent on this deal'}
                    </option>
                    {refs.vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-stone">
                    {matchedVendorId ? 'Matched from QuickBooks.' : 'Not in QuickBooks yet — will be created.'}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Invoice amount ($)</span>
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min="0"
                    defaultValue={deal.budget != null ? String(deal.budget) : ''}
                    placeholder="e.g. 15000"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <span className="mt-1 block text-xs text-stone">Prefilled from the deal budget.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Invoice date</span>
                  <input
                    type="date"
                    name="invoice_date"
                    defaultValue={today}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <span className="mt-1 block text-xs text-stone">Bill uses the same date.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Class</span>
                  <select
                    name="qbo_class"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  >
                    <option value="">Default</option>
                    {qboClasses.map((c) => (
                      <option key={c.id} value={c.fullyQualifiedName}>
                        {c.fullyQualifiedName}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-stone">
                    {qboClasses.length > 0
                      ? 'QuickBooks class for both docs.'
                      : 'No QBO classes loaded yet — “Default” tags with the standard class.'}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Payout override (optional)</span>
                  <input
                    type="text"
                    name="payout_override"
                    placeholder="e.g. 90% or $1500"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  />
                  <span className="mt-1 block text-xs text-stone">
                    Overrides the talent’s default rate for this deal only.
                  </span>
                </label>
              </div>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="create_bill"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 rounded border-line accent-ink"
                />
                <span className="text-sm text-ink">
                  Also create the talent payout bill
                  <span className="block text-xs text-stone">
                    Uncheck for a one-off invoice with no talent payout.
                  </span>
                </span>
              </label>
              <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip">
                Create in QuickBooks
              </button>
              <p className="text-xs text-stone">
                Invoices the company for the amount above; when the box is checked, also bills the
                talent their payout (or your override), tagged to the company.
              </p>
            </form>
          ) : (
            <p className="mt-4 text-sm text-stone">
              Billing isn’t connected yet. Set{' '}
              <code className="rounded bg-blush/60 px-1">IAMCFO_BILLING_URL</code> and{' '}
              <code className="rounded bg-blush/60 px-1">IAMCFO_BILLING_API_KEY</code> to enable this.
            </p>
          )}
        </section>
      )}

      <form action={deleteDeal} className="mt-8 max-w-lg border-t border-line pt-6">
        <input type="hidden" name="id" value={deal.id} />
        <button className="text-sm text-tulip hover:underline">Delete this booking</button>
      </form>
    </div>
  );
}
