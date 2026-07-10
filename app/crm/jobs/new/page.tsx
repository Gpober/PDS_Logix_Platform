import { clientOptions, staffOptions, assetOptions } from '@/lib/crm/data';
import { createJob } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { JobFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function NewJobPage() {
  const [clients, staff, assets] = await Promise.all([
    clientOptions(),
    staffOptions(),
    assetOptions(),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="New job" />
      <form action={createJob} className="space-y-4">
        <JobFields
          clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
          staffOptions={staff.map((s) => ({ value: s.id, label: s.name }))}
          assetOptions={assets.map((a) => ({ value: a.id, label: a.label }))}
        />
        <SubmitBar label="Create job" cancelHref="/crm/jobs" />
      </form>
    </div>
  );
}
