import Link from 'next/link';
import { listStaffBrowse, staffPositions, type StaffSort } from '@/lib/crm/data';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';
import { StaffToolbar } from '@/components/crm/StaffToolbar';
import type { Staff } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'cards';

  const [staff, positions] = await Promise.all([
    listStaffBrowse({
      search: sp.search ?? '',
      position: sp.position ?? '',
      group: sp.group ?? '',
      sortBy: (sp.sort as StaffSort) ?? 'name',
      sortOrder: sp.order === 'desc' ? 'desc' : 'asc',
    }),
    staffPositions(),
  ]);

  const hasFilters = Boolean(sp.search || sp.position || sp.group);

  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Team" newHref="/crm/staff/new" newLabel="New team member" />
      <p className="-mt-3 mb-4 text-center text-sm text-stone">
        {staff.length} {staff.length === 1 ? 'person' : 'people'}{hasFilters ? ' matching filters' : ''}
      </p>

      <StaffToolbar positions={positions} />

      {staff.length === 0 ? (
        <Empty>{hasFilters ? 'No team members match these filters.' : 'No team members yet.'}</Empty>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => <StaffCard key={s.id} staff={s} />)}
        </div>
      ) : (
        <Table
          head={<tr><Th>Name</Th><Th>Position</Th><Th>Group</Th><Th>Email</Th><Th>Phone</Th></tr>}
        >
          {staff.map((s) => (
            <tr key={s.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/staff/${s.id}/edit`} className="flex items-center gap-3 font-medium text-ink hover:text-tulip">
                  <Avatar src={s.headshot_url} name={s.name} />
                  {s.name}
                </Link>
              </Td>
              <Td>{s.title ?? '—'}</Td>
              <Td>{s.payroll_group}</Td>
              <Td>{s.email ?? '—'}</Td>
              <Td>{s.phone ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function StaffCard({ staff: s }: { staff: Staff }) {
  return (
    <Link
      href={`/crm/staff/${s.id}/edit`}
      className={'flex items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md' + (s.is_active ? '' : ' opacity-60')}
    >
      <Avatar src={s.headshot_url} name={s.name} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{s.name}</p>
        {s.title && <p className="truncate text-sm text-stone">{s.title}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-stone">Group {s.payroll_group}</span>
          {!s.is_active && <span className="inline-flex rounded-full bg-stone/15 px-2 py-0.5 text-xs text-stone">Inactive</span>}
        </div>
      </div>
    </Link>
  );
}

// Headshot thumbnail with an initial fallback (plain <img> so any host works).
function Avatar({ src, name, size = 'sm' }: { src: string | null; name: string; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-xl' : 'h-9 w-9 text-sm';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${dim} shrink-0 rounded-full border border-line object-cover`} />;
  }
  return (
    <span className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-blush font-display text-tulip`}>
      {name.charAt(0)}
    </span>
  );
}
