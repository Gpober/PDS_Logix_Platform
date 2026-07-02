import { saveJob } from '@/lib/crm/actions';
import { clientOptions, staffOptions, assetOptions, getCurrentProfile } from '@/lib/crm/data';
import { CrmHeader, Field, Select, TextArea, SubmitBar } from '@/components/crm/ui';
import { SERVICE_TYPES, JOB_STATUSES } from '@/lib/crm/types';
import { serviceLabel, statusLabel, vehicleLabel } from '@/lib/format';

export default async function NewJobPage() {
  const [clients, staff, assets, profile] = await Promise.all([
    clientOptions(),
    staffOptions(),
    assetOptions(),
    getCurrentProfile(),
  ]);
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <>
      <CrmHeader title="New job" />
      <form action={saveJob} className="max-w-lg space-y-4">
        <Select
          label="Client"
          name="client_id"
          required
          placeholder="Select a client…"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Vehicle"
          name="asset_id"
          placeholder="Select a vehicle…"
          options={assets.map((a) => ({
            value: a.id,
            label: `${vehicleLabel(a)}${a.vin ? ` · ${a.vin}` : ''}`,
          }))}
        />
        <Select
          label="Service"
          name="service_type"
          required
          defaultValue="condition_report"
          options={SERVICE_TYPES.map((s) => ({ value: s, label: serviceLabel(s) }))}
        />
        <Select
          label="Status"
          name="status"
          defaultValue="requested"
          options={JOB_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
        />
        <Select
          label="Assigned staff"
          name="assigned_staff_id"
          placeholder="Unassigned"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scheduled date" name="scheduled_date" type="date" />
          <Field label="Completed date" name="completed_date" type="date" />
        </div>
        <Field label="Location" name="location" placeholder="Lot, address, or PDS shop" />
        <TextArea label="Notes" name="notes" />

        {isOwner && (
          <fieldset className="rounded-2xl border border-line bg-white p-4">
            <legend className="px-2 text-sm text-stone">Pricing (owner/admin only)</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price ($)" name="price" type="number" />
              <Field label="Cost ($)" name="cost" type="number" />
            </div>
          </fieldset>
        )}

        <SubmitBar label="Create job" cancelHref="/crm/jobs" />
      </form>
    </>
  );
}
