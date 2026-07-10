import Link from 'next/link';
import { getCurrentProfile, listDeals, type DealListRow } from '@/lib/crm/data';
import { getPeriod } from '@/lib/period';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { DealsToolbar } from '@/components/crm/DealsToolbar';
import { SortHeader } from '@/components/crm/CompaniesToolbar';

const statusColor: Record<string, string> = {
  pitched: 'text-stone',
  confirmed: 'text-[#4A7C8C]',
  live: 'text-tulip',
  completed: 'text-[#5B8C5A]',
};

const statusBadge: Record<string, string> = {
  pitched: 'bg-stone/10 text-stone',
  confirmed: 'bg-[#4A7C8C]/10 text-[#4A7C8C]',
  live: 'bg-tulip/10 text-tulip',
  completed: 'bg-[#5B8C5A]/10 text-[#5B8C5A]',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge[status] ?? 'bg-stone/10 text-stone'}`}>
      {status}
    </span>
  );
}

const usd = (n: number) => `$${n.toLocaleString()}`;

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const period = await getPeriod();
  const [allDeals, profile] = await Promise.all([listDeals(period), getCurrentProfile()]);
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';

  const view = sp.view === 'list' ? 'list' : 'cards';
  const search = (sp.search ?? '').trim().toLowerCase();
  const statusFilter = sp.status ?? '';
  const sort = sp.sort ?? 'date';
  const order = sp.order ?? (sort === 'date' ? 'desc' : 'asc');
  const dir = order === 'asc' ? 1 : -1;

  // Filter + sort in memory over the period-loaded deals.
  let deals = allDeals;
  if (statusFilter) deals = deals.filter((d) => d.status === statusFilter);
  if (search)
    deals = deals.filter(
      (d) =>
        d.company_name.toLowerCase().includes(search) ||
        d.talent_name.toLowerCase().includes(search),
    );

  deals = [...deals].sort((a, b) => {
    if (sort === 'budget') {
      if (a.budget == null && b.budget == null) return 0;
      if (a.budget == null) return 1;
      if (b.budget == null) return -1;
      return (a.budget - b.budget) * dir;
    }
    if (sort === 'date') {
      if (!a.booking_date && !b.booking_date) return 0;
      if (!a.booking_date) return 1;
      if (!b.booking_date) return -1;
      return a.booking_date.localeCompare(b.booking_date) * dir;
    }
    const val = (d: DealListRow) =>
      sort === 'company' ? d.company_name : sort === 'talent' ? d.talent_name : d.status;
    return val(a).localeCompare(val(b)) * dir;
  });

  const hasFilters = Boolean(search || statusFilter);

  return (
    <>
      <CrmHeader title="Deals" newHref="/crm/deals/new" newLabel="New booking" />
      <p className="mb-4 -mt-3 text-center text-sm text-stone">
        {deals.length} {deals.length === 1 ? 'booking' : 'bookings'}
        {period.key !== 'all' ? ` · ${period.label.toLowerCase()}` : ''}
        {hasFilters ? ' matching filters' : ''}
      </p>

      <DealsToolbar showBudget={isOwner} />

      {deals.length === 0 ? (
        <Empty>{hasFilters ? 'No bookings match these filters.' : 'No bookings in this period.'}</Empty>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} isOwner={isOwner} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr>
                <SortHeader label="Company" column="company" />
                <SortHeader label="Talent" column="talent" />
                <SortHeader label="Date" column="date" />
                <SortHeader label="Status" column="status" />
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Live</th>
                {isOwner ? <SortHeader label="Budget" column="budget" /> : null}
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="hover:bg-blush/30">
                  <td className="border-t border-line px-4 py-3">
                    <Link href={`/crm/deals/${d.id}`} className="font-medium text-ink hover:text-tulip">
                      {d.company_name}
                    </Link>
                  </td>
                  <td className="border-t border-line px-4 py-3">{d.talent_name}</td>
                  <td className="border-t border-line px-4 py-3">{d.booking_date ?? '—'}</td>
                  <td className="border-t border-line px-4 py-3">
                    <span className={`capitalize ${statusColor[d.status] ?? ''}`}>{d.status}</span>
                  </td>
                  <td className="border-t border-line px-4 py-3">
                    {d.invoice_number ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#5B8C5A]/15 px-2 py-0.5 text-xs font-medium text-[#5B8C5A]">
                        ✓ {d.invoice_number}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="border-t border-line px-4 py-3">
                    {d.live_url ? (
                      <a href={d.live_url} target="_blank" rel="noreferrer" className="text-tulip">
                        View
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  {isOwner ? (
                    <td className="border-t border-line px-4 py-3">
                      {d.budget != null ? usd(d.budget) : '—'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isOwner && (
        <p className="mt-4 text-center text-sm text-stone">
          Budget is owner/admin-only and isn’t returned to your session.
        </p>
      )}
    </>
  );
}

function DealCard({ deal: d, isOwner }: { deal: DealListRow; isOwner: boolean }) {
  return (
    <Link
      href={`/crm/deals/${d.id}`}
      className="block rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-medium text-ink">
          {d.company_name} <span className="text-stone">→</span> {d.talent_name}
        </h3>
        <StatusBadge status={d.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone">
        <span>{d.booking_date ?? 'Date TBD'}</span>
        {d.invoice_number && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#5B8C5A]/15 px-2 py-0.5 text-xs font-medium text-[#5B8C5A]">
            ✓ {d.invoice_number}
          </span>
        )}
        {d.live_url && (
          <span className="text-tulip">Live ↗</span>
        )}
        {isOwner && d.budget != null && <span className="ml-auto font-medium text-ink">{usd(d.budget)}</span>}
      </div>
    </Link>
  );
}
