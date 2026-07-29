import { getMyStaff, myRecentEntries, recentLocations } from '@/lib/crm/data';
import { logVehicle, deleteMyEntry } from '@/lib/crm/actions';
import { SERVICE_LABELS, SERVICE_TYPES } from '@/lib/crm/types';

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

      <form action={logVehicle} className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Service</span>
          <select
            name="service_type"
            required
            defaultValue=""
            className="w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip"
          >
            <option value="" disabled>Pick a service…</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>{SERVICE_LABELS[s]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Location</span>
          <input
            name="location"
            list="portal-locations"
            required
            placeholder="e.g. Manheim Dallas"
            className="w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip"
          />
          <datalist id="portal-locations">
            {locations.map((l) => <option key={l} value={l} />)}
          </datalist>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-stone">Year</span>
            <input
              name="vehicle_year"
              type="number"
              inputMode="numeric"
              min="1900"
              max="2100"
              placeholder="2022"
              className="w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-stone">VIN (last 6)</span>
            <input
              name="vin_last6"
              maxLength={6}
              placeholder="123456"
              className="w-full rounded-xl border border-line bg-ivory px-4 py-3 uppercase text-ink outline-none focus:border-tulip"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Make / model (optional)</span>
          <input
            name="model_type"
            placeholder="e.g. Toyota Camry"
            className="w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Note (optional)</span>
          <input
            name="note"
            placeholder="Anything worth flagging"
            className="w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip"
          />
        </label>

        <button className="w-full rounded-full bg-tulip px-4 py-3 text-sm font-medium text-ivory transition-colors hover:bg-tulip-dark">
          Log it
        </button>
      </form>

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
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                  <div className="min-w-0">
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
