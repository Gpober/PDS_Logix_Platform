import Link from 'next/link';
import type { Metadata } from 'next';
import { getRoster, getCategories } from '@/lib/queries';
import { TalentCard } from '@/components/TalentCard';
import { Reveal } from '@/components/Reveal';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Our Talent',
  description: 'Meet the Tulips Talent roster of creators across beauty, wellness, fashion, men’s lifestyle and travel.',
};

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = category ?? 'All';
  const [talent, categories] = await Promise.all([
    getRoster(active === 'All' ? undefined : active),
    getCategories(),
  ]);

  const filters = ['All', ...categories];

  return (
    <>
      {/* Editorial header */}
      <section className="container-x pt-20 sm:pt-28">
        <p className="eyebrow">Our Talent</p>
        <h1 className="mt-4 font-display text-[3.6rem] leading-[0.9] tracking-tight sm:text-8xl">
          Meet the <span className="italic text-tulip">Talent</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-stone">
          A hand-picked roster of creators across beauty, wellness, fashion, men&apos;s lifestyle
          and travel — each represented with intention. Filter to find the face that fits your brief.
        </p>

        {/* Category filter */}
        <div className="mt-10 flex flex-wrap gap-2">
          {filters.map((cat) => {
            const isActive = cat === active;
            const href = cat === 'All' ? '/roster' : `/roster?category=${encodeURIComponent(cat)}`;
            return (
              <Link
                key={cat}
                href={href}
                className={
                  'rounded-full border px-4 py-2 text-sm transition-colors ' +
                  (isActive
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-line text-stone hover:border-ink hover:text-ink')
                }
              >
                {cat}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Grid */}
      <section className="container-x mt-12">
        {talent.length > 0 ? (
          <>
            <p className="mb-6 text-sm text-stone">
              {talent.length} {talent.length === 1 ? 'creator' : 'creators'}
              {active !== 'All' ? ` in ${active}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
              {talent.map((t, i) => (
                <Reveal key={t.id} delay={(i % 4) * 0.06}>
                  <TalentCard talent={t} />
                </Reveal>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-6 text-stone">
            No public talent yet. Flag talent as <code>is_public</code> in the CRM to feature them
            here.
          </p>
        )}
      </section>
    </>
  );
}
