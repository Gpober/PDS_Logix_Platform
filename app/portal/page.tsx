import Link from 'next/link';
import {
  getMyStaff,
  myHoursSince,
  myOpenTimeEntry,
  workerMonthPace,
  workerProduction,
} from '@/lib/crm/data';
import { ClockWidget } from '@/components/portal/ClockWidget';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const hoursFromMs = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

export default async function PortalHome() {
  // The layout already guaranteed a linked staff row; this is never null here.
  const staff = (await getMyStaff())!;

  const now = new Date();
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const month = todayIso.slice(0, 7);

  const [openEntry, today, hoursMs, pace] = await Promise.all([
    myOpenTimeEntry(staff.id),
    workerProduction(staff.name, todayIso, todayIso),
    myHoursSince(staff.id, todayIso),
    workerMonthPace(staff.name, month, todayIso),
  ]);

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const firstName = staff.name.split(' ')[0];
  const pct = pace.target > 0 ? Math.min(100, Math.round((pace.done / pace.target) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Hey {firstName} 👋</h1>
        <p className="text-sm text-stone">Here’s where you stand today.</p>
      </div>

      <ClockWidget openSince={openEntry?.clock_in ?? null} entryId={openEntry?.id ?? null} />

      {/* Today at a glance */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Units today" value={today.total_units.toLocaleString('en-US')} />
        <Stat label="Hours today" value={openEntry ? `${hoursFromMs(hoursMs)}+` : String(hoursFromMs(hoursMs))} hint={openEntry ? 'on the clock now' : undefined} />
      </div>

      {/* Goal pace */}
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
              <span className="text-sm text-stone">/ {pace.target.toLocaleString('en-US')} units</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ivory">
              <div
                className={'h-full rounded-full ' + (pace.onTrack ? 'bg-[#4ADE80]' : 'bg-tulip')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-stone">
              {pace.remaining > 0 ? (
                <>
                  <span className="text-ink">{pace.remaining.toLocaleString('en-US')}</span> to go ·{' '}
                  {pace.daysLeft > 0 ? (
                    <>
                      <span className="text-ink">{pace.perDayNeeded}/day</span> for the last {pace.daysLeft} day
                      {pace.daysLeft === 1 ? '' : 's'}
                    </>
                  ) : (
                    'last day of the month'
                  )}
                </>
              ) : (
                <span className="text-[#3E9B4F]">Goal hit — nice work. 🎯</span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone">Projected month-end: {pace.projected.toLocaleString('en-US')} at your current pace.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-stone">
            No goal set yet.{' '}
            <Link href="/portal/performance" className="text-tulip hover:underline">
              Set one on your Stats page
            </Link>{' '}
            or ask Zordon.
          </p>
        )}
      </div>

      <Link
        href="/portal/log"
        className="flex items-center justify-center gap-2 rounded-2xl bg-tulip px-4 py-4 text-sm font-medium text-ivory transition-colors hover:bg-tulip-dark"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M12 5v14M5 12h14" /></svg>
        Log a vehicle
      </Link>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-stone">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</p>
      {hint && <p className="text-[11px] text-stone">{hint}</p>}
    </div>
  );
}
