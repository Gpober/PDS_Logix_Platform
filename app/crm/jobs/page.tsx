import { listJobs, getCurrentProfile } from '@/lib/crm/data';
import { serviceLabel, statusLabel, statusClasses, money } from '@/lib/format';
import { CrmHeader, Empty, Pill, Table, Td, Th } from '@/components/crm/ui';

export default async function JobsPage() {
  const [jobs, profile] = await Promise.all([listJobs(), getCurrentProfile()]);
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <>
      <CrmHeader title="Jobs" newHref="/crm/jobs/new" newLabel="New job" />
      {jobs.length === 0 ? (
        <Empty>No jobs yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Client</Th>
              <Th>Vehicle</Th>
              <Th>Service</Th>
              <Th>Status</Th>
              <Th>Staff</Th>
              <Th>Scheduled</Th>
              {isOwner && <Th>Price</Th>}
            </tr>
          }
        >
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-mist/50">
              <Td>{j.client_name}</Td>
              <Td>{j.vehicle}</Td>
              <Td>{serviceLabel(j.service_type)}</Td>
              <Td>
                <Pill className={statusClasses(j.status)}>{statusLabel(j.status)}</Pill>
              </Td>
              <Td>{j.staff_name ?? '—'}</Td>
              <Td>{j.scheduled_date ?? '—'}</Td>
              {isOwner && <Td>{money(j.price)}</Td>}
            </tr>
          ))}
        </Table>
      )}
      {!isOwner && (
        <p className="mt-4 text-xs text-stone">
          Pricing is visible to owners and admins only.
        </p>
      )}
    </>
  );
}
