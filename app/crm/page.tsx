import Link from 'next/link';
import {
  bookedRevenueRollup,
  getCollections,
  getCrmCounts,
  getCurrentProfile,
  listDeals,
  listLeads,
} from '@/lib/crm/data';
import { getFinancials } from '@/lib/crm/financials';
import { getPeriod } from '@/lib/period';
import { Empty, Table, Td, Th } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const statusColor: Record<string, string> = {
  pitched: 'text-stone',
  confirmed: 'text-[#4A7C8C]',
  live: 'text-tulip',
  completed: 'text-[#5B8C5A]',
};

function MetricCard({
  label,
  value,
  href,
  tone = 'ink',
}: {
  label: string;
  value: string;
  href?: string;
  tone?: 'ink' | 'positive' | 'negative';
}) {
  const valueColor =
    tone === 'positive' ? 'text-[#5B8C5A]' : tone === 'negative' ? 'text-tulip' : 'text-ink';
  const body = (
    <div className="rounded-2xl border border-line bg-white p-5 text-center transition-colors hover:border-ink">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className={`mt-2 font-display text-2xl ${valueColor}`}>{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function CrmDashboard() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  const period = await getPeriod();
  const [counts, booked, deals, leads, financials, collections] = await Promise.all([
    getCrmCounts(),
    bookedRevenueRollup(period),
    listDeals(period),
    listLeads(),
    isOwner ? getFinancials(period) : Promise.resolve(null),
    isOwner ? getCollections() : Promise.resolve(null),
  ]);
  const paidPct =
    collections && collections.invoiced > 0
      ? Math.round((collections.paid / collections.invoiced) * 100)
      : 0;

  const recentDeals = deals.slice(0, 5);
  const recentLeads = leads.slice(0, 5);
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const pl = financials && financials.status === 'ok' ? financials.data.profitAndLoss : null;

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl">Welcome back, {firstName}</h1>
        <p className="text-sm text-stone">Here&rsquo;s the state of the agency today.</p>
      </div>

      {/* Owner/admin financial snapshot */}
      {isOwner && (
        <section className="mb-8">
          <div className="mb-3 text-center">
            <h2 className="font-display text-lg">Financial snapshot</h2>
            <p className="text-xs text-stone">
              {period.label}
              {period.from ? ` · ${period.from} → ${period.to ?? '…'}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Booked revenue" value={usd(booked.total)} href="/crm/financials" />
            {pl ? (
              <>
                <MetricCard label="Revenue (mo.)" value={usd(pl.revenue)} href="/crm/financials" />
                <MetricCard
                  label="Net income (mo.)"
                  value={usd(pl.netIncome)}
                  tone={pl.netIncome >= 0 ? 'positive' : 'negative'}
                  href="/crm/financials"
                />
                <MetricCard
                  label="Net margin"
                  value={`${pl.netMargin.toFixed(1)}%`}
                  tone={pl.netIncome >= 0 ? 'positive' : 'negative'}
                  href="/crm/financials"
                />
              </>
            ) : (
              <MetricCard label="P&L" value="See financials" href="/crm/financials" />
            )}
          </div>
        </section>
      )}

      {/* Owner/admin collections: owed vs paid */}
      {isOwner && collections && (
        <section className="mb-8">
          <h2 className="mb-3 text-center font-display text-lg">Collections</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MetricCard label="Owed to us" value={usd(collections.owed)} tone="negative" href="/crm/deals" />
            <MetricCard label="Paid" value={usd(collections.paid)} tone="positive" href="/crm/deals" />
            <MetricCard label="Invoiced total" value={usd(collections.invoiced)} href="/crm/deals" />
          </div>
          {collections.invoiced > 0 && (
            <div className="mx-auto mt-5 max-w-2xl">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-line">
                <div className="bg-[#5B8C5A]" style={{ width: `${paidPct}%` }} />
                <div className="bg-tulip" style={{ width: `${100 - paidPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-stone">
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#5B8C5A]" />
                  Paid {usd(collections.paid)} ({paidPct}%)
                </span>
                <span>
                  Owed {usd(collections.owed)} ({100 - paidPct}%)
                  <span className="ml-1 inline-block h-2 w-2 rounded-full bg-tulip" />
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Entity counts */}
      <section className="mb-8">
        <h2 className="mb-3 text-center font-display text-lg">At a glance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Companies" value={String(counts.companies)} href="/crm/companies" />
          <MetricCard label="Contacts" value={String(counts.contacts)} href="/crm/companies" />
          <MetricCard label="Talent" value={String(counts.talent)} href="/crm/talent" />
          <MetricCard label="Deals" value={String(counts.deals)} href="/crm/deals" />
          <MetricCard label="Leads" value={String(counts.leads)} href="/crm/leads" />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent deals */}
        <section>
          <div className="mb-3 flex flex-col items-center gap-1 text-center">
            <h2 className="font-display text-lg">Recent bookings</h2>
            <Link href="/crm/deals" className="text-sm text-tulip hover:underline">
              View all
            </Link>
          </div>
          {recentDeals.length === 0 ? (
            <Empty>No bookings yet.</Empty>
          ) : (
            <Table
              head={
                <tr>
                  <Th>Company → Talent</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                </tr>
              }
            >
              {recentDeals.map((d) => (
                <tr key={d.id} className="hover:bg-blush/30">
                  <Td>
                    <Link href={`/crm/deals/${d.id}`} className="font-medium hover:text-tulip">
                      {d.company_name} → {d.talent_name}
                    </Link>
                  </Td>
                  <Td>{d.booking_date ?? '—'}</Td>
                  <Td>
                    <span className={`capitalize ${statusColor[d.status] ?? ''}`}>{d.status}</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </section>

        {/* Recent leads */}
        <section>
          <div className="mb-3 flex flex-col items-center gap-1 text-center">
            <h2 className="font-display text-lg">Recent leads</h2>
            <Link href="/crm/leads" className="text-sm text-tulip hover:underline">
              View all
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <Empty>No leads yet.</Empty>
          ) : (
            <Table
              head={
                <tr>
                  <Th>Date</Th>
                  <Th>Name</Th>
                  <Th>Company</Th>
                </tr>
              }
            >
              {recentLeads.map((l) => (
                <tr key={l.id} className="hover:bg-blush/30">
                  <Td>{l.created_at.slice(0, 10)}</Td>
                  <Td>{l.name}</Td>
                  <Td>{l.company ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
