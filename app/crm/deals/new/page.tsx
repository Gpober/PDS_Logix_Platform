import { companyOptions, getCurrentProfile, talentOptions } from '@/lib/crm/data';
import { saveDeal } from '@/lib/crm/actions';
import { CrmHeader } from '@/components/crm/ui';
import { DealFields } from '@/components/crm/DealFields';

export default async function NewDealPage() {
  const [companies, talent, profile] = await Promise.all([
    companyOptions(),
    talentOptions(),
    getCurrentProfile(),
  ]);
  const canEditBudget = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <>
      <CrmHeader title="New booking" />
      <form action={saveDeal}>
        <DealFields
          companies={companies}
          talent={talent}
          canEditBudget={canEditBudget}
          submitLabel="Create booking"
        />
      </form>
    </>
  );
}
