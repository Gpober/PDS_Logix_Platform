import { saveClient } from '@/lib/crm/actions';
import { CrmHeader, Field, Select, TextArea, SubmitBar } from '@/components/crm/ui';

const categories = [
  { value: 'dealership', label: 'Dealership' },
  { value: 'fleet', label: 'Fleet' },
  { value: 'rental', label: 'Rental' },
  { value: 'insurer', label: 'Insurer' },
  { value: 'body_shop', label: 'Body shop' },
  { value: 'other', label: 'Other' },
];

export default function NewClientPage() {
  return (
    <>
      <CrmHeader title="New client" />
      <form action={saveClient} className="max-w-lg space-y-4">
        <Field label="Name" name="name" required />
        <Select label="Category" name="category" options={categories} placeholder="Select…" />
        <Field label="Website" name="website" placeholder="https://…" />
        <Field label="Billing email" name="billing_email" type="email" />
        <Field label="Phone" name="phone" />
        <Field label="Address" name="address" />
        <TextArea label="Notes" name="notes" />
        <SubmitBar label="Create client" cancelHref="/crm/clients" />
      </form>
    </>
  );
}
