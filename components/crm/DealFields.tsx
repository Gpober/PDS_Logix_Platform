import { DEAL_STATUSES, type DealWithBudget } from '@/lib/crm/types';
import { Field, Select, SubmitBar, TextArea } from './ui';

// Shared field set for create + edit. The budget input renders ONLY when the
// session is owner/admin; for everyone else it is absent from the form (and the
// DB would reject the write regardless).
export function DealFields({
  companies,
  talent,
  deal,
  canEditBudget,
  submitLabel,
}: {
  companies: { id: string; name: string }[];
  talent: { id: string; name: string }[];
  deal?: DealWithBudget;
  canEditBudget: boolean;
  submitLabel: string;
}) {
  return (
    <div className="max-w-lg space-y-4">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      <Select
        label="Company"
        name="company_id"
        required
        defaultValue={deal?.company_id}
        placeholder="Select a company…"
        options={companies.map((c) => ({ value: c.id, label: c.name }))}
      />
      <Select
        label="Talent"
        name="talent_id"
        required
        defaultValue={deal?.talent_id}
        placeholder="Select talent…"
        options={talent.map((t) => ({ value: t.id, label: t.name }))}
      />
      <Field label="Booking date" name="booking_date" type="date" defaultValue={deal?.booking_date} />
      <Select
        label="Status"
        name="status"
        defaultValue={deal?.status ?? 'pitched'}
        options={DEAL_STATUSES.map((s) => ({ value: s, label: s }))}
      />
      <Select
        label="Channel"
        name="channel"
        defaultValue={deal?.channel}
        placeholder="Inbound / Outbound"
        options={[
          { value: 'inbound', label: 'Inbound' },
          { value: 'outbound', label: 'Outbound' },
        ]}
      />
      <Field
        label="Source"
        name="source"
        defaultValue={deal?.source}
        placeholder="LTK, Mavely, Brand Direct…"
      />
      <Field label="Live URL" name="live_url" defaultValue={deal?.live_url} placeholder="https://…" />
      <TextArea label="Notes" name="notes" defaultValue={deal?.notes} />

      {canEditBudget && (
        <Field
          label="Budget (owner/admin only)"
          name="budget"
          type="number"
          defaultValue={deal?.budget ?? undefined}
          placeholder="e.g. 15000"
        />
      )}

      <SubmitBar label={submitLabel} cancelHref="/crm/deals" />
    </div>
  );
}
