import { getCurrentProfile, getProductionGoals, productionSummary, resolveMonthlyGoal } from '@/lib/crm/data';
import { setProductionGoal, deleteProductionGoal } from '@/lib/crm/actions';
import { createServerSupabase } from '@/lib/supabase/server';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { ProductionImport } from '@/components/crm/ProductionImport';
import { ProductionDashboard } from '@/components/crm/ProductionDashboard';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');

export default async function ProductionPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Production" />
        <Empty>Production is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const todayIso = `${y}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const month = `${y}-${pad(now.getUTCMonth() + 1)}`;

  // Initial view: year-to-date across all locations.
  const summary = await productionSummary({ from: `${y}-01-01`, to: todayIso });
  const locations = (summary.locations ?? []).map((l) => String(l.location));

  // Initial monthly goal (company-wide, current month).
  const supabase = await createServerSupabase();
  const target = await resolveMonthlyGoal(null, month);
  const mStart = `${month}-01`;
  const mEnd = now.getUTCMonth() === 11 ? `${y + 1}-01-01` : `${y}-${pad(now.getUTCMonth() + 2)}-01`;
  const { count } = await supabase.from('production_entries').select('*', { count: 'exact', head: true }).gte('submitted_at', mStart).lt('submitted_at', mEnd);
  const initialGoal = { target, actual: count ?? 0, location: null as string | null, period: month };

  const goals = await getProductionGoals();
  const hasData = (summary.total_units ?? 0) > 0;

  const scopeLabel = (loc: string | null, per: string | null) =>
    `${loc ?? 'All locations'} · ${per ? new Date(`${per}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Every month'}`;

  return (
    <div className="space-y-6">
      <CrmHeader title="Production" />
      <p className="-mt-2 text-center text-sm text-stone">Units serviced — measure output, track pace to goal, and click any number to see the units behind it.</p>

      {hasData ? (
        <ProductionDashboard initialSummary={summary} initialGoal={initialGoal} locations={locations} todayIso={todayIso} />
      ) : (
        <Empty>No production loaded yet. Upload a Connecteam export below to get started.</Empty>
      )}

      {/* Goals + import — the "manage" section */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div id="goal-form" className="rounded-2xl border border-line bg-white p-5 transition-shadow">
          <p className="eyebrow">Goals</p>
          <h3 className="mt-1 font-display text-lg">Set a monthly target</h3>
          <p className="mt-1 text-sm text-stone">A target for a location (or all) and month. Leave the month blank to set the default that applies every month.</p>
          <form action={setProductionGoal} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-stone">Location</span>
                <select name="location" className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip">
                  <option value="">All locations</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-stone">Month (blank = every month)</span>
                <input type="month" name="period" className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-stone">Target units</span>
              <input type="number" name="target_units" min="0" required placeholder="e.g. 8000" className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip" />
            </label>
            <button className="rounded-full bg-tulip px-4 py-2 text-sm text-ivory hover:bg-tulip-dark">Save target</button>
          </form>

          {goals.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-line pt-3">
              {goals.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{scopeLabel(g.location, g.period)}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-stone">{g.target_units.toLocaleString('en-US')} units</span>
                    <form action={deleteProductionGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <button className="text-xs text-stone hover:text-tulip">Remove</button>
                    </form>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <ProductionImport />
      </div>
    </div>
  );
}
