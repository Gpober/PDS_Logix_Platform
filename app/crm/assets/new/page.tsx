import { saveAsset } from '@/lib/crm/actions';
import { clientOptions } from '@/lib/crm/data';
import { CrmHeader, Field, Select, TextArea, SubmitBar } from '@/components/crm/ui';

export default async function NewAssetPage() {
  const clients = await clientOptions();

  return (
    <>
      <CrmHeader title="New vehicle" />
      <form action={saveAsset} className="max-w-lg space-y-4">
        <Select
          label="Client"
          name="client_id"
          placeholder="Select a client…"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Field label="VIN" name="vin" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Year" name="year" type="number" />
          <Field label="Make" name="make" />
          <Field label="Model" name="model" />
          <Field label="Trim" name="trim" />
          <Field label="Color" name="color" />
          <Field label="Mileage" name="mileage" type="number" />
        </div>
        <Field label="License plate" name="license_plate" />
        <TextArea label="Notes" name="notes" />
        <SubmitBar label="Create vehicle" cancelHref="/crm/assets" />
      </form>
    </>
  );
}
