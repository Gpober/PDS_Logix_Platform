import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTalentBySlug, getPartnerships, getPublicTalentAccounts } from '@/lib/queries';
import { getInstagramStats } from '@/lib/crm/data';
import { formatCount, platformEntries, totalReach } from '@/lib/format';
import { platformIcon, platformLabel } from '@/lib/platforms';
import { Reveal } from '@/components/Reveal';
import { TalentInstagramStats } from '@/components/TalentInstagramStats';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const talent = await getTalentBySlug(slug);
  if (!talent) return { title: 'Talent' };
  return {
    title: talent.name,
    description: talent.bio ?? `${talent.name} — represented by Tulips Talent.`,
  };
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-xs uppercase tracking-wider text-ivory/50">{label}</p>
    </div>
  );
}

export default async function TalentProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const talent = await getTalentBySlug(slug);
  if (!talent) notFound();

  const [partnerships, accounts, igStats] = await Promise.all([
    getPartnerships(talent.id),
    getPublicTalentAccounts(talent.id),
    getInstagramStats(talent.id),
  ]);
  const platforms = platformEntries(talent.audience_stats);
  const reach = totalReach(talent.audience_stats);
  const firstName = talent.name.split(' ')[0];

  return (
    <>
      {/* ===== Magazine hero ===== */}
      <section className="relative w-full overflow-hidden bg-ink">
        <div className="grid lg:grid-cols-2">
          {/* Portrait */}
          <div className="relative aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-auto lg:min-h-[82vh]">
            {talent.headshot_url ? (
              <Image
                src={talent.headshot_url}
                alt={talent.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="kenburns object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-tulip/30 to-ink/50">
                <span className="font-display text-8xl text-ivory/25">{talent.name.charAt(0)}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-ink/50" />
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center px-6 py-12 text-ivory sm:px-12 lg:px-16 lg:py-16">
            <Link
              href="/roster"
              className="link-underline w-max text-sm text-ivory/60 hover:text-ivory"
            >
              ← Back to roster
            </Link>
            {talent.category && (
              <p className="mt-8 text-xs font-medium uppercase tracking-[0.3em] text-tulip">
                {talent.category}
              </p>
            )}
            <h1 className="mt-4 font-display text-[3.4rem] leading-[0.88] tracking-tight sm:text-8xl">
              {talent.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-ivory/70">
              {talent.handle && <span className="text-tulip">{talent.handle}</span>}
              {talent.location && <span>{talent.location}</span>}
            </div>

            {platforms.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-x-10 gap-y-6 border-t border-ivory/15 pt-8">
                {reach > 0 && <Stat value={formatCount(reach)} label="Total reach" />}
                {platforms.map(({ platform, count }) => (
                  <Stat key={platform} value={formatCount(count)} label={platform} />
                ))}
              </div>
            )}

            <Link
              href="/contact"
              className="mt-10 inline-block w-max rounded-full bg-ivory px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-tulip hover:text-ivory"
            >
              Book {firstName} →
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Bio ===== */}
      {talent.bio && (
        <section className="container-x mt-20 sm:mt-28">
          <Reveal>
            <p className="eyebrow">About</p>
            <p className="mt-5 max-w-3xl font-display text-2xl leading-[1.4] text-ink/90 sm:text-[2rem]">
              {talent.bio}
            </p>
          </Reveal>
        </section>
      )}

      {/* ===== Instagram media kit ===== */}
      {igStats && igStats.followers != null && (
        <section className="container-x mt-20 sm:mt-28">
          <Reveal>
            <p className="eyebrow">Instagram</p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl">
              {igStats.username ? `@${igStats.username}` : firstName} by the numbers
            </h2>
          </Reveal>
          <Reveal>
            <TalentInstagramStats stats={igStats} />
          </Reveal>
        </section>
      )}

      {/* ===== Media kit — where to find them ===== */}
      {accounts.length > 0 && (
        <section className="container-x mt-20 sm:mt-28">
          <Reveal>
            <p className="eyebrow">Media kit</p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl">Find {firstName} on</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a, i) => {
              const inner = (
                <>
                  <span className="text-2xl" aria-hidden>
                    {platformIcon(a.platform)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{platformLabel(a.platform)}</p>
                    {a.handle && <p className="truncate text-sm text-stone">{a.handle}</p>}
                  </div>
                  {a.followers != null && a.followers > 0 && (
                    <span className="ml-auto font-display text-lg text-ink">
                      {formatCount(Number(a.followers))}
                    </span>
                  )}
                </>
              );
              return (
                <Reveal key={a.id} delay={(i % 3) * 0.06}>
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 rounded-2xl border border-line bg-white/40 p-5 transition-colors hover:border-ink"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="flex items-center gap-4 rounded-2xl border border-line bg-white/40 p-5">
                      {inner}
                    </div>
                  )}
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Live partnerships ===== */}
      <section className="container-x mb-10 mt-20 sm:mt-28">
        <Reveal>
          <p className="eyebrow">Selected work</p>
          <h2 className="mt-2 font-display text-4xl sm:text-5xl">Live partnerships</h2>
        </Reveal>
        {partnerships.length > 0 ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {partnerships.map((p, i) => (
              <Reveal key={p.id} delay={(i % 3) * 0.07}>
                <a
                  href={p.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-white/40 p-5 transition-colors hover:border-ink"
                >
                  {p.brand_logo_url ? (
                    <Image
                      src={p.brand_logo_url}
                      alt={p.brand_name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blush font-display text-tulip">
                      {p.brand_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.brand_name}</p>
                    <p className="text-sm text-tulip group-hover:underline">View partnership →</p>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-stone">No public partnerships to show yet.</p>
        )}
      </section>
    </>
  );
}
