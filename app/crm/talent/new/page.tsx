import { saveTalent } from '@/lib/crm/actions';
import { CrmHeader, Field, SubmitBar, TextArea, Checkbox } from '@/components/crm/ui';
import { HeadshotUpload } from '@/components/crm/HeadshotUpload';

export default function NewTalentPage() {
  return (
    <>
      <CrmHeader title="New talent" />
      <form action={saveTalent} className="max-w-lg space-y-4">
        <Field label="Name" name="name" required />
        <Field label="Handle" name="handle" placeholder="@username" />
        <Field label="Category" name="category" placeholder="Beauty, Wellness, Fashion…" />
        <div>
          <Field label="Payout rate (%)" name="payout_pct" placeholder="80" />
          <p className="mt-1 text-xs text-stone">
            The talent’s cut of each deal — used to bill their payout when you invoice. Leave blank to
            use the default.
          </p>
        </div>
        <HeadshotUpload />
        <TextArea label="Notes (internal only)" name="notes" />

        <div className="space-y-4 rounded-2xl border border-line bg-blush/30 p-5">
          <p className="text-sm font-medium text-ink">Public website</p>
          <Checkbox
            label="Show on public site"
            name="is_public"
            hint="Adds them to the /roster and gives them a profile page."
          />
          <Checkbox
            label="Feature on homepage"
            name="is_featured"
            hint="Surfaces them in the home “Talent Preview”."
          />
          <Field
            label="Profile URL slug"
            name="slug"
            placeholder="jane-doe (auto-filled from name if blank)"
          />
          <TextArea label="Bio (shown on profile page)" name="bio" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Instagram" name="instagram" placeholder="120000" />
            <Field label="TikTok" name="tiktok" placeholder="80000" />
            <Field label="YouTube" name="youtube" placeholder="15000" />
          </div>
        </div>

        <SubmitBar label="Create talent" cancelHref="/crm/talent" />
      </form>
    </>
  );
}
