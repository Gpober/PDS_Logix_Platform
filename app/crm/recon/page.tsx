import { getCurrentProfile, recentLocations } from '@/lib/crm/data';
import { listReconBatches } from '@/lib/crm/recon';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { ReconWorkbench } from '@/components/crm/ReconWorkbench';

export const dynamic = 'force-dynamic';

export default async function ReconPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Car Count Recon" />
        <Empty>Reconciliation is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  const [batches, locations] = await Promise.all([listReconBatches(), recentLocations(20)]);

  return (
    <div className="space-y-6">
      <CrmHeader title="Car Count Recon" />
      <p className="-mt-2 text-center text-sm text-stone">
        Our car count vs the auction’s — matched VIN by VIN, so you can see exactly which units they billed that we
        never logged, and which we did that never made their list. Ask Zordon to walk the exceptions with you.
      </p>

      {batches.length === 0 && (
        <Empty>No reconciliation yet. Upload the Manheim file below and the match runs on the spot.</Empty>
      )}

      <ReconWorkbench initialBatches={batches} locations={locations} />
    </div>
  );
}
