import {
  getMyStaff,
  myHoursSince,
  workerMonthPace,
  workerProduction,
} from '@/lib/crm/data';
import { setMyGoal } from '@/lib/crm/actions';
import { SERVICE_LABELS } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const hoursFromMs = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
const serviceLabel = (s: string) => (SERVICE_LABELS as Record<string, string>)[s] || s;

export default async function PerformancePage() {
  const staff = (await getMyStaff())!;

  const now = new Date();
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const month = todayIso.slice(0, 7);
  const monthStart = `${month}-01`;

  const [allTime, thisMonth, hoursMs, pace] = await Promise.all([
    workerProduction(staff.name),
    workerProduction(staff.name, monthStart, todayIso),
    myHoursSince(staff.id, monthStart),
    workerMonthPace(staff.name, month, todayIso),
  ]);

  const hours = hoursFromMs(hoursMs);
  const perHour = hours > 0 ? Math.round((thisMonth.total_units / hours) * 10) / 10 : null;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pct = pace.target > 0 ? Math.min(100, Math.round((pace.done / pace.target) * 100)) : 0;

  // Last 6 months of the trend, oldest→newest.
  const trend = allTime.by_month.slice(-6);
  const trendMax = Math.max(1, ...trend.map((t) => t.units));
  const svcMax = Math.max(1, ...allTime.by_service.map((s) => s.units));
  const locMax = Math.max(1, ...allTime.by_location.map((l) => l.units));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Your stats</h1>
        <p className="text-sm text-stone">Measure your output and chase your goal.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={`${monthLabel.split(' ')[0]} units`} value={thisMonth.total_units.toLocaleString('en-US')} />
        <Kpi label="Hours" value={String(hours)} />
        <Kpi label="Units / hr" value={perHour != null ? String(perHour) : '—'} />
        <Kpi label="All-time" value={allTime.total_units.toLocaleString('en-US')} />
      </div>

      {/* Goal + pace */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-stone">{monthLabel} goal</p>
          {pace.target > 0 && (
            <span className={'text-xs font-medium ' + (pace.onTrack ? 'text-[#3E9B4F]' : 'text-tulip-dark')}>
              {pace.onTrack ? 'On track' : 'Behind pace'}
            </span>
          )}
        </div>
        {pace.target > 0 ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl tabular-nums text-ink">{pace.done.toLocaleString('en-US')}</span>
              <span className="text-sm text-stone">/ {pace.target.toLocaleString('en-US')} units · {pct}%</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ivory">
              <div className={'h-full rounded-full ' + (pace.onTrack ? 'bg-[#4ADE80]' : 'bg-tulip')} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-sm text-stone">
              {pace.remaining > 0
                ? `${pace.remaining.toLocaleString('en-US')} to go · ${pace.daysLeft > 0 ? `${pace.perDayNeeded}/day for ${pace.daysLeft} more day${pace.daysLeft === 1 ? '' : 's'}` : 'last day'} · projected ${pace.projected.toLocaleString('en-US')}`
                : 'Goal hit — great month. 🎯'}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-stone">No goal set yet. Set one below to start tracking your pace.</p>
        )}

        <form action={setMyGoal} className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">Monthly target (units)</span>
            <input type="number" name="target_units" min="0" required placeholder="e.g. 500" className="w-full rounded-xl border border-line bg-ivory px-3 py-2.5 text-ink outline-none focus:border-tulip" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">Month (blank = every month)</span>
            <input type="month" name="period" defaultValue={month} className="w-full rounded-xl border border-line bg-ivory px-3 py-2.5 text-ink outline-none focus:border-tulip" />
          </label>
          <button className="rounded-full bg-tulip px-5 py-2.5 text-sm text-ivory hover:bg-tulip-dark">Save</button>
        </form>
      </div>

      {allTime.total_units === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-stone">
          No production on record yet. Once you log vehicles, your breakdowns show up here.
        </p>
      ) : (
        <>
          <Section title="By service">
            {allTime.by_service.map((s) => (
              <Bar key={s.service_type} label={serviceLabel(s.service_type)} value={s.units} max={svcMax} />
            ))}
          </Section>

          <Section title="By location">
            {allTime.by_location.slice(0, 8).map((l) => (
              <Bar key={l.location} label={l.location} value={l.units} max={locMax} />
            ))}
          </Section>

          <Section title="Monthly trend">
            {trend.map((t) => (
              <Bar
                key={t.month}
                label={new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                value={t.units}
                max={trendMax}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-[11px] uppercase tracking-wider text-stone">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="mb-3 text-xs uppercase tracking-wider text-stone">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-sm text-ink" title={label}>{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-ivory">
        <div className="flex h-full items-center justify-end rounded-md bg-tulip px-2" style={{ width: `${w}%` }}>
          <span className="text-[11px] font-medium tabular-nums text-ivory">{value.toLocaleString('en-US')}</span>
        </div>
      </div>
    </div>
  );
}
