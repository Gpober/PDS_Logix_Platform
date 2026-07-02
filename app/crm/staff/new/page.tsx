import { saveStaff } from '@/lib/crm/actions';
import { CrmHeader, Field, TextArea, SubmitBar } from '@/components/crm/ui';

export default function NewStaffPage() {
  return (
    <>
      <CrmHeader title="New staff" />
      <form action={saveStaff} className="max-w-lg space-y-4">
        <Field label="Name" name="name" required />
        <Field label="Title" name="title" placeholder="Inspector, Detailer, Biohazard Tech…" />
        <Field label="Email" name="email" type="email" />
        <Field label="Phone" name="phone" />
        <label className="flex items-center gap-2 text-sm text-stone">
          <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4" />
          Active
        </label>
        <TextArea label="Notes" name="notes" />
        <SubmitBar label="Create staff" cancelHref="/crm/staff" />
      </form>
    </>
  );
}
