import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyTalent } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { updateMyProfile } from '@/lib/crm/actions';
import { TulipMark } from '@/components/TulipMark';
import { Empty } from '@/components/crm/ui';
import { HeadshotUpload } from '@/components/crm/HeadshotUpload';
import { PortalNav } from '@/components/portal/PortalNav';

export const dynamic = 'force-dynamic';

const fieldCls =
  'w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-ink';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const talent = await getMyTalent();

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-display text-xl">
            <TulipMark className="h-5 w-5 text-tulip" />
            Tulips<span className="text-tulip">.</span>{' '}
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-stone">
              Profile
            </span>
          </div>
          <PortalNav publicSlug={talent?.is_public ? talent.slug : null} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
        {!talent ? (
          <Empty>Your creator profile isn’t linked yet. Ask your Tulips manager to connect it.</Empty>
        ) : (
          <>
            <div className="text-center">
              <p className="eyebrow">Your Profile</p>
              <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">
                How you <span className="italic text-tulip-dark">appear.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-stone">
                Keep your photo and story current — this is what brands and the public see.
              </p>
            </div>

            {saved === '1' && (
              <p className="mx-auto mt-6 max-w-md rounded-xl border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 px-4 py-2.5 text-center text-sm text-[#5B8C5A]">
                Profile saved ✓
              </p>
            )}
            {saved === 'error' && (
              <p className="mx-auto mt-6 max-w-md rounded-xl border border-tulip/40 bg-blush/60 px-4 py-2.5 text-center text-sm text-tulip-dark">
                Couldn’t save — please try again. (Is migration 0027 applied?)
              </p>
            )}

            <form
              action={updateMyProfile}
              className="mt-10 space-y-6 rounded-2xl border border-line bg-white p-6 sm:p-8"
            >
              <HeadshotUpload defaultUrl={talent.headshot_url} />

              <label className="block">
                <span className="mb-1.5 block text-sm text-stone">Name</span>
                <input name="name" defaultValue={talent.name} className={fieldCls} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Category / niche</span>
                  <input
                    name="category"
                    defaultValue={talent.category ?? ''}
                    placeholder="Beauty, Wellness, Fashion…"
                    className={fieldCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-stone">Location</span>
                  <input
                    name="location"
                    defaultValue={talent.location ?? ''}
                    placeholder="Los Angeles, CA"
                    className={fieldCls}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm text-stone">Bio</span>
                <textarea
                  name="bio"
                  rows={5}
                  defaultValue={talent.bio ?? ''}
                  placeholder="A few sentences about you, your audience, and the brands you love…"
                  className={fieldCls}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button className="rounded-full bg-ink px-6 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip">
                  Save profile
                </button>
                {talent.is_public && talent.slug && (
                  <Link
                    href={`/talent/${talent.slug}`}
                    className="text-sm text-stone underline-offset-2 hover:text-ink hover:underline"
                  >
                    View public profile →
                  </Link>
                )}
              </div>
            </form>

            <p className="mx-auto mt-5 max-w-md text-center text-xs text-stone">
              Your agency controls whether you’re listed publicly and your profile link. To change
              those, reach out to your Tulips manager.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
