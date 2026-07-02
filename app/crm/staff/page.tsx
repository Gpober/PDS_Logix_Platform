import { listStaff } from '@/lib/crm/data';
import { CrmHeader, Empty, Pill, Table, Td, Th } from '@/components/crm/ui';

export default async function StaffPage() {
  const staff = await listStaff();

  return (
    <>
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
              <Th>Status</Th>
            </tr>
          }
        >
          {staff.map((s) => (
            <tr key={s.id} className="hover:bg-mist/50">
              <Td>{s.name}</Td>
              <Td>{s.title ?? '—'}</Td>
              <Td>{s.email ?? '—'}</Td>
              <Td>{s.phone ?? '—'}</Td>
              <Td>
                {s.is_active ? (
                  <Pill className="bg-emerald-100 text-emerald-700">Active</Pill>
                ) : (
                  <Pill className="bg-stone/15 text-stone">Inactive</Pill>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
