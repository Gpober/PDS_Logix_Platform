import { createClient } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { ClientFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="New client" />
      <form action={createClient} className="space-y-4">
        <ClientFields />
        <SubmitBar label="Create client" cancelHref="/crm/clients" />
      </form>
    </div>
  );
}
