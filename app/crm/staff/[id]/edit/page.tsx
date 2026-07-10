import { notFound } from 'next/navigation';
import { getStaff } from '@/lib/crm/data';
import { updateStaff } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { StaffFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaff(id);
  if (!staff) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title={`Edit ${staff.name}`} />
      <form action={updateStaff.bind(null, id)} className="space-y-4">
        <StaffFields staff={staff} />
        <SubmitBar label="Save changes" cancelHref="/crm/staff" />
      </form>
    </div>
  );
}
