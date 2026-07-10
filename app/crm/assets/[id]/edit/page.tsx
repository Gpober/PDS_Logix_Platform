import { notFound } from 'next/navigation';
import { getAsset, clientOptions } from '@/lib/crm/data';
import { updateAsset } from '@/lib/crm/actions';
import { assetLabel } from '@/lib/crm/types';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { AssetFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [asset, clients] = await Promise.all([getAsset(id), clientOptions()]);
  if (!asset) notFound();
  const options = clients.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title={`Edit ${assetLabel(asset)}`} />
      <form action={updateAsset.bind(null, id)} className="space-y-4">
        <AssetFields asset={asset} clientOptions={options} />
        <SubmitBar label="Save changes" cancelHref="/crm/assets" />
      </form>
    </div>
  );
}
