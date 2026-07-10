import Link from 'next/link';
import { listCompanies, type CompanySort } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { CompaniesToolbar, SortHeader } from '@/components/crm/CompaniesToolbar';
import type { CompanyOverview } from '@/lib/crm/types';

const PAGE_SIZE = 12;

const TYPE_LABEL: Record<string, string> = { brand: 'Brand', agency: 'Agency', other: 'Other' };
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  prospect: 'bg-amber-100 text-amber-800',
  inactive: 'bg-stone/15 text-stone',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.active}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-stone">
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const view = sp.view === 'list' ? 'list' : 'cards';

  const { companies, total } = await listCompanies({
    search: sp.search ?? '',
    type: (sp.type as 'brand' | 'agency' | 'other') ?? '',
    status: (sp.status as 'active' | 'prospect' | 'inactive') ?? '',
    sortBy: (sp.sort as CompanySort) ?? 'name',
    sortOrder: sp.order === 'desc' ? 'desc' : 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(sp.search || sp.type || sp.status);

  return (
    <>
      <CrmHeader title="Companies" newHref="/crm/companies/new" newLabel="New company" />
      <p className="mb-4 -mt-3 text-center text-sm text-stone">
        {total} {total === 1 ? 'company' : 'companies'}
        {hasFilters ? ' matching filters' : ''}
      </p>

      <CompaniesToolbar />

      {companies.length === 0 ? (
        <Empty>{hasFilters ? 'No companies match these filters.' : 'No companies yet.'}</Empty>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr>
                <SortHeader label="Company" column="name" />
                <SortHeader label="Type" column="type" />
                <SortHeader label="Category" column="category" />
                <SortHeader label="Status" column="status" />
                <SortHeader label="Contacts" column="contact_count" />
                <SortHeader label="Bookings" column="deal_count" />
                <SortHeader label="Last booked" column="date_last_booked" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-blush/30">
                  <td className="border-t border-line px-4 py-3">
                    <Link href={`/crm/companies/${c.id}`} className="font-medium text-ink hover:text-tulip">
                      {c.name}
                    </Link>
                    {c.website && (
                      <div className="text-xs text-stone">{c.website.replace(/^https?:\/\//, '')}</div>
                    )}
                  </td>
                  <td className="border-t border-line px-4 py-3"><TypeBadge type={c.type} /></td>
                  <td className="border-t border-line px-4 py-3">{c.category ?? '—'}</td>
                  <td className="border-t border-line px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="border-t border-line px-4 py-3">{c.contact_count}</td>
                  <td className="border-t border-line px-4 py-3">{c.deal_count}</td>
                  <td className="border-t border-line px-4 py-3">{c.date_last_booked ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && <Pager page={page} totalPages={totalPages} params={sp} />}
    </>
  );
}

function CompanyCard({ company: c }: { company: CompanyOverview }) {
  return (
    <Link
      href={`/crm/companies/${c.id}`}
      className="block rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-medium text-ink">{c.name}</h3>
        <StatusBadge status={c.status} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TypeBadge type={c.type} />
        {c.category && <span className="text-xs text-stone">{c.category}</span>}
      </div>
      {c.website && (
        <p className="mb-3 truncate text-sm text-stone">{c.website.replace(/^https?:\/\//, '')}</p>
      )}
      <div className="flex items-center gap-4 border-t border-line pt-3 text-sm text-stone">
        <span>{c.contact_count} contacts</span>
        <span>{c.deal_count} bookings</span>
        {c.date_last_booked && <span className="ml-auto text-xs">Last: {c.date_last_booked}</span>}
      </div>
    </Link>
  );
}

function Pager({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | undefined>;
}) {
  const build = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== 'page') next.set(k, v);
    }
    next.set('page', String(p));
    return `/crm/companies?${next.toString()}`;
  };
  return (
    <div className="mt-6 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={build(page - 1)} className="rounded-full border border-line px-4 py-1.5 hover:border-ink">
          ← Prev
        </Link>
      ) : (
        <span className="rounded-full border border-line px-4 py-1.5 text-stone/50">← Prev</span>
      )}
      <span className="text-stone">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={build(page + 1)} className="rounded-full border border-line px-4 py-1.5 hover:border-ink">
          Next →
        </Link>
      ) : (
        <span className="rounded-full border border-line px-4 py-1.5 text-stone/50">Next →</span>
      )}
    </div>
  );
}
