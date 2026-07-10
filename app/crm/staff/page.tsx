import Link from 'next/link';
import { listStaff } from '@/lib/crm/data';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const staff = await listStaff();
  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Staff" newHref="/crm/staff/new" newLabel="New staff" />
      {staff.length === 0 ? (
        <Empty>No staff yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Active</Th>
            </tr>
          }
        >
          {staff.map((s) => (
            <tr key={s.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/staff/${s.id}/edit`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              </Td>
              <Td>{s.title ?? '—'}</Td>
              <Td>{s.email ?? '—'}</Td>
              <Td>{s.phone ?? '—'}</Td>
              <Td>{s.is_active ? 'Yes' : 'No'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
