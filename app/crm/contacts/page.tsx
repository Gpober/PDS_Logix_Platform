import Link from 'next/link';
import { listContacts } from '@/lib/crm/data';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Contacts" />
      {contacts.length === 0 ? (
        <Empty>No contacts yet. Add contacts from a client’s page.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Client</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
            </tr>
          }
        >
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-blush/30">
              <Td>{c.name}</Td>
              <Td>{c.title ?? '—'}</Td>
              <Td>
                {c.client_id ? (
                  <Link href={`/crm/clients/${c.client_id}`} className="hover:underline">
                    {c.client_name ?? '—'}
                  </Link>
                ) : (
                  '—'
                )}
              </Td>
              <Td>{c.email ?? '—'}</Td>
              <Td>{c.phone ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
