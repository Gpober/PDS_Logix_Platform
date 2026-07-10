import {
  getCurrentProfile,
  talentPerformance,
  companyPerformance,
  getAllEarningRows,
  getAllCadenceRows,
  getAllFollowerSnapshots,
} from '@/lib/crm/data';
import { monthlyEarnings, monthlyCadence, dailyFollowers } from '@/lib/crm/analytics';
import { AnalyticsCharts } from '@/components/portal/AnalyticsCharts';
import { RankingsTable } from '@/components/crm/RankingsTable';

export const dynamic = 'force-dynamic';

export default async function PerformancePage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  const [creators, companies, earningRows, cadenceRows, snapshots] = await Promise.all([
    talentPerformance(),
    companyPerformance(),
    getAllEarningRows(),
    getAllCadenceRows(),
    getAllFollowerSnapshots(90),
  ]);

  const earnings = monthlyEarnings(earningRows, 12);
  const cadence = monthlyCadence(cadenceRows, 12);
  const followers = dailyFollowers(snapshots);

  return (
    <>
      <div className="mb-8 text-center">
        <p className="eyebrow">Agency</p>
        <h1 className="mt-1 font-display text-3xl">Performance</h1>
        <p className="mt-1 text-sm text-stone">
          Roster-wide earnings, audience, and posting rhythm — plus rankings across creators and
          companies.
        </p>
      </div>

      {/* Roster-wide trend charts */}
      <div className="mx-auto max-w-3xl">
        <AnalyticsCharts
          earnings={earnings}
          cadence={cadence}
          followers={followers}
          showMoney={isOwner}
        />
      </div>

      {/* Rankings */}
      <section className="mt-12">
        <div className="mb-4 text-center">
          <p className="eyebrow">Leaderboard</p>
          <h2 className="mt-1 font-display text-2xl">Rankings</h2>
          <p className="mt-1 text-sm text-stone">
            {isOwner ? 'Sort by paid, owed, total, or deal count.' : 'Sorted by deal count.'}
          </p>
        </div>
        <RankingsTable creators={creators} companies={companies} showMoney={isOwner} />
      </section>
    </>
  );
}
