import { notFound } from 'next/navigation';
import { getJob, getJobPricing, clientOptions, staffOptions, assetOptions } from '@/lib/crm/data';
import { updateJob } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { JobFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, pricing, clients, staff, assets] = await Promise.all([
    getJob(id),
    getJobPricing(id),
    clientOptions(),
    staffOptions(),
    assetOptions(),
  ]);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="Edit job" />
      <form action={updateJob.bind(null, id)} className="space-y-4">
        <JobFields
          job={job}
          pricing={pricing}
          clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
          staffOptions={staff.map((s) => ({ value: s.id, label: s.name }))}
          assetOptions={assets.map((a) => ({ value: a.id, label: a.label }))}
        />
        <SubmitBar label="Save changes" cancelHref={`/crm/jobs/${id}`} />
      </form>
    </div>
  );
}
