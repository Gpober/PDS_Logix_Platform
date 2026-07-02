import { saveContact } from '@/lib/crm/actions';
import { clientOptions } from '@/lib/crm/data';
import { CrmHeader, Field, Select, SubmitBar } from '@/components/crm/ui';

export default async function NewContactPage() {
  const clients = await clientOptions();

  return (
    <>
      <CrmHeader title="New contact" />
      <form action={saveContact} className="max-w-lg space-y-4">
        <Field label="Name" name="name" required />
        <Field label="Title" name="title" placeholder="Used Car Manager…" />
        <Select
          label="Client"
          name="client_id"
          required
          placeholder="Select a client…"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Field label="Email" name="email" type="email" />
        <Field label="Phone" name="phone" />
        <SubmitBar label="Create contact" cancelHref="/crm/contacts" />
      </form>
    </>
  );
}
