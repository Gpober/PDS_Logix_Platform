import { bookedRevenueRollup, getCurrentProfile, type BookedRevenue } from '@/lib/crm/data';
import { getFinancials, iamcfoPortalUrl, type FinancialsResult } from '@/lib/crm/financials';
import { cashCalendarConfigured } from '@/lib/crm/cashCalendar';
import { getPeriod } from '@/lib/period';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { CashCalendar } from '@/components/crm/CashCalendar';

export const dynamic = 'force-dynamic';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const statusLabel: Record<string, string> = {
  pitched: 'Pitched',
  confirmed: 'Confirmed',
  live: 'Live',
  completed: 'Completed',
};

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'positive' | 'negative';
}) {
  const valueColor =
    tone === 'positive' ? 'text-[#5B8C5A]' : tone === 'negative' ? 'text-tulip' : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-white p-5 text-center">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className={`mt-2 font-display text-2xl ${valueColor}`}>{value}</div>
    </div>
  );
}

function BookedRevenueSection({ data }: { data: BookedRevenue }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-center font-display text-xl">Booked revenue</h2>
      <p className="mb-4 text-center text-sm text-stone">
        Rolled up from deal budgets in the CRM ({data.withBudget} of {data.dealCount} deals have a
        budget set).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Total booked" value={usd(data.total)} />
        {data.byStatus.map((b) => (
          <Stat key={b.status} label={statusLabel[b.status] ?? b.status} value={usd(b.amount)} />
        ))}
      </div>
    </section>
  );
}

function PnlSection({ result }: { result: FinancialsResult }) {
  if (result.status === 'not_configured') {
    return (
      <section>
        <h2 className="mb-3 text-center font-display text-xl">P&amp;L — from I AM CFO</h2>
        <Empty>
          Not connected yet. Set <code className="text-ink">IAMCFO_API_URL</code>,{' '}
          <code className="text-ink">IAMCFO_API_TOKEN</code> and{' '}
          <code className="text-ink">IAMCFO_ORG_SUBDOMAIN</code> (Tulips&rsquo; subdomain in I AM CFO)
          in the server environment to pull the books.
        </Empty>
      </section>
    );
  }

  if (result.status === 'error') {
    return (
      <section>
        <h2 className="mb-3 text-center font-display text-xl">P&amp;L — from I AM CFO</h2>
        <Empty>Couldn&rsquo;t load financials from I AM CFO — {result.message}</Empty>
      </section>
    );
  }

  const { data } = result;
  const pl = data.profitAndLoss;

  return (
    <section>
      <div className="mb-3 flex flex-col items-center gap-1 text-center">
        <h2 className="font-display text-xl">P&amp;L — from I AM CFO</h2>
        <span className="text-sm text-stone">
          {data.orgName}
          {data.subdomain ? ` (${data.subdomain})` : ''} · {data.period}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={usd(pl.revenue)} />
        <Stat label="Expenses" value={usd(pl.expenses)} />
        <Stat
          label="Net income"
          value={usd(pl.netIncome)}
          tone={pl.netIncome >= 0 ? 'positive' : 'negative'}
        />
        <Stat
          label="Net margin"
          value={`${pl.netMargin.toFixed(1)}%`}
          tone={pl.netIncome >= 0 ? 'positive' : 'negative'}
        />
      </div>
      <p className="mt-3 text-xs text-stone">
        Source: I AM CFO (org {data.orgId}). Current-month figures, refreshed on load.
      </p>
    </section>
  );
}

export default async function FinancialsPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Financials" />
        <Empty>Financials are owner/admin-only and aren&rsquo;t returned to your session.</Empty>
      </>
    );
  }

  const period = await getPeriod();
  const [booked, financials] = await Promise.all([
    bookedRevenueRollup(period),
    getFinancials(period),
  ]);

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-3xl">Financials</h1>
        <p className="-mt-2 text-xs text-stone">
          {period.label}
          {period.from ? ` · ${period.from} → ${period.to ?? '…'}` : ''}
        </p>
        <a
          href={iamcfoPortalUrl()}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip"
        >
          Open full books in I AM CFO ↗
        </a>
      </div>
      <BookedRevenueSection data={booked} />
      <PnlSection result={financials} />

      <section className="mt-10">
        <div className="mb-3 flex flex-col items-center gap-1 text-center">
          <h2 className="font-display text-xl">Cash calendar</h2>
          <span className="text-sm text-stone">
            Money in, due, and out — from Tulips&rsquo; books in I AM CFO, with real due and payment dates.
          </span>
        </div>
        {cashCalendarConfigured() ? (
          <CashCalendar />
        ) : (
          <Empty>
            Not connected yet — the cash calendar reads from I AM CFO using the same{' '}
            <code className="text-ink">IAMCFO_*</code> settings as the P&amp;L above.
          </Empty>
        )}
      </section>
    </>
  );
}
