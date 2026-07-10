import { notFound } from 'next/navigation';
import { getClient } from '@/lib/crm/data';
import { updateClient } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { ClientFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title={`Edit ${client.name}`} />
      <form action={updateClient.bind(null, id)} className="space-y-4">
        <ClientFields client={client} />
        <SubmitBar label="Save changes" cancelHref={`/crm/clients/${id}`} />
      </form>
    </div>
  );
}
