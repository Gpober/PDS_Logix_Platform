import { getAgencySettings, getCurrentProfile } from '@/lib/crm/data';
import { saveAgencySettings } from '@/lib/crm/actions';
import { getSiteImageUrl } from '@/lib/queries';
import { CrmHeader, Field, SubmitBar } from '@/components/crm/ui';
import { SiteImageUpload } from '@/components/crm/SiteImageUpload';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Site settings" />
        <p className="text-stone">Only owners and admins can change site settings.</p>
      </>
    );
  }

  const [settings, heroUrl, missionUrl, aboutUrl, whyUrl, closingUrl, contactUrl] = await Promise.all([
    getAgencySettings(),
    getSiteImageUrl('hero'),
    getSiteImageUrl('mission'),
    getSiteImageUrl('about'),
    getSiteImageUrl('why'),
    getSiteImageUrl('closing'),
    getSiteImageUrl('contact'),
  ]);

  return (
    <>
      <CrmHeader title="Settings" />
      <div className="max-w-2xl space-y-10">

        <section>
          <h2 className="font-display text-xl">Sales targets</h2>
          <p className="mt-1 text-sm text-stone">
            Powers the “vs target” and “% of goal” tiles on the Analytics dashboard.
          </p>
          {saved && (
            <p className="mt-3 rounded-xl border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 px-4 py-2 text-sm text-[#5B8C5A]">
              Targets saved ✓
            </p>
          )}
          <form action={saveAgencySettings} className="mt-4 space-y-4">
            <Field
              label="Monthly target ($)"
              name="monthly_target"
              type="number"
              defaultValue={settings.monthly_target ?? undefined}
              placeholder="e.g. 600000"
            />
            <Field
              label="Annual goal ($)"
              name="annual_goal"
              type="number"
              defaultValue={settings.annual_goal ?? undefined}
              placeholder="e.g. 1200000"
            />
            <Field
              label="Default agency commission (%)"
              name="default_agency_pct"
              type="number"
              defaultValue={settings.default_agency_pct ?? 20}
              placeholder="20"
            />
            <p className="text-xs text-stone">
              The agency’s cut when a talent has no payout % set — used to estimate agency payout.
            </p>
            <SubmitBar label="Save targets" cancelHref="/crm/settings" />
          </form>
        </section>

        <section>
          <h2 className="font-display text-xl">Homepage hero image</h2>
          <p className="mt-1 text-sm text-stone">
            The large photo behind the headline on your public homepage.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="hero"
              currentUrl={heroUrl}
              aspect="aspect-[21/9]"
              hint="A wide, landscape photo works best — the headline sits over the left side, so keep that area a little calmer. Changes go live immediately."
            />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">“Our Mission” image</h2>
          <p className="mt-1 text-sm text-stone">
            The photo beside the “Helping talent blossom” mission text near the top of the homepage.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="mission"
              currentUrl={missionUrl}
              aspect="aspect-[4/3]"
              hint="A landscape (4:3) photo looks best here — e.g. an event or community shot. Changes go live immediately."
            />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">“About Us” image</h2>
          <p className="mt-1 text-sm text-stone">
            The tall photo beside your About story.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="about"
              currentUrl={aboutUrl}
              aspect="aspect-[4/5]"
              hint="A portrait (4:5) photo looks best here — a person or event shot. Changes go live immediately."
            />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">“Why We’re Different” image</h2>
          <p className="mt-1 text-sm text-stone">
            The tall photo beside your differentiators, further down the homepage.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="why"
              currentUrl={whyUrl}
              aspect="aspect-[4/5]"
              hint="A portrait (4:5) photo looks best here. Changes go live immediately."
            />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">Closing banner image</h2>
          <p className="mt-1 text-sm text-stone">
            The full-width photo behind “Ready to blossom with us?” at the bottom of the homepage.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="closing"
              currentUrl={closingUrl}
              aspect="aspect-[21/9]"
              hint="A wide, landscape photo works best — text sits over the bottom-left. Changes go live immediately."
            />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">Contact page image</h2>
          <p className="mt-1 text-sm text-stone">
            The tall photo beside the “Contact Us” form.
          </p>
          <div className="mt-4">
            <SiteImageUpload
              imageKey="contact"
              currentUrl={contactUrl}
              aspect="aspect-[4/5]"
              hint="A portrait (4:5) photo looks best here. Changes go live immediately."
            />
          </div>
        </section>
      </div>
    </>
  );
}
