import { getCurrentProfile } from '@/lib/crm/data';
import { iamcfoConfigured, iamcfoConnected } from '@/lib/integrations/iamcfo';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  const configured = iamcfoConfigured();
  const connected = configured && (await iamcfoConnected());

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="Settings" />

      <section className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">QuickBooks Online</h2>
            <p className="mt-1 text-sm text-stone">
              Invoices and bills post to the Pride Dealer Services books, managed through the I AM CFO
              platform — there’s no separate QuickBooks login here.
            </p>
          </div>
          <span
            className={
              'rounded-full px-3 py-1 text-xs font-medium ' +
              (connected ? 'bg-sage/20 text-sage' : 'bg-stone/15 text-stone')
            }
          >
            {connected ? 'Connected' : configured ? 'Not reachable' : 'Not configured'}
          </span>
        </div>

        <div className="mt-5">
          {!isOwner ? (
            <Empty>Only an owner or admin can view the QuickBooks connection.</Empty>
          ) : !configured ? (
            <Empty>
              Set <code>IAMCFO_API_URL</code> and <code>IAMCFO_API_TOKEN</code> in the environment (the
              books live under the <code>pdslogix</code> org in I AM CFO), then reload this page.
            </Empty>
          ) : connected ? (
            <p className="text-sm text-stone">
              Connected to the Pride Dealer Services books via I AM CFO (org <code>pdslogix</code>). Send a
              job to QuickBooks from any job page, or ask Zordon to invoice.
            </p>
          ) : (
            <Empty>
              The I AM CFO partner API is configured but the books aren’t reachable — check the token and
              that QuickBooks is connected for the <code>pdslogix</code> org on I AM CFO.
            </Empty>
          )}
        </div>
      </section>
    </div>
  );
}
