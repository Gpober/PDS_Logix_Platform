import Link from 'next/link';
import { listLeads } from '@/lib/crm/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';
import { LeadsFilter } from '@/components/crm/LeadsFilter';

// Primary owner name, stripping the "(with Brad)" / "collab@" style suffixes so
// all of Jess's variants group under one filter value.
const primaryOwner = (owner: string | null) =>
  (owner ?? '').split(/\s*\(|\//)[0].trim();

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; due?: string }>;
}) {
  const { owner, due } = await searchParams;
  const all = await listLeads();
  const today = new Date().toISOString().slice(0, 10);

  const owners = [...new Set(all.map((l) => primaryOwner(l.owner)).filter(Boolean))].sort();

  let leads = all;
  if (owner) leads = leads.filter((l) => primaryOwner(l.owner) === owner);
  if (due === '1')
    leads = leads.filter((l) => l.next_eligible_on != null && l.next_eligible_on <= today);

  const dueCount = all.filter(
    (l) => l.next_eligible_on != null && l.next_eligible_on <= today,
  ).length;

  return (
    <>
      <CrmHeader title="Leads" />
      <p className="mb-6 -mt-3 text-center text-sm text-stone">
        {dueCount} due · {all.length} total
      </p>
      {owners.length > 0 && <LeadsFilter owners={owners} />}
      {leads.length === 0 ? (
        <Empty>No leads match this filter.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Owner</Th>
              <Th>Next eligible</Th>
              <Th>Source</Th>
            </tr>
          }
        >
          {leads.map((l) => {
            const due = l.next_eligible_on != null && l.next_eligible_on <= today;
            return (
              <tr key={l.id} className="hover:bg-blush/30">
                <Td>
                  <Link href={`/crm/leads/${l.id}`} className="font-medium hover:text-tulip">
                    {l.name}
                  </Link>
                </Td>
                <Td>
                  {l.email ? (
                    <a href={`mailto:${l.email}`} className="text-tulip hover:underline">
                      {l.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td>{l.owner ?? '—'}</Td>
                <Td>
                  {l.next_eligible_on ? (
                    <span className="inline-flex items-center gap-2">
                      {l.next_eligible_on}
                      {due && (
                        <span className="rounded-full bg-tulip/15 px-2 py-0.5 text-xs font-medium text-tulip">
                          Due
                        </span>
                      )}
                    </span>
                  ) : (
                    l.next_eligible_text ?? '—'
                  )}
                </Td>
                <Td>{l.source === 'asana:pitch-engine' ? 'Pitch engine' : l.source}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
