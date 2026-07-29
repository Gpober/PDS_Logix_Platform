import Link from 'next/link';
import { getCurrentProfile, payRoster } from '@/lib/crm/data';
import { asGroup, payDateLabel, payPeriodByIndex, payPeriodContaining, payPeriodLabel, type PayGroup } from '@/lib/crm/pay';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';
import { PayExportButton } from '@/components/crm/PayExportButton';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default async function PayPage({ searchParams }: { searchParams: Promise<{ p?: string; g?: string }> }) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Pay" />
        <Empty>Payroll is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  const sp = await searchParams;
  const group: PayGroup = asGroup(sp.g);
  const now = new Date();
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const current = payPeriodContaining(todayIso, group);
  const idx = sp.p != null && /^-?\d+$/.test(sp.p) ? Number(sp.p) : current.index;
  const period = payPeriodByIndex(idx, group);
  const isCurrent = idx === current.index;

  const rows = await payRoster(period.start, period.end, group);
  const active = rows.filter((r) => r.hours > 0 || r.units > 0 || r.total > 0);
  const totals = active.reduce(
    (a, r) => ({ hours: a.hours + r.hours, units: a.units + r.units, hourlyPay: a.hourlyPay + r.hourlyPay, unitPay: a.unitPay + r.unitPay, total: a.total + r.total }),
    { hours: 0, units: 0, hourlyPay: 0, unitPay: 0, total: 0 },
  );

  const groupTab = (g: PayGroup) => (
    <Link
      href={`/crm/pay?g=${g}`}
      className={'rounded-full px-4 py-1.5 text-sm font-medium transition-colors ' + (group === g ? 'bg-tulip text-ivory' : 'bg-white text-stone hover:text-ink border border-line')}
    >
      Group {g}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Pay" />

      {/* Group tabs */}
      <div className="mb-4 flex items-center justify-center gap-2">
        {groupTab('A')}
        {groupTab('B')}
      </div>

      {/* Period selector + pay date */}
      <div className="mb-2 flex items-center justify-center gap-2">
        <Link href={`/crm/pay?g=${group}&p=${idx - 1}`} className="rounded-full border border-line px-3 py-1.5 text-sm text-stone hover:border-ink">‹ Prev</Link>
        <div className="min-w-[16rem] rounded-full border border-line bg-white px-4 py-1.5 text-center text-sm">
          <span className="text-ink">{payPeriodLabel(period)}</span>
          {isCurrent && <span className="ml-2 text-xs text-tulip">current</span>}
        </div>
        <Link
          href={`/crm/pay?g=${group}&p=${idx + 1}`}
          aria-disabled={isCurrent}
          className={'rounded-full border border-line px-3 py-1.5 text-sm ' + (isCurrent ? 'pointer-events-none opacity-30' : 'text-stone hover:border-ink')}
        >Next ›</Link>
      </div>
      <p className="mb-5 text-center text-xs text-stone">Thursday–Wednesday · paid {payDateLabel(period)}</p>

      {/* Headline totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total pay" value={usd(totals.total)} />
        <Kpi label="Hours" value={String(Math.round(totals.hours * 10) / 10)} />
        <Kpi label="Units" value={totals.units.toLocaleString('en-US')} />
        <Kpi label="People paid" value={String(active.length)} />
      </div>

      <div className="mb-4 flex justify-end">
        <PayExportButton rows={active} periodStart={period.start} periodEnd={period.end} payDate={period.payDate} group={group} />
      </div>

      {active.length === 0 ? (
        <Empty>No hours or units logged for Group {group} in this pay period yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Worker</Th>
              <Th>Hours</Th>
              <Th>Hourly $</Th>
              <Th>Units</Th>
              <Th>Unit $</Th>
              <Th>Total</Th>
            </tr>
          }
        >
          {active.map((r) => (
            <tr key={r.staff_id} className="hover:bg-blush/30">
              <Td>
                <div className="font-medium text-ink">{r.name}</div>
                <div className="text-xs text-stone">
                  {[r.hourly_rate != null ? `${usd(r.hourly_rate)}/hr` : null, r.unit_rate != null ? `${usd(r.unit_rate)}/unit` : null].filter(Boolean).join(' · ') || 'no rate set'}
                </div>
              </Td>
              <Td>{r.hours}</Td>
              <Td>{usd(r.hourlyPay)}</Td>
              <Td>{r.units.toLocaleString('en-US')}</Td>
              <Td>{usd(r.unitPay)}</Td>
              <Td><span className="font-medium tabular-nums text-ink">{usd(r.total)}</span></Td>
            </tr>
          ))}
          <tr className="border-t-2 border-line bg-blush/20 font-medium">
            <Td>Total</Td>
            <Td>{Math.round(totals.hours * 10) / 10}</Td>
            <Td>{usd(totals.hourlyPay)}</Td>
            <Td>{totals.units.toLocaleString('en-US')}</Td>
            <Td>{usd(totals.unitPay)}</Td>
            <Td><span className="tabular-nums text-ink">{usd(totals.total)}</span></Td>
          </tr>
        </Table>
      )}

      <p className="mt-4 text-center text-xs text-stone">
        Hourly base (from the time clock) plus per-unit piece rate (from the production log), for pay Group {group}. Set each worker’s rates and group on their Staff page. Export the CSV to run it through Gusto.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-stone">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-ink">{value}</p>
    </div>
  );
}
