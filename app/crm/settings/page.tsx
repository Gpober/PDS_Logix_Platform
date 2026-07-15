import Link from 'next/link';
import { getCurrentProfile } from '@/lib/crm/data';
import { disconnectQuickBooks } from '@/lib/crm/qbo';
import { qboConfigured, isConnected } from '@/lib/integrations/quickbooks';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  connected: 'QuickBooks connected.',
  denied: 'QuickBooks authorization was cancelled.',
  error: 'Something went wrong connecting QuickBooks. Try again.',
  state_mismatch: 'Security check failed (state mismatch). Please try connecting again.',
  unconfigured: 'QuickBooks credentials aren’t set in the environment yet.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string }>;
}) {
  const { qbo } = await searchParams;
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  const configured = qboConfigured();
  const connected = configured && (await isConnected());
  const notice = qbo ? MESSAGES[qbo] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="Settings" />

      {notice && (
        <p className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm">{notice}</p>
      )}

      <section className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">QuickBooks Online</h2>
            <p className="mt-1 text-sm text-stone">
              Push invoices from jobs to QuickBooks and pull payment status back.
            </p>
          </div>
          <span
            className={
              'rounded-full px-3 py-1 text-xs font-medium ' +
              (connected ? 'bg-sage/20 text-sage' : 'bg-stone/15 text-stone')
            }
          >
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <div className="mt-5">
          {!isOwner ? (
            <Empty>Only an owner or admin can manage the QuickBooks connection.</Empty>
          ) : !configured ? (
            <Empty>
              Add <code>QBO_CLIENT_ID</code> and <code>QBO_CLIENT_SECRET</code> to the environment to
              enable QuickBooks, then reload this page.
            </Empty>
          ) : connected ? (
            <form action={disconnectQuickBooks}>
              <button className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-ink">
                Disconnect QuickBooks
              </button>
            </form>
          ) : (
            <Link
              href="/api/quickbooks/connect"
              className="inline-block rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-tulip"
            >
              Connect QuickBooks
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
