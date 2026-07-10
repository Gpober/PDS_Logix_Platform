import { notFound } from 'next/navigation';
import { getTalent, getInstagramStats } from '@/lib/crm/data';
import { saveTalent, pullInstagramStats } from '@/lib/crm/actions';
import { CrmHeader, Field, SubmitBar, TextArea, Checkbox } from '@/components/crm/ui';
import { HeadshotUpload } from '@/components/crm/HeadshotUpload';

const IG_MSG: Record<string, { text: string; ok?: boolean }> = {
  ok: { text: 'Instagram stats pulled ✓', ok: true },
  no_handle: { text: 'Enter the Instagram handle first.' },
  no_token: { text: 'No connected Instagram to run lookups. Connect one, or set IG_DISCOVERY_TOKEN.' },
  not_found: { text: 'Couldn’t read that Instagram — it must be a public Business/Creator account.' },
  save_failed: { text: 'Pulled, but couldn’t save. (Is migration 0032 applied?)' },
};

export default async function EditTalentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ig?: string }>;
}) {
  const { id } = await params;
  const { ig } = await searchParams;
  const [talent, igStats] = await Promise.all([getTalent(id), getInstagramStats(id)]);
  if (!talent) notFound();

  const stats = talent.audience_stats ?? {};
  const igMsg = ig ? IG_MSG[ig] : null;

  return (
    <>
      <CrmHeader title={`Edit ${talent.name}`} />
      <form action={saveTalent} className="max-w-lg space-y-4">
        <input type="hidden" name="id" value={talent.id} />
        <Field label="Name" name="name" defaultValue={talent.name} required />
        <Field label="Handle" name="handle" defaultValue={talent.handle} />
        <Field label="Category" name="category" defaultValue={talent.category} />
        <div>
          <Field
            label="Payout rate (%)"
            name="payout_pct"
            defaultValue={talent.payout_pct != null ? String(talent.payout_pct) : undefined}
            placeholder="80"
          />
          <p className="mt-1 text-xs text-stone">
            The talent’s cut of each deal — used to bill their payout when you invoice. Leave blank to
            use the default.
          </p>
        </div>
        <HeadshotUpload defaultUrl={talent.headshot_url} />
        <TextArea label="Notes (internal only)" name="notes" defaultValue={talent.notes} />

        <div className="space-y-4 rounded-2xl border border-line bg-blush/30 p-5">
          <p className="text-sm font-medium text-ink">Public website</p>
          <Checkbox
            label="Show on public site"
            name="is_public"
            defaultChecked={talent.is_public}
            hint="Adds them to the /roster and gives them a profile page."
          />
          <Checkbox
            label="Feature on homepage"
            name="is_featured"
            defaultChecked={talent.is_featured}
            hint="Surfaces them in the home “Talent Preview”."
          />
          <Field
            label="Profile URL slug"
            name="slug"
            defaultValue={talent.slug}
            placeholder="jane-doe (auto-filled from name if blank)"
          />
          <TextArea label="Bio (shown on profile page)" name="bio" defaultValue={talent.bio} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Instagram" name="instagram" defaultValue={stats.instagram} />
            <Field label="TikTok" name="tiktok" defaultValue={stats.tiktok} />
            <Field label="YouTube" name="youtube" defaultValue={stats.youtube} />
          </div>
        </div>

        <SubmitBar label="Save changes" cancelHref={`/crm/talent/${id}`} />
      </form>

      {/* Instagram auto-pull (Business Discovery) */}
      <div className="mt-8 max-w-lg rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg">Pull from Instagram</h2>
        <p className="mt-1 text-sm text-stone">
          Auto-fill followers, engagement, and recent posts from a public Business/Creator account —
          no login from the creator needed. Audience demographics fill in once they connect their own
          Instagram.
        </p>
        {igMsg && (
          <p
            className={
              'mt-4 rounded-xl px-4 py-2.5 text-sm ' +
              (igMsg.ok
                ? 'border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                : 'border border-tulip/40 bg-blush/60 text-tulip-dark')
            }
          >
            {igMsg.text}
          </p>
        )}
        <form action={pullInstagramStats} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="talent_id" value={talent.id} />
          <input type="hidden" name="return_to" value={`/crm/talent/${id}/edit`} />
          <label className="flex-1">
            <span className="mb-1.5 block text-sm text-stone">Instagram handle</span>
            <input
              name="ig_handle"
              defaultValue={igStats?.username ?? ''}
              placeholder="abrahamcorella_"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </label>
          <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip">
            Pull stats
          </button>
        </form>
        {igStats?.followers != null && (
          <p className="mt-3 text-xs text-stone">
            Last pulled: {igStats.followers.toLocaleString()} followers
            {igStats.engagement_rate != null ? ` · ${igStats.engagement_rate}% engagement` : ''}
            {igStats.has_insights ? ' · demographics ✓' : ' · demographics pending IG connect'}
          </p>
        )}
      </div>
    </>
  );
}
