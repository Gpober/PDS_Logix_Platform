import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentProfile, getStaff, payDetail, workerPay } from '@/lib/crm/data';
import { asGroup, payDateLabel, payPeriodByIndex, payPeriodContaining, payPeriodLabel } from '@/lib/crm/pay';
import { SERVICE_LABELS } from '@/lib/crm/types';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const serviceLabel = (s: string | null) => (s && (SERVICE_LABELS as Record<string, string>)[s]) || s || 'Unit';
const dt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const tm = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default async function PayDetailPage({ params, searchParams }: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ g?: string; p?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return (<><CrmHeader title="Pay" /><Empty>Payroll is owner/admin-only.</Empty></>);
  }

  const { staffId } = await params;
  const sp = await searchParams;
  const staff = await getStaff(staffId);
  if (!staff) notFound();

  const group = asGroup(sp.g ?? staff.payroll_group);
  const now = new Date();
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const current = payPeriodContaining(todayIso, group);
  const idx = sp.p != null && /^-?\d+$/.test(sp.p) ? Number(sp.p) : current.index;
  const period = payPeriodByIndex(idx, group);

  const [detail, pay] = await Promise.all([
    payDetail(staffId, period.start, period.end),
    workerPay(staff, period.start, period.end),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href={`/crm/pay?g=${group}&p=${idx}`} className="text-sm text-stone hover:text-ink">‹ Back to pay</Link>
      </div>

      <div className="mb-1 text-center">
        <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
        <p className="text-sm text-stone">
          {[staff.title, `Group ${group}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="mb-6 text-center text-xs text-stone">{payPeriodLabel(period)} · paid {payDateLabel(period)}</p>

      {/* Pay summary */}
      <div className="mb-6 rounded-2xl border border-line bg-white p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-stone">Period pay</span>
          <span className="font-display text-3xl tabular-nums text-ink">{usd(pay.total)}</span>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <Row label={`${pay.hours} paid hrs${staff.hourly_rate != null ? ` × ${usd(pay.hourlyRate)}` : ' · no hourly rate'}`} value={usd(pay.hourlyPay)} />
          <Row label={`${pay.units.toLocaleString('en-US')} units${staff.unit_rate != null ? ` × ${usd(pay.unitRate)}` : ' · no unit rate'}`} value={usd(pay.unitPay)} />
        </div>
      </div>

      {/* Shifts */}
      <h2 className="mb-2 font-display text-lg">Shifts ({detail.shifts.length})</h2>
      {detail.shifts.length === 0 ? (
        <Empty>No completed shifts in this period.</Empty>
      ) : (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">In</th>
                <th className="px-4 py-3 font-medium">Out</th>
                <th className="px-4 py-3 font-medium">Raw</th>
                <th className="px-4 py-3 font-medium">Break</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Loc</th>
              </tr>
            </thead>
            <tbody>
              {detail.shifts.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2.5">{dt(s.clock_in)}</td>
                  <td className="px-4 py-2.5">{tm(s.clock_in)}</td>
                  <td className="px-4 py-2.5">{tm(s.clock_out)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-stone">{s.rawHours}</td>
                  <td className="px-4 py-2.5 tabular-nums text-stone">{s.breakHours ? `−${s.breakHours}` : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium text-ink">{s.paidHours}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {s.clock_in_lat != null ? (
                      <a href={`https://www.google.com/maps?q=${s.clock_in_lat},${s.clock_in_lng}`} target="_blank" rel="noreferrer" className="text-tulip hover:underline">📍</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-blush/20 font-medium">
                <td className="px-4 py-2.5" colSpan={5}>Total paid hours</td>
                <td className="px-4 py-2.5 tabular-nums text-ink" colSpan={2}>{detail.paidHours}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="-mt-4 mb-6 text-xs text-stone">A 1-hour unpaid meal break is deducted from any shift of 8 hours or more.</p>

      {/* Units */}
      <h2 className="mb-2 font-display text-lg">Units logged ({detail.entries.length})</h2>
      {detail.entries.length === 0 ? (
        <Empty>No units logged in this period.</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {detail.entries.map((e) => {
            const vehicle = [e.vehicle_year, e.model_type].filter(Boolean).join(' ');
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                {e.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-ivory text-stone text-[10px]">no photo</span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{serviceLabel(e.service_type)} <span className="text-stone">· {e.location}</span></p>
                  <p className="truncate text-xs text-stone">{[e.submitted_at ? dt(e.submitted_at) : null, vehicle || null, e.vin_last6 ? `…${e.vin_last6}` : null].filter(Boolean).join(' · ')}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
