import { saveCompany } from '@/lib/crm/actions';
import { CrmHeader, Field, Select, TextArea, Checkbox, SubmitBar } from '@/components/crm/ui';

export default function NewCompanyPage() {
  return (
    <>
      <CrmHeader title="New company" />
      <form action={saveCompany} className="max-w-lg space-y-4">
        <Field label="Name" name="name" required />
        <Select
          label="Type"
          name="type"
          defaultValue="brand"
          options={[
            { value: 'brand', label: 'Brand' },
            { value: 'agency', label: 'Agency' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Select
          label="Status"
          name="status"
          defaultValue="active"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'prospect', label: 'Prospect' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <Field label="Category" name="category" placeholder="Beauty, Apparel…" />
        <Field label="Employee count" name="employee_count" type="number" />
        <Field label="Website" name="website" placeholder="https://…" />
        <TextArea label="Notes" name="notes" />
        <Checkbox label="Show on public site" name="is_public" hint="Brands with a logo appear on the marketing brand wall." />
        <SubmitBar label="Create company" cancelHref="/crm/companies" />
      </form>
    </>
  );
}
