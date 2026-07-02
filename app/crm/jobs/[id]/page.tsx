import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJob, getConditionReport, getCurrentProfile } from '@/lib/crm/data';
import { serviceLabel, statusLabel, statusClasses, money } from '@/lib/format';
import { Empty, Pill } from '@/components/crm/ui';

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, profile] = await Promise.all([getJob(id), getCurrentProfile()]);
  if (!job) notFound();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const isCR = job.service_type === 'condition_report';
  const report = isCR ? await getConditionReport(id) : null;

  return (
    <>
      <div className="mb-6">
        <Link href="/crm/jobs" className="text-sm text-stone hover:text-ink">
          ← Jobs
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{serviceLabel(job.service_type)}</h1>
          <Pill className={statusClasses(job.status)}>{statusLabel(job.status)}</Pill>
        </div>
      </div>

      <div className="mb-8 grid gap-4 rounded-2xl border border-line bg-white p-5 text-sm sm:grid-cols-2">
        <Info label="Client" value={job.client_name} />
        <Info label="Vehicle" value={job.vehicle} />
        <Info label="Assigned staff" value={job.staff_name ?? '—'} />
        <Info label="Location" value={job.location ?? '—'} />
        <Info label="Scheduled" value={job.scheduled_date ?? '—'} />
        <Info label="Completed" value={job.completed_date ?? '—'} />
        {isOwner && <Info label="Price" value={money(job.price)} />}
        {isOwner && <Info label="Cost" value={money(job.cost)} />}
      </div>

      {job.notes && (
        <div className="mb-8 rounded-2xl border border-line bg-white p-5 text-sm">
          <h2 className="mb-2 font-medium">Notes</h2>
          <p className="whitespace-pre-wrap text-stone">{job.notes}</p>
        </div>
      )}

      {isCR && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Condition report</h2>
            <Link
              href={`/crm/jobs/${id}/report`}
              className="rounded-full bg-ink px-4 py-2 text-sm text-white transition-colors hover:bg-steel"
            >
              {report ? 'Edit report' : 'Create report'}
            </Link>
          </div>
          {!report ? (
            <Empty>No condition report filed yet.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 text-sm sm:grid-cols-3">
                <Info label="Overall grade" value={report.overall_grade ?? '—'} />
                <Info label="Mileage" value={report.mileage ? report.mileage.toLocaleString() : '—'} />
                <Info
                  label="Inspected"
                  value={report.inspected_at ? new Date(report.inspected_at).toLocaleString() : '—'}
                />
              </div>

              <div className="rounded-2xl border border-line bg-white p-5">
                <h3 className="mb-3 font-medium">Findings ({report.findings.length})</h3>
                {report.findings.length === 0 ? (
                  <p className="text-sm text-stone">No damage recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {report.findings.map((f, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 border-t border-line pt-2 first:border-0 first:pt-0">
                        <div>
                          <span className="font-medium">{f.area || 'Area'}</span>{' '}
                          <Pill className="bg-mist text-steel">{f.severity}</Pill>
                          {f.description && <div className="text-stone">{f.description}</div>}
                        </div>
                        <span className="shrink-0 text-stone">{money(f.cost_estimate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {report.photos.length > 0 && (
                <div className="rounded-2xl border border-line bg-white p-5">
                  <h3 className="mb-3 font-medium">Photos ({report.photos.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {report.photos.map((p, i) => (
                      <a
                        key={i}
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-line px-3 py-1.5 text-sm text-pds-dark hover:border-ink"
                      >
                        {p.label || `Photo ${i + 1}`}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone">{label}</div>
      <div className="mt-0.5 text-ink">{value}</div>
    </div>
  );
}
