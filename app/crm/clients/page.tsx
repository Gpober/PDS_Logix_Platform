import Link from 'next/link';
import { listClients } from '@/lib/crm/data';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Clients" newHref="/crm/clients/new" newLabel="New client" />
      {clients.length === 0 ? (
        <Empty>No clients yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Phone</Th>
              <Th>Billing email</Th>
            </tr>
          }
        >
          {clients.map((c) => (
            <tr key={c.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/clients/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              </Td>
              <Td>{c.category ?? '—'}</Td>
              <Td>{c.phone ?? '—'}</Td>
              <Td>{c.billing_email ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
