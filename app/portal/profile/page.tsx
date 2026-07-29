import Link from 'next/link';
import { getMyStaff, workerPay } from '@/lib/crm/data';
import { asGroup, payDateLabel, payPeriodByIndex, payPeriodContaining, payPeriodLabel } from '@/lib/crm/pay';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const staff = (await getMyStaff())!;
  const sp = await searchParams;

  const group = asGroup(staff.payroll_group);
  const now = new Date();
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const current = payPeriodContaining(todayIso, group);
  const idx = sp.p != null && /^-?\d+$/.test(sp.p) ? Number(sp.p) : current.index;
  const period = payPeriodByIndex(idx, group);
  const pay = await workerPay(staff, period.start, period.end);

  const hasRates = (staff.hourly_rate ?? 0) > 0 || (staff.unit_rate ?? 0) > 0 || (staff.salary_per_check ?? 0) > 0;
  const isCurrent = idx === current.index;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
        {staff.title && <p className="text-sm text-stone">{staff.title}</p>}
      </div>

      {/* Contact + rates */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="text-xs uppercase tracking-wider text-stone">Your details</p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Email" value={staff.email ?? '—'} />
          <Row label="Phone" value={staff.phone ?? '—'} />
          <Row label="Hourly rate" value={staff.hourly_rate != null ? `${usd(staff.hourly_rate)}/hr` : 'Not set'} />
          <Row label="Per-unit rate" value={staff.unit_rate != null ? `${usd(staff.unit_rate)}/unit` : 'Not set'} />
          {staff.salary_per_check != null && <Row label="Salary" value={`${usd(staff.salary_per_check)}/check`} />}
          <Row label="Pay group" value={`Group ${group} · bi-weekly`} />
        </dl>
        {!hasRates && (
          <p className="mt-3 rounded-xl bg-ivory p-3 text-xs text-stone">
            Your pay rate hasn’t been set yet — ask your manager to add it and your pay will show up here.
          </p>
        )}
      </div>

      {/* Pay for the period */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-stone">Pay this period</p>
          <div className="flex items-center gap-1 text-xs">
            <Link href={`/portal/profile?p=${idx - 1}`} aria-label="Previous period" className="rounded-full border border-line px-2 py-1 text-stone hover:border-ink">‹</Link>
            {!isCurrent && <Link href="/portal/profile" className="rounded-full border border-line px-2 py-1 text-tulip hover:border-tulip">Now</Link>}
            <Link
              href={`/portal/profile?p=${idx + 1}`}
              aria-disabled={isCurrent}
              className={'rounded-full border border-line px-2 py-1 ' + (isCurrent ? 'pointer-events-none opacity-30' : 'text-stone hover:border-ink')}
            >›</Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-ink">{payPeriodLabel(period)}</p>
        <p className="text-xs text-stone">Paid {payDateLabel(period)}</p>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-4xl tabular-nums text-ink">{usd(pay.total)}</span>
          {isCurrent && <span className="text-xs text-stone">so far</span>}
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          <Row
            label={`Hours · ${pay.hours}${staff.hourly_rate != null ? ` × ${usd(pay.hourlyRate)}` : ''}`}
            value={usd(pay.hourlyPay)}
          />
          <Row
            label={`Units · ${pay.units.toLocaleString('en-US')}${staff.unit_rate != null ? ` × ${usd(pay.unitRate)}` : ''}`}
            value={usd(pay.unitPay)}
          />
          {pay.salaryPay > 0 && <Row label="Salary (per check)" value={usd(pay.salaryPay)} />}
          <div className="flex items-center justify-between border-t border-line pt-2 font-medium text-ink">
            <span>Total</span>
            <span className="tabular-nums">{usd(pay.total)}</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-stone">
          Hourly base plus per-unit, over your bi-weekly pay period. An estimate from logged hours and units — your paycheck is final.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-stone">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}
