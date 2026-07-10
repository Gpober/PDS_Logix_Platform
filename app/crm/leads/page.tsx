import { listLeads } from '@/lib/crm/data';
import { deleteLead } from '@/lib/crm/actions';
import { formatDate } from '@/lib/format';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const leads = await listLeads();
  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Leads" />
      {leads.length === 0 ? (
        <Empty>No inbound leads yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Service</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Received</Th>
              <Th>{' '}</Th>
            </tr>
          }
        >
          {leads.map((l) => (
            <tr key={l.id} className="align-top hover:bg-blush/30">
              <Td>
                <div className="font-medium">{l.name}</div>
                {l.message && <div className="mt-1 max-w-xs text-xs text-stone">{l.message}</div>}
              </Td>
              <Td>{l.company ?? '—'}</Td>
              <Td>{l.service_type ?? '—'}</Td>
              <Td>{l.email}</Td>
              <Td>{l.phone ?? '—'}</Td>
              <Td>{formatDate(l.created_at)}</Td>
              <Td>
                <form action={deleteLead.bind(null, l.id)}>
                  <button className="text-xs text-stone hover:text-tulip">Delete</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
