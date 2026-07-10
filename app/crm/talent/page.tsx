import Link from 'next/link';
import { listTalentBrowse, talentCategories, type TalentSort } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { TalentToolbar } from '@/components/crm/TalentToolbar';
import { SortHeader } from '@/components/crm/CompaniesToolbar';
import type { Talent } from '@/lib/crm/types';

export default async function TalentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'cards';

  const [talent, categories] = await Promise.all([
    listTalentBrowse({
      search: sp.search ?? '',
      category: sp.category ?? '',
      sortBy: (sp.sort as TalentSort) ?? 'name',
      sortOrder: sp.order === 'desc' ? 'desc' : 'asc',
    }),
    talentCategories(),
  ]);

  const hasFilters = Boolean(sp.search || sp.category);

  return (
    <>
      <CrmHeader title="Talent" newHref="/crm/talent/new" newLabel="New talent" />
      <p className="mb-4 -mt-3 text-center text-sm text-stone">
        {talent.length} {talent.length === 1 ? 'creator' : 'creators'}
        {hasFilters ? ' matching filters' : ''}
      </p>

      <TalentToolbar categories={categories} />

      {talent.length === 0 ? (
        <Empty>{hasFilters ? 'No talent match these filters.' : 'No talent yet.'}</Empty>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {talent.map((t) => (
            <TalentCard key={t.id} talent={t} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
              <tr>
                <SortHeader label="Talent" column="name" />
                <SortHeader label="Handle" column="handle" />
                <SortHeader label="Category" column="category" />
              </tr>
            </thead>
            <tbody>
              {talent.map((t) => (
                <tr key={t.id} className="hover:bg-blush/30">
                  <td className="border-t border-line px-4 py-3">
                    <Link
                      href={`/crm/talent/${t.id}`}
                      className="flex items-center gap-3 font-medium text-ink hover:text-tulip"
                    >
                      <Avatar src={t.headshot_url} name={t.name} />
                      {t.name}
                    </Link>
                  </td>
                  <td className="border-t border-line px-4 py-3">{t.handle ?? '—'}</td>
                  <td className="border-t border-line px-4 py-3">{t.category ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TalentCard({ talent: t }: { talent: Talent }) {
  return (
    <Link
      href={`/crm/talent/${t.id}`}
      className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
    >
      <Avatar src={t.headshot_url} name={t.name} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{t.name}</p>
        {t.handle && <p className="truncate text-sm text-stone">{t.handle}</p>}
        {t.category && (
          <span className="mt-1 inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-stone">
            {t.category}
          </span>
        )}
      </div>
    </Link>
  );
}

// Small CRM thumbnail. Plain <img> (not next/image) so any headshot host works
// without remote-pattern config; falls back to the initial when unset.
function Avatar({ src, name, size = 'sm' }: { src: string | null; name: string; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-sm';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className={`${dim} shrink-0 rounded-full border border-line object-cover`}
      />
    );
  }
  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-blush font-display text-tulip`}
    >
      {name.charAt(0)}
    </span>
  );
}
