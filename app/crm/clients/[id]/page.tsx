import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClient, getClientContacts, getClientAssets } from '@/lib/crm/data';
import { createContact } from '@/lib/crm/actions';
import { assetLabel } from '@/lib/crm/types';
import { Table, Th, Td, Empty, Field } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-0.5 text-sm">{value || '—'}</div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [contacts, assets] = await Promise.all([getClientContacts(id), getClientAssets(id)]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl">{client.name}</h1>
        <Link
          href={`/crm/clients/${id}/edit`}
          className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <Detail label="Category" value={client.category} />
        <Detail label="Phone" value={client.phone} />
        <Detail label="Billing email" value={client.billing_email} />
        <Detail label="Website" value={client.website} />
        <Detail label="Address" value={client.address} />
        <Detail label="Public" value={client.is_public ? 'Yes' : 'No'} />
      </div>
      {client.notes && (
        <p className="mt-4 rounded-2xl border border-line bg-white p-5 text-sm whitespace-pre-wrap">
          {client.notes}
        </p>
      )}

      {/* Contacts */}
      <h2 className="mb-3 mt-8 font-display text-xl">Contacts</h2>
      {contacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
            </tr>
          }
        >
          {contacts.map((c) => (
            <tr key={c.id}>
              <Td>{c.name}</Td>
              <Td>{c.title ?? '—'}</Td>
              <Td>{c.email ?? '—'}</Td>
              <Td>{c.phone ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
      <form
        action={createContact}
        className="mt-3 grid gap-3 rounded-2xl border border-dashed border-line p-4 sm:grid-cols-4"
      >
        <input type="hidden" name="client_id" value={id} />
        <Field label="Name" name="name" required />
        <Field label="Title" name="title" />
        <Field label="Email" name="email" type="email" />
        <div className="flex items-end">
          <button className="w-full rounded-full bg-tulip px-4 py-2.5 text-sm text-ivory hover:bg-tulip-dark">
            Add contact
          </button>
        </div>
      </form>

      {/* Assets */}
      <h2 className="mb-3 mt-8 font-display text-xl">Assets</h2>
      {assets.length === 0 ? (
        <Empty>No assets linked to this client.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Asset</Th>
              <Th>VIN</Th>
              <Th>Plate</Th>
              <Th>Mileage</Th>
            </tr>
          }
        >
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/assets/${a.id}/edit`} className="hover:underline">
                  {assetLabel(a)}
                </Link>
              </Td>
              <Td>{a.vin ?? '—'}</Td>
              <Td>{a.license_plate ?? '—'}</Td>
              <Td>{a.mileage ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
