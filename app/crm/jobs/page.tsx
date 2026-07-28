import Link from 'next/link';
import { listJobs } from '@/lib/crm/data';
import {
  JOB_STATUSES,
  STATUS_LABELS,
  SERVICE_LABELS,
  type JobStatus,
} from '@/lib/crm/types';
import { formatUSD, formatDate } from '@/lib/format';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const isStatus = (v: string | undefined): v is JobStatus =>
  !!v && (JOB_STATUSES as string[]).includes(v);

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = isStatus(status) ? status : undefined;
  const jobs = await listJobs(active);

  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Jobs" newHref="/crm/jobs/new" newLabel="New job" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/crm/jobs"
          className={
            'rounded-full border px-3 py-1.5 text-sm ' +
            (!active ? 'border-ink bg-tulip text-ivory' : 'border-line hover:border-ink')
          }
        >
          All
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/crm/jobs?status=${s}`}
            className={
              'rounded-full border px-3 py-1.5 text-sm ' +
              (active === s ? 'border-ink bg-tulip text-ivory' : 'border-line hover:border-ink')
            }
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <Empty>No jobs{active ? ` in “${STATUS_LABELS[active]}”` : ''} yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>Asset</Th>
              <Th>Staff</Th>
              <Th>Status</Th>
              <Th>Scheduled</Th>
              <Th>Price</Th>
            </tr>
          }
        >
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/jobs/${j.id}`} className="font-medium hover:underline">
                  {j.client_name ?? '—'}
                </Link>
              </Td>
              <Td>{SERVICE_LABELS[j.service_type]}</Td>
              <Td>{j.asset_label ?? '—'}</Td>
              <Td>{j.staff_name ?? '—'}</Td>
              <Td>{STATUS_LABELS[j.status]}</Td>
              <Td>{formatDate(j.scheduled_date)}</Td>
              <Td>{formatUSD(j.price)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
