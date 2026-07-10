import Link from 'next/link';
import { getCurrentProfile, getDashboardStats, recentJobs } from '@/lib/crm/data';
import { formatUSD, formatDate } from '@/lib/format';
import { STATUS_LABELS, SERVICE_LABELS, JOB_STATUSES } from '@/lib/crm/types';
import { Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="text-2xl font-display">{value}</div>
      <div className="mt-1 text-sm text-stone">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function CrmHome() {
  const profile = await getCurrentProfile();
  const stats = await getDashboardStats();
  const jobs = await recentJobs(8);
  const first = profile?.full_name?.split(' ')[0];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl">Welcome{first ? `, ${first}` : ''}</h1>
        <p className="mt-1 text-sm text-stone">Here’s where PDS Logix stands today.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Clients" value={stats.clients} href="/crm/clients" />
        <Stat label="Assets" value={stats.assets} href="/crm/assets" />
        <Stat label="Staff" value={stats.staff} href="/crm/staff" />
        <Stat label="Open jobs" value={stats.openJobs} href="/crm/jobs" />
        <Stat label="Leads" value={stats.leads} href="/crm/leads" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Pipeline value (not yet invoiced)" value={formatUSD(stats.pipelineValue)} />
        <Stat label="Invoiced value" value={formatUSD(stats.invoicedValue)} />
      </div>

      <h2 className="mb-3 mt-8 font-display text-xl">Jobs by stage</h2>
      <div className="flex flex-wrap gap-2">
        {JOB_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/crm/jobs?status=${s}`}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-ink"
          >
            {STATUS_LABELS[s]} · <span className="font-medium">{stats.jobsByStatus[s]}</span>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-display text-xl">Recent jobs</h2>
      {jobs.length === 0 ? (
        <Empty>No jobs yet. Create one from the Jobs tab.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>Asset</Th>
              <Th>Status</Th>
              <Th>Scheduled</Th>
              <Th>Price</Th>
            </tr>
          }
        >
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/jobs/${j.id}`} className="hover:underline">
                  {j.client_name ?? '—'}
                </Link>
              </Td>
              <Td>{SERVICE_LABELS[j.service_type]}</Td>
              <Td>{j.asset_label ?? '—'}</Td>
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
