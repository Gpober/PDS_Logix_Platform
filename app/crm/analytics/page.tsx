import Link from 'next/link';
import { getCurrentProfile } from '@/lib/crm/data';
import { getSalesAnalytics, type NamedAmount } from '@/lib/crm/salesAnalytics';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { MatrixTable } from '@/components/crm/MatrixTable';

export const dynamic = 'force-dynamic';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function Stat({ label, value, sub, tone = 'ink' }: { label: string; value: string; sub?: string; tone?: 'ink' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-[#5B8C5A]' : tone === 'negative' ? 'text-tulip' : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-white p-5 text-center">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className={`mt-2 font-display text-2xl ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-stone">{sub}</div>}
    </div>
  );
}

function RankList({ items, tone = 'ink', empty }: { items: NamedAmount[]; tone?: string; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  if (items.length === 0) return <p className="text-center text-sm text-stone">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-line bg-white p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-ink">{it.name}</span>
            <span className="shrink-0 text-stone">{usd(it.amount)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
            <div className={tone} style={{ width: `${(it.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Analytics" />
        <Empty>Analytics are owner/admin-only and aren’t returned to your session.</Empty>
      </>
    );
  }

  const sp = await searchParams;
  const yearParam = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : undefined;
  const a = await getSalesAnalytics(yearParam);
  const maxMonth = Math.max(1, ...a.monthly.map((m) => m.amount));
  const io = a.inbound.amount + a.outbound.amount;
  const inboundPct = io > 0 ? (a.inbound.amount / io) * 100 : 0;

  return (
    <>
      <div className="mb-4 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-3xl">Analytics</h1>
        {/* Year picker (only years with booked deals) */}
        {a.availableYears.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {a.availableYears.map((y) => (
              <Link
                key={y}
                href={`/crm/analytics?year=${y}`}
                className={
                  'rounded-full border px-3 py-1 text-sm transition-colors ' +
                  (y === a.year ? 'border-ink bg-ink text-ivory' : 'border-line text-stone hover:border-ink')
                }
              >
                {y}
              </Link>
            ))}
          </div>
        )}
        <p className="text-xs text-stone">
          Deal value comes from CRM budgets (falling back to deal financials) ·{' '}
          <Link href="/crm/settings" className="text-tulip hover:underline">
            set targets
          </Link>
        </p>
      </div>

      {a.ytdAmount === 0 && (
        <p className="mx-auto mb-6 max-w-2xl rounded-xl border border-tulip/40 bg-blush/50 px-4 py-2.5 text-center text-sm text-tulip-dark">
          No deal values recorded in the CRM for {a.year} yet. Amounts fill in as bookings get a
          budget (and channel/source) set — the totals here reflect CRM data, not an external sheet.
        </p>
      )}

      {/* Year KPIs */}
      <section className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={`${a.year} deals secured`} value={usd(a.ytdAmount)} sub={`${a.ytdCount} deals`} />
          <Stat label={`${a.year} agency payout`} value={usd(a.ytdAgencyPayout)} tone="positive" />
          <Stat label="Deals booked" value={String(a.ytdCount)} />
          <Stat
            label="% of annual goal"
            value={a.pctOfGoal == null ? '—' : `${a.pctOfGoal.toFixed(1)}%`}
            sub={a.annualGoal ? `Goal ${usd(a.annualGoal)}` : 'Set a goal in Settings'}
          />
        </div>
      </section>

      {/* This-month callout (current year only) */}
      {a.isCurrentYear && (
        <section className="mb-8">
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
            <Stat
              label="This month secured"
              value={usd(a.monthAmount)}
              sub={`${a.monthCount} deal${a.monthCount === 1 ? '' : 's'}`}
            />
            <Stat
              label="vs monthly target"
              value={a.vsTarget == null ? '—' : `${a.vsTarget >= 0 ? '+' : ''}${usd(a.vsTarget)}`}
              sub={a.monthlyTarget ? `Target ${usd(a.monthlyTarget)}` : 'Set a target in Settings'}
              tone={a.vsTarget == null ? 'ink' : a.vsTarget >= 0 ? 'positive' : 'negative'}
            />
          </div>
        </section>
      )}

      {/* Goal progress */}
      {a.annualGoal ? (
        <section className="mb-10">
          <div className="h-4 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-tulip"
              style={{ width: `${Math.min(100, a.pctOfGoal ?? 0)}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs text-stone">
            {usd(a.ytdAmount)} of {usd(a.annualGoal)} annual goal
          </p>
        </section>
      ) : null}

      {/* Inbound vs Outbound */}
      <section className="mb-10">
        <h2 className="mb-3 text-center font-display text-xl">Inbound vs Outbound</h2>
        <div className="mx-auto max-w-2xl">
          <div className="flex h-5 w-full overflow-hidden rounded-full bg-line">
            <div className="bg-[#4A7C8C]" style={{ width: `${inboundPct}%` }} />
            <div className="bg-tulip" style={{ width: `${100 - inboundPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-[#4A7C8C]">
              Inbound {usd(a.inbound.amount)} ({io > 0 ? inboundPct.toFixed(1) : '0'}% · {a.inbound.count})
            </span>
            <span className="text-tulip">
              Outbound {usd(a.outbound.amount)} ({io > 0 ? (100 - inboundPct).toFixed(1) : '0'}% · {a.outbound.count})
            </span>
          </div>
          {a.unclassified.count > 0 && (
            <p className="mt-1 text-center text-xs text-stone">
              {a.unclassified.count} unclassified deal{a.unclassified.count === 1 ? '' : 's'} ({usd(a.unclassified.amount)}) — set a channel on the booking to include them.
            </p>
          )}
        </div>
      </section>

      {/* Monthly progress */}
      <section className="mb-10">
        <h2 className="mb-3 text-center font-display text-xl">Monthly progress</h2>
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex h-44 items-end gap-1.5">
            {a.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-36 w-full items-end">
                  <div
                    className="w-full rounded-t bg-tulip/80"
                    style={{ height: `${(m.amount / maxMonth) * 100}%` }}
                    title={usd(m.amount)}
                  />
                </div>
                <span className="text-[10px] text-stone">{m.label}</span>
              </div>
            ))}
          </div>
          {a.monthlyTarget ? (
            <p className="mt-3 text-center text-xs text-stone">
              Monthly target: {usd(a.monthlyTarget)}
            </p>
          ) : null}
        </div>
      </section>

      {/* Top producers */}
      <section className="mb-10">
        <h2 className="mb-3 text-center font-display text-xl">Top producers (YTD)</h2>
        <div className="mx-auto max-w-2xl">
          <RankList items={a.topProducers} tone="h-full bg-tulip" empty="No deals yet." />
        </div>
      </section>

      {/* A/R + A/P */}
      <section className="mb-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-1 text-center font-display text-xl">A/R by company</h2>
          <p className="mb-3 text-center text-xs text-stone">Invoiced, not yet completed</p>
          <RankList items={a.arByCompany} tone="h-full bg-[#5B8C5A]" empty="Nothing outstanding." />
        </div>
        <div>
          <h2 className="mb-1 text-center font-display text-xl">A/P by talent</h2>
          <p className="mb-3 text-center text-xs text-stone">Talent balances owed</p>
          <RankList items={a.apByTalent} tone="h-full bg-tulip" empty="Nothing owed." />
        </div>
      </section>

      {/* Source breakdown */}
      <section className="mb-10">
        <h2 className="mb-3 text-center font-display text-xl">By source (YTD)</h2>
        <div className="mx-auto max-w-2xl">
          <RankList items={a.bySource} tone="h-full bg-[#4A7C8C]" empty="No deals yet." />
        </div>
      </section>

      {/* Talent x month matrix */}
      <section className="mb-6">
        <h2 className="mb-3 text-center font-display text-xl">Talent × month</h2>
        {a.matrix.rows.length === 0 ? (
          <Empty>No booked deals this year yet.</Empty>
        ) : (
          <MatrixTable
            rows={a.matrix.rows}
            monthTotals={a.matrix.monthTotals}
            grandTotal={a.matrix.grandTotal}
          />
        )}
      </section>
    </>
  );
}
