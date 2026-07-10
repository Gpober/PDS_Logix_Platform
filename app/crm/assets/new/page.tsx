import { clientOptions } from '@/lib/crm/data';
import { createAsset } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { AssetFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function NewAssetPage() {
  const clients = await clientOptions();
  const options = clients.map((c) => ({ value: c.id, label: c.name }));
  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="New asset" />
      <form action={createAsset} className="space-y-4">
        <AssetFields clientOptions={options} />
        <SubmitBar label="Create asset" cancelHref="/crm/assets" />
      </form>
    </div>
  );
}
