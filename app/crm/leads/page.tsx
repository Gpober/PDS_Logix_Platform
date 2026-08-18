import Link from 'next/link';
import { listLeads } from '@/lib/crm/data';
import { deleteLead } from '@/lib/crm/actions';
import { formatDate } from '@/lib/format';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? 'new').toLowerCase();
  const tone =
    s === 'contacted'
      ? 'bg-amber-100 text-amber-800'
      : s === 'qualified' || s === 'won'
        ? 'bg-green-100 text-green-800'
        : s === 'lost' || s === 'unsubscribed'
          ? 'bg-stone/20 text-stone'
          : 'bg-blush/50 text-ink';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>{s}</span>;
}

export default async function LeadsPage() {
  const leads = await listLeads();
  return (
    <div className="mx-auto max-w-6xl">
      <CrmHeader title="Leads" />
      {leads.length === 0 ? (
        <Empty>No inbound leads yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>State</Th>
              <Th>Status</Th>
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
                <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
                {l.contact_title && <div className="mt-0.5 text-xs text-stone">{l.contact_title}</div>}
              </Td>
              <Td>{l.company ?? '—'}</Td>
              <Td>{l.state ?? '—'}</Td>
              <Td>
                <StatusPill status={l.status} />
              </Td>
              <Td>
                <a href={`mailto:${l.email}`} className="hover:underline">
                  {l.email}
                </a>
              </Td>
              <Td>{l.phone ?? '—'}</Td>
              <Td>{formatDate(l.created_at)}</Td>
              <Td>
                <div className="flex items-center gap-3">
                  <Link href={`/crm/leads/${l.id}`} className="text-xs text-stone hover:text-ink">
                    View
                  </Link>
                  <form action={deleteLead.bind(null, l.id)}>
                    <button className="text-xs text-stone hover:text-tulip">Delete</button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
