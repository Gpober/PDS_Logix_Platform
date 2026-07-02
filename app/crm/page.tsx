import Link from 'next/link';
import { dashboardStats, listJobs } from '@/lib/crm/data';
import { serviceLabel, statusLabel, statusClasses } from '@/lib/format';
import { Empty, Pill, Table, Td, Th } from '@/components/crm/ui';

export default async function CrmHome() {
  const [stats, jobs] = await Promise.all([dashboardStats(), listJobs()]);
  const recent = jobs.slice(0, 8);

  const cards = [
    { label: 'Clients', value: stats.clients, href: '/crm/clients' },
    { label: 'Open jobs', value: stats.openJobs, href: '/crm/jobs' },
    { label: 'Active staff', value: stats.activeStaff, href: '/crm/staff' },
    { label: 'Leads', value: stats.newLeads, href: '/crm/leads' },
  ];

  return (
    <>
      <h1 className="mb-6 font-display text-3xl">Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-line bg-white p-5 transition-colors hover:border-ink"
          >
            <div className="font-display text-3xl">{c.value}</div>
            <div className="mt-1 text-sm text-stone">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl">Recent jobs</h2>
        <Link href="/crm/jobs" className="text-sm text-pds-dark hover:underline">
          View all
        </Link>
      </div>

      {recent.length === 0 ? (
        <Empty>No jobs yet. Create one from the Jobs tab.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Client</Th>
              <Th>Vehicle</Th>
              <Th>Service</Th>
              <Th>Status</Th>
              <Th>Scheduled</Th>
            </tr>
          }
        >
          {recent.map((j) => (
            <tr key={j.id} className="hover:bg-mist/50">
              <Td>{j.client_name}</Td>
              <Td>{j.vehicle}</Td>
              <Td>{serviceLabel(j.service_type)}</Td>
              <Td>
                <Pill className={statusClasses(j.status)}>{statusLabel(j.status)}</Pill>
              </Td>
              <Td>{j.scheduled_date ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
