import { Field, TextArea, Select, Checkbox } from './ui';
import {
  SERVICE_TYPES,
  JOB_STATUSES,
  SERVICE_LABELS,
  STATUS_LABELS,
  type Asset,
  type Client,
  type Job,
  type JobPricing,
  type Staff,
} from '@/lib/crm/types';

// Reusable field groups. These are plain server components (no hooks), so each
// page can drop them inside a <form action={serverAction}>.

export function ClientFields({ client }: { client?: Client }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" defaultValue={client?.name} required />
      <Field label="Category" name="category" defaultValue={client?.category} placeholder="Dealer, fleet, insurer…" />
      <Field label="Phone" name="phone" defaultValue={client?.phone} />
      <Field label="Billing email" name="billing_email" type="email" defaultValue={client?.billing_email} />
      <Field label="Website" name="website" defaultValue={client?.website} />
      <Field label="Address" name="address" defaultValue={client?.address} />
      <div className="sm:col-span-2">
        <TextArea label="Notes" name="notes" defaultValue={client?.notes} />
      </div>
      <div className="sm:col-span-2">
        <Checkbox
          label="Public"
          name="is_public"
          defaultChecked={client?.is_public}
          hint="Show this client on any public-facing surface."
        />
      </div>
    </div>
  );
}

export function StaffFields({ staff }: { staff?: Staff }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" defaultValue={staff?.name} required />
      <Field label="Title" name="title" defaultValue={staff?.title} placeholder="Technician, inspector…" />
      <Field label="Email" name="email" type="email" defaultValue={staff?.email} />
      <Field label="Phone" name="phone" defaultValue={staff?.phone} />
      <div className="sm:col-span-2">
        <TextArea label="Notes" name="notes" defaultValue={staff?.notes} />
      </div>
      <div className="sm:col-span-2">
        <Checkbox label="Active" name="is_active" defaultChecked={staff?.is_active ?? true} />
      </div>
    </div>
  );
}

export function AssetFields({
  asset,
  clientOptions,
}: {
  asset?: Asset;
  clientOptions: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label="Client" name="client_id" defaultValue={asset?.client_id} options={clientOptions} placeholder="Unassigned" />
      <Field label="Asset type" name="asset_type" defaultValue={asset?.asset_type ?? 'vehicle'} />
      <Field label="Year" name="year" type="number" defaultValue={asset?.year} />
      <Field label="Make" name="make" defaultValue={asset?.make} />
      <Field label="Model" name="model" defaultValue={asset?.model} />
      <Field label="Trim" name="trim" defaultValue={asset?.trim} />
      <Field label="Color" name="color" defaultValue={asset?.color} />
      <Field label="Mileage" name="mileage" type="number" defaultValue={asset?.mileage} />
      <Field label="VIN" name="vin" defaultValue={asset?.vin} />
      <Field label="License plate" name="license_plate" defaultValue={asset?.license_plate} />
      <div className="sm:col-span-2">
        <TextArea label="Notes" name="notes" defaultValue={asset?.notes} />
      </div>
    </div>
  );
}

export function JobFields({
  job,
  pricing,
  clientOptions,
  assetOptions,
  staffOptions,
}: {
  job?: Job;
  pricing?: JobPricing | null;
  clientOptions: { value: string; label: string }[];
  assetOptions: { value: string; label: string }[];
  staffOptions: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label="Client" name="client_id" defaultValue={job?.client_id} options={clientOptions} required placeholder="Select client" />
      <Select label="Asset" name="asset_id" defaultValue={job?.asset_id} options={assetOptions} placeholder="No asset" />
      <Select label="Assigned staff" name="assigned_staff_id" defaultValue={job?.assigned_staff_id} options={staffOptions} placeholder="Unassigned" />
      <Select
        label="Service type"
        name="service_type"
        defaultValue={job?.service_type ?? 'condition_report'}
        options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))}
        required
      />
      <Select
        label="Status"
        name="status"
        defaultValue={job?.status ?? 'requested'}
        options={JOB_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        required
      />
      <Field label="Location" name="location" defaultValue={job?.location} />
      <Field label="Scheduled date" name="scheduled_date" type="date" defaultValue={job?.scheduled_date} />
      <Field label="Completed date" name="completed_date" type="date" defaultValue={job?.completed_date} />
      <Field label="Price ($)" name="price" type="number" defaultValue={pricing?.price} />
      <Field label="Cost ($)" name="cost" type="number" defaultValue={pricing?.cost} />
      <div className="sm:col-span-2">
        <TextArea label="Notes" name="notes" defaultValue={job?.notes} />
      </div>
    </div>
  );
}
