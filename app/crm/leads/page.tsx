import { listLeads } from '@/lib/crm/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';
import { serviceLabel } from '@/lib/format';
import type { ServiceType } from '@/lib/crm/types';

function label(s: string | null): string {
  if (!s) return '—';
  if (s === 'condition_report' || s === 'detailing' || s === 'biohazard') {
    return serviceLabel(s as ServiceType);
  }
  return s;
}

export default async function LeadsPage() {
  const leads = await listLeads();

  return (
    <>
      <CrmHeader title="Leads" />
      {leads.length === 0 ? (
        <Empty>No leads yet. They arrive from the public &ldquo;Request a quote&rdquo; form.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Received</Th>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Service</Th>
              <Th>Contact</Th>
              <Th>Message</Th>
            </tr>
          }
        >
          {leads.map((l) => (
            <tr key={l.id} className="hover:bg-mist/50">
              <Td>{new Date(l.created_at).toLocaleDateString()}</Td>
              <Td>{l.name}</Td>
              <Td>{l.company ?? '—'}</Td>
              <Td>{label(l.service_type)}</Td>
              <Td>
                <div>{l.email}</div>
                {l.phone && <div className="text-stone">{l.phone}</div>}
              </Td>
              <Td>
                <span className="line-clamp-3 max-w-xs text-stone">{l.message ?? '—'}</span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
