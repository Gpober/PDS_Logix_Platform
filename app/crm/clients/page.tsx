import Link from 'next/link';
import { listClients } from '@/lib/crm/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <CrmHeader title="Clients" newHref="/crm/clients/new" newLabel="New client" />
      {clients.length === 0 ? (
        <Empty>No clients yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Open jobs</Th>
              <Th>Total jobs</Th>
              <Th>Last serviced</Th>
            </tr>
          }
        >
          {clients.map((c) => (
            <tr key={c.id} className="hover:bg-mist/50">
              <Td>
                <Link href={`/crm/clients/${c.id}`} className="font-medium text-ink hover:text-pds-dark">
                  {c.name}
                </Link>
              </Td>
              <Td>{c.category ?? '—'}</Td>
              <Td>{c.open_job_count}</Td>
              <Td>{c.job_count}</Td>
              <Td>{c.date_last_serviced ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
