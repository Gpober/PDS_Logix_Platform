import { listContacts, clientOptions } from '@/lib/crm/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';

export default async function ContactsPage() {
  const [contacts, clients] = await Promise.all([listContacts(), clientOptions()]);
  const cMap = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <>
      <CrmHeader title="Contacts" newHref="/crm/contacts/new" newLabel="New contact" />
      {contacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
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
            <tr key={c.id} className="hover:bg-mist/50">
              <Td>{c.name}</Td>
              <Td>{c.title ?? '—'}</Td>
              <Td>{cMap.get(c.client_id) ?? '—'}</Td>
              <Td>{c.email ?? '—'}</Td>
              <Td>{c.phone ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
