import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJob, getConditionReport, staffOptions } from '@/lib/crm/data';
import { serviceLabel } from '@/lib/format';
import { ConditionReportForm } from '@/components/crm/ConditionReportForm';

export default async function ConditionReportEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, report, staff] = await Promise.all([
    getJob(id),
    getConditionReport(id),
    staffOptions(),
  ]);
  if (!job) notFound();

  return (
    <>
      <div className="mb-6">
        <Link href={`/crm/jobs/${id}`} className="text-sm text-stone hover:text-ink">
          ← Job
        </Link>
        <h1 className="mt-1 font-display text-3xl">
          {report ? 'Edit' : 'New'} condition report
        </h1>
        <p className="mt-1 text-sm text-stone">
          {job.client_name} · {job.vehicle} · {serviceLabel(job.service_type)}
        </p>
      </div>

      <ConditionReportForm
        jobId={id}
        assetId={job.asset_id}
        staff={staff}
        report={report}
        cancelHref={`/crm/jobs/${id}`}
      />
    </>
  );
}
