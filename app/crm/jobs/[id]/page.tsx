import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJob, getConditionReport } from '@/lib/crm/data';
import { setJobStatus, deleteJob } from '@/lib/crm/actions';
import { sendJobToQuickBooks, refreshJobFromQuickBooks } from '@/lib/crm/qbo';
import { qboConfigured, isConnected as qboIsConnected } from '@/lib/integrations/quickbooks';
import {
  JOB_STATUSES,
  STATUS_LABELS,
  SERVICE_LABELS,
  type ConditionFinding,
} from '@/lib/crm/types';
import { formatUSD, formatDate } from '@/lib/format';
import { Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-0.5 text-sm">{value || '—'}</div>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const report = await getConditionReport(id);
  const margin = job.price !== null && job.cost !== null ? job.price - job.cost : null;
  const qboReady = qboConfigured() && (await qboIsConnected());

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            {SERVICE_LABELS[job.service_type]}
            {job.client_name ? ` · ${job.client_name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-stone">{job.asset_label ?? 'No asset'}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/crm/jobs/${id}/edit`}
            className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
          >
            Edit
          </Link>
          <form action={deleteJob.bind(null, id)}>
            <button className="rounded-full border border-line px-4 py-2 text-sm text-tulip hover:border-tulip">
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Status changer */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone">Status:</span>
        {JOB_STATUSES.map((s) => (
          <form key={s} action={setJobStatus.bind(null, id, s)}>
            <button
              className={
                'rounded-full border px-3 py-1.5 text-sm ' +
                (job.status === s
                  ? 'border-ink bg-ink text-ivory'
                  : 'border-line hover:border-ink')
              }
            >
              {STATUS_LABELS[s]}
            </button>
          </form>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <Detail
          label="Client"
          value={
            <Link href={`/crm/clients/${job.client_id}`} className="hover:underline">
              {job.client_name ?? '—'}
            </Link>
          }
        />
        <Detail label="Staff" value={job.staff_name} />
        <Detail label="Location" value={job.location} />
        <Detail label="Scheduled" value={formatDate(job.scheduled_date)} />
        <Detail label="Completed" value={formatDate(job.completed_date)} />
        <Detail label="Service" value={SERVICE_LABELS[job.service_type]} />
        <Detail label="Price" value={formatUSD(job.price)} />
        <Detail label="Cost" value={formatUSD(job.cost)} />
        <Detail label="Margin" value={margin === null ? '—' : formatUSD(margin)} />
      </div>

      {job.notes && (
        <p className="mt-4 rounded-2xl border border-line bg-white p-5 text-sm whitespace-pre-wrap">
          {job.notes}
        </p>
      )}

      {/* QuickBooks */}
      <h2 className="mb-3 mt-8 font-display text-xl">QuickBooks</h2>
      {!qboConfigured() ? (
        <Empty>QuickBooks isn’t configured yet. Add the Intuit API credentials to switch it on.</Empty>
      ) : !qboReady ? (
        <div className="rounded-2xl border border-line bg-white p-5 text-sm">
          QuickBooks isn’t connected.{' '}
          <Link href="/crm/settings" className="text-tulip hover:underline">
            Connect it in Settings
          </Link>{' '}
          to send invoices.
        </div>
      ) : job.qbo_invoice_id ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-white p-5">
          <Detail label="QBO invoice" value={`#${job.qbo_invoice_id}`} />
          <Detail label="Payment status" value={job.qbo_invoice_status ?? '—'} />
          <Detail label="Balance due" value={formatUSD(job.qbo_balance)} />
          <Detail label="Last synced" value={formatDate(job.qbo_synced_at)} />
          <form action={refreshJobFromQuickBooks.bind(null, id)}>
            <button className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink">
              Refresh status
            </button>
          </form>
        </div>
      ) : (
        <form
          action={sendJobToQuickBooks.bind(null, id)}
          className="flex items-center gap-3 rounded-2xl border border-line bg-white p-5"
        >
          <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-tulip">
            Send to QuickBooks
          </button>
          <span className="text-sm text-stone">
            Creates a QBO customer (if needed) and an invoice for {formatUSD(job.price)}.
          </span>
        </form>
      )}

      {/* Condition report (for inspection jobs) */}
      <h2 className="mb-3 mt-8 font-display text-xl">Condition report</h2>
      {!report ? (
        <Empty>No condition report recorded for this job.</Empty>
      ) : (
        <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Overall grade" value={report.overall_grade} />
            <Detail label="Mileage" value={report.mileage ?? '—'} />
            <Detail label="Inspected" value={formatDate(report.inspected_at)} />
            <Detail label="Photos" value={report.photos?.length ?? 0} />
          </div>
          {report.exterior_notes && <Detail label="Exterior" value={report.exterior_notes} />}
          {report.interior_notes && <Detail label="Interior" value={report.interior_notes} />}
          {report.mechanical_notes && <Detail label="Mechanical" value={report.mechanical_notes} />}
          {report.findings?.length > 0 && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-stone">Findings</div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {report.findings.map((f: ConditionFinding, i: number) => (
                  <li key={i}>
                    {[f.area, f.severity, f.note].filter(Boolean).join(' — ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
