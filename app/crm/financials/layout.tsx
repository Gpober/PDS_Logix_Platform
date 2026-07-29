import { getCurrentProfile } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { FinancialsTabs } from '@/components/crm/FinancialsTabs';

export const dynamic = 'force-dynamic';

export default async function FinancialsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return (<><CrmHeader title="Financials" /><Empty>Financials are owner/admin-only.</Empty></>);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CrmHeader title="Financials" />
      <FinancialsTabs />
      {children}
    </div>
  );
}
