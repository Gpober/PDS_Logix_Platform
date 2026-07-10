import { notFound } from 'next/navigation';
import { getCompanyRecord } from '@/lib/crm/data';
import { saveCompany } from '@/lib/crm/actions';
import { CrmHeader, Field, Select, TextArea, Checkbox, SubmitBar } from '@/components/crm/ui';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyRecord(id);
  if (!company) notFound();

  return (
    <>
      <CrmHeader title={`Edit ${company.name}`} />
      <form action={saveCompany} className="max-w-lg space-y-4">
        <input type="hidden" name="id" value={company.id} />
        <Field label="Name" name="name" defaultValue={company.name} required />
        <Select
          label="Type"
          name="type"
          defaultValue={company.type}
          options={[
            { value: 'brand', label: 'Brand' },
            { value: 'agency', label: 'Agency' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Select
          label="Status"
          name="status"
          defaultValue={company.status}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'prospect', label: 'Prospect' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <Field label="Category" name="category" defaultValue={company.category} />
        <Field label="Employee count" name="employee_count" type="number" defaultValue={company.employee_count} />
        <Field label="Website" name="website" defaultValue={company.website} />
        <TextArea label="Notes" name="notes" defaultValue={company.notes} />
        <Checkbox label="Show on public site" name="is_public" defaultChecked={company.is_public} hint="Brands with a logo appear on the marketing brand wall." />
        <SubmitBar label="Save changes" cancelHref={`/crm/companies/${id}`} />
      </form>
    </>
  );
}
