import { getMyStaff, myRecentEntries, recentLocations } from '@/lib/crm/data';
import { deleteMyEntry } from '@/lib/crm/actions';
import { SERVICE_LABELS } from '@/lib/crm/types';
import { LogVehicleForm } from '@/components/portal/LogVehicleForm';

export const dynamic = 'force-dynamic';

const serviceLabel = (s: string | null) =>
  (s && (SERVICE_LABELS as Record<string, string>)[s]) || s || 'Unit';

export default async function LogPage() {
  const staff = (await getMyStaff())!;
  const [locations, recent] = await Promise.all([recentLocations(12), myRecentEntries(staff.id, 20)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Log a vehicle</h1>
        <p className="text-sm text-stone">Tap in what you serviced — it counts toward your numbers right away.</p>
      </div>

      <LogVehicleForm locations={locations} />

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-stone">Recent</p>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-stone">
            Nothing logged yet — your entries will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((e) => {
              const vehicle = [e.vehicle_year, e.model_type].filter(Boolean).join(' ');
              const when = e.submitted_at
                ? new Date(e.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-3">
                  {e.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-ivory text-stone">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" /></svg>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {serviceLabel(e.service_type)} <span className="text-stone">· {e.location}</span>
                    </p>
                    <p className="truncate text-xs text-stone">
                      {[vehicle || null, e.vin_last6 ? `VIN …${e.vin_last6}` : null, when].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {e.source === 'platform' ? (
                    <form action={deleteMyEntry.bind(null, e.id)}>
                      <button className="shrink-0 text-xs text-stone hover:text-tulip-dark" aria-label="Delete entry">
                        Remove
                      </button>
                    </form>
                  ) : (
                    <span className="shrink-0 text-[11px] text-stone">imported</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
