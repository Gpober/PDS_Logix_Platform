import { getCurrentProfile } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { ProductionImport } from '@/components/crm/ProductionImport';

export const dynamic = 'force-dynamic';

type Named = { units: number } & Record<string, string | number>;
interface Summary {
  total_units: number;
  date_from: string | null;
  date_to: string | null;
  locations: Named[];
  by_service: Named[];
  by_staff: Named[];
  by_month: Named[];
}

const nf = (n: number) => n.toLocaleString('en-US');

function Bars({ title, rows, keyName, limit = 12 }: { title: string; rows: Named[]; keyName: string; limit?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-3 font-display text-lg">{title}</h3>
      <div className="space-y-2">
        {rows.slice(0, limit).map((r, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-ink">{String(r[keyName] ?? '—')}</span>
              <span className="shrink-0 tabular-nums text-stone">{nf(r.units)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-blush">
              <div className="h-full rounded-full bg-tulip" style={{ width: `${(r.units / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-stone">No data yet.</p>}
      </div>
    </div>
  );
}

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

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_production_summary', { p_location: null, p_from: null, p_to: null });
  const s = (data ?? {}) as Summary;
  const total = s.total_units ?? 0;

  return (
    <div className="space-y-6">
      <CrmHeader title="Production" />
      <p className="-mt-2 text-center text-sm text-stone">Units serviced — condition reports &amp; photo sets, by location, person, and month.</p>

      <ProductionImport />

      {total === 0 ? (
        <Empty>No production loaded yet. Upload a Connecteam export above to get started.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-white p-5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">Total units</div>
              <div className="mt-1 font-display text-2xl text-ink">{nf(total)}</div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">Locations</div>
              <div className="mt-1 font-display text-2xl text-ink">{(s.locations ?? []).length}</div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">People</div>
              <div className="mt-1 font-display text-2xl text-ink">{(s.by_staff ?? []).length}</div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">Range</div>
              <div className="mt-1 text-sm text-ink">{s.date_from ?? '—'}<br />→ {s.date_to ?? '—'}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="By location" rows={s.locations ?? []} keyName="location" />
            <Bars title="By service type" rows={s.by_service ?? []} keyName="service_type" />
            <Bars title="Top producers" rows={s.by_staff ?? []} keyName="staff" />
            <Bars title="By month" rows={s.by_month ?? []} keyName="month" limit={24} />
          </div>
        </>
      )}
    </div>
  );
}
