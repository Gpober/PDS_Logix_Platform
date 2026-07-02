import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClient, listContactsForClient, listJobs } from '@/lib/crm/data';
import { serviceLabel, statusLabel, statusClasses } from '@/lib/format';
import { Empty, Pill, Table, Td, Th } from '@/components/crm/ui';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [client, contacts, allJobs] = await Promise.all([
    getClient(id),
    listContactsForClient(id),
    listJobs(),
  ]);
  if (!client) notFound();

  const jobs = allJobs.filter((j) => j.client_id === id);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link href="/crm/clients" className="text-sm text-stone hover:text-ink">
            ← Clients
          </Link>
          <h1 className="mt-1 font-display text-3xl">{client.name}</h1>
          {client.category && <Pill className="mt-2">{client.category}</Pill>}
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5 text-sm">
          <h2 className="mb-3 font-medium">Details</h2>
          <dl className="space-y-2 text-stone">
            <Row label="Website" value={client.website} link />
            <Row label="Billing email" value={client.billing_email} />
            <Row label="Phone" value={client.phone} />
            <Row label="Address" value={client.address} />
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 text-sm">
          <h2 className="mb-3 font-medium">Contacts</h2>
          {contacts.length === 0 ? (
            <p className="text-stone">No contacts yet.</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.name}</span>
                  {c.title && <span className="text-stone"> · {c.title}</span>}
                  {c.email && <div className="text-stone">{c.email}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {client.notes && (
        <div className="mb-8 rounded-2xl border border-line bg-white p-5 text-sm">
          <h2 className="mb-2 font-medium">Notes</h2>
          <p className="whitespace-pre-wrap text-stone">{client.notes}</p>
        </div>
      )}

      <h2 className="mb-3 font-display text-xl">Jobs</h2>
      {jobs.length === 0 ? (
        <Empty>No jobs for this client yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Vehicle</Th>
              <Th>Service</Th>
              <Th>Status</Th>
              <Th>Scheduled</Th>
            </tr>
          }
        >
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-mist/50">
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

function Row({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right text-ink">
        {value ? (
          link ? (
            <a href={value} target="_blank" rel="noreferrer" className="text-pds-dark hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          '—'
        )}
      </dd>
    </div>
  );
}
