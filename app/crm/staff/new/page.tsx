import { createStaff } from '@/lib/crm/actions';
import { CrmHeader, SubmitBar } from '@/components/crm/ui';
import { StaffFields } from '@/components/crm/forms';

export const dynamic = 'force-dynamic';

export default function NewStaffPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <CrmHeader title="New staff" />
      <form action={createStaff} className="space-y-4">
        <StaffFields />
        <SubmitBar label="Create staff" cancelHref="/crm/staff" />
      </form>
    </div>
  );
}
