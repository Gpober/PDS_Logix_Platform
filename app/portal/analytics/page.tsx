import { redirect } from 'next/navigation';
import {
  getMyTalent,
  getTalentEarningRows,
  getTalentCadenceRows,
  getFollowerSnapshots,
} from '@/lib/crm/data';
import { monthlyEarnings, monthlyCadence, dailyFollowers } from '@/lib/crm/analytics';
import { createServerSupabase } from '@/lib/supabase/server';
import { TulipMark } from '@/components/TulipMark';
import { Empty } from '@/components/crm/ui';
import { AnalyticsCharts } from '@/components/portal/AnalyticsCharts';
import { PortalNav } from '@/components/portal/PortalNav';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const talent = await getMyTalent();
  if (!talent) {
    return (
      <div className="min-h-screen bg-ivory">
        <main className="mx-auto max-w-2xl px-5 py-16">
          <Empty>Your creator profile isn’t linked yet.</Empty>
        </main>
      </div>
    );
  }

  const [earningRows, cadenceRows, snapshots] = await Promise.all([
    getTalentEarningRows(talent.id),
    getTalentCadenceRows(talent.id),
    getFollowerSnapshots(talent.id, 90),
  ]);

  const earnings = monthlyEarnings(earningRows, 12);
  const cadence = monthlyCadence(cadenceRows, 12);
  const followers = dailyFollowers(snapshots);

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-display text-xl">
            <TulipMark className="h-5 w-5 text-tulip" />
            Tulips<span className="text-tulip">.</span>{' '}
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-stone">
              Performance
            </span>
          </div>
          <PortalNav publicSlug={talent.is_public ? talent.slug : null} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Your Performance</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">
            How you’re <span className="italic text-tulip-dark">growing.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-stone">
            Earnings, audience, and posting rhythm over time — the story behind your numbers.
          </p>
        </div>

        <div className="mt-10">
          <AnalyticsCharts earnings={earnings} cadence={cadence} followers={followers} showMoney />
        </div>
      </main>
    </div>
  );
}
