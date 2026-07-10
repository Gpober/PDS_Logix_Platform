import Link from 'next/link';
import { getPublicBrands, getFeaturedTalent, getRoster, getSiteImageUrl } from '@/lib/queries';
import { BrandWall } from '@/components/BrandWall';
import { Reveal } from '@/components/Reveal';
import { ImageSlot } from '@/components/ImageSlot';

export const revalidate = 60;

const VERTICALS = ['Beauty', 'Wellness', 'Fashion', 'Lifestyle', 'Home', "Men's", 'Travel'];

const PILLARS = [
  {
    n: '01',
    title: 'Strategic Brand Alignment',
    body: "We prioritize brands that align with each creator's audience, values, and long-term goals.",
  },
  {
    n: '02',
    title: 'Performance & Profitability',
    body: 'Every collaboration is designed to drive tangible ROI — whether through affiliate sales, content performance, or brand equity.',
  },
  {
    n: '03',
    title: 'Partnership Transparency',
    body: 'We believe creators deserve full visibility into their opportunities, earnings, and growth. Our communication is open, honest, and empowering.',
  },
];

const RESULTS = [
  { stat: '$1M+', label: 'in brand deals booked in a single quarter with fewer than 25 talent' },
  { stat: '400%', label: 'average creator income growth within six months of signing' },
  { stat: '30–40%', label: 'of partner brands’ monthly revenue driven by Tulips-managed talent' },
];

const TESTIMONIALS = [
  {
    quote: 'A partnership rooted in trust.',
    body: 'Tulips Talent truly redefined how I work with brands. Their transparency, communication, and strategy have helped me grow both creatively and financially. Every deal feels thoughtful and aligned with my long-term goals.',
    name: 'Kerrissa Fernandez',
  },
  {
    quote: 'They see your potential before anyone else does.',
    body: "From my first call, I felt supported and understood. The team doesn't just manage — they mentor. Thanks to their negotiation expertise, I've secured partnerships that perfectly match my audience and vision.",
    name: 'Shannon Thomas',
  },
  {
    quote: 'Professionalism with a personal touch.',
    body: 'Working with Tulips Talent feels like being part of a family that genuinely wants you to win. They handle every detail with integrity, care, and precision — allowing me to focus on creating while they handle the rest.',
    name: 'Ashley Provost',
  },
];

export default async function HomePage() {
  const brands = await getPublicBrands();
  const [heroUrl, missionUrl, aboutUrl, whyUrl, closingUrl] = await Promise.all([
    getSiteImageUrl('hero'),
    getSiteImageUrl('mission'),
    getSiteImageUrl('about'),
    getSiteImageUrl('why'),
    getSiteImageUrl('closing'),
  ]);
  // Prefer explicitly featured talent; fall back to the roster so the homepage
  // is never empty once creators are published.
  const featured = await getFeaturedTalent(6);
  const previewTalent = (featured.length > 0 ? featured : await getRoster()).slice(0, 6);

  return (
    <>
      {/* ===== 6.1 Hero ===== */}
      <section className="relative w-full">
        <ImageSlot
          label="Hero background — soft, editorial, on-brand (blush tones, florals, or a striking creator / lifestyle image)"
          ratio="min-h-[88vh]"
          rounded="rounded-none"
          priority
          className="w-full"
          src={heroUrl}
          alt="Tulips Talent"
          sizes="100vw"
          quality={95}
          imgClassName="saturate-[1.1] contrast-[1.05]"
        />
        {/* Dark left-biased scrim so the light headline stays legible over the
            busy photo, then clears toward the right to keep the image rich. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/75 from-0% via-ink/35 via-45% to-transparent to-80%" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent to-40%" />
        <div className="absolute inset-0 flex items-center">
          <div className="container-x">
            <div className="max-w-2xl [text-shadow:0_2px_24px_rgba(26,24,22,0.45)]">
              <p className="rise rise-1 text-xs font-medium uppercase tracking-[0.3em] text-blush">
                Helping Talent Blossom 🌷
              </p>
              <h1 className="rise rise-2 mt-5 font-display text-[2.9rem] leading-[1.02] tracking-tight text-ivory sm:text-7xl">
                Empowering creators to <span className="italic text-tulip">blossom</span> with
                intention
              </h1>
              <p className="rise rise-3 mt-6 max-w-xl text-lg text-ivory/85 sm:text-xl">
                We help creators grow with integrity, creativity, and strategic partnerships that
                deliver measurable, lasting success.
              </p>
              <Link
                href="/contact"
                className="rise rise-4 mt-9 inline-block rounded-full bg-ivory px-7 py-4 text-sm font-medium text-ink shadow-lg transition-colors hover:bg-tulip hover:text-ivory [text-shadow:none]"
              >
                Apply To Be Represented Today
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Marquee ===== */}
      <div className="overflow-hidden border-y border-line bg-blush/50 py-5">
        <div className="flex w-max animate-marquee items-center gap-12 whitespace-nowrap pr-12 font-display text-2xl text-ink/70 sm:text-3xl">
          {[...VERTICALS, ...VERTICALS].map((v, i) => (
            <span key={i} className="flex items-center gap-12">
              {v}
              <span className="text-tulip">🌷</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== 6.2 Our Mission ===== */}
      <section className="container-x mt-24 sm:mt-32">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <ImageSlot
              label="Mission accent image / Tulips logomark — soft supporting image beside the text"
              ratio="aspect-[4/3]"
              src={missionUrl}
              alt="Life at Tulips Talent"
              sizes="(max-width: 1024px) 100vw, 600px"
              quality={90}
            />
          </Reveal>
          <Reveal delay={0.08}>
            <div>
              <p className="eyebrow">Our Mission</p>
              <h2 className="mt-3 font-display text-4xl leading-[1.08] sm:text-5xl">
                Helping talent <span className="italic text-tulip-dark">blossom.</span>
              </h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink/85">
                <p>
                  Tulips Talent is a boutique creator management and partnership agency dedicated to
                  helping talent blossom. Through strategic partnerships, transparent communication,
                  and unparalleled negotiation, we empower creators to grow their careers with
                  integrity, creativity, and measurable results.
                </p>
                <p>
                  Our mission is to redefine what it means to be a modern creator — where art meets
                  analytics, and every collaboration drives impact.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 6.3 About Us ===== */}
      <section id="about" className="container-x mt-24 scroll-mt-24 sm:mt-32">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal delay={0.08} className="lg:order-2">
            <ImageSlot
              label="About feature image — editorial / team / brand image (portrait or landscape)"
              ratio="aspect-[4/5]"
              src={aboutUrl}
              alt="About Tulips Talent"
              sizes="(max-width: 1024px) 100vw, 600px"
              quality={90}
            />
          </Reveal>
          <Reveal className="lg:order-1">
            <div>
              <p className="eyebrow">About Us</p>
              <h2 className="mt-3 font-display text-4xl leading-[1.08] sm:text-5xl">
                Where influence meets <span className="italic text-tulip-dark">intention.</span>
              </h2>
              <div className="mt-6 space-y-4 leading-relaxed text-ink/85">
                <p>
                  Tulips Talent is where influence meets intention. We represent a curated roster of
                  influential voices across lifestyle, beauty, home, and fashion — uniting
                  authenticity with performance. Every partnership is thoughtfully crafted, every
                  opportunity is backed by strategy, and every creator is supported with hands-on,
                  transparent management.
                </p>
                <p>
                  Our team has built a reputation for elite negotiation, industry-leading
                  transparency, and exceptional brand relationships. We don&apos;t just sign deals —
                  we secure meaningful, long-term partnerships that elevate our talent and exceed
                  brand expectations.
                </p>
                <p>
                  Tulips Talent operates with the sophistication of a global agency and the care of a
                  boutique firm. Every conversation, contract, and collaboration is rooted in
                  honesty, trust, and results.
                </p>
              </div>
              <Link
                href="/contact"
                className="mt-8 inline-block rounded-full border border-ink/20 px-6 py-3 text-sm transition-colors hover:border-ink"
              >
                Get in Touch
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 6.4 Who Our Talent Are ===== */}
      <section className="container-x mt-24 sm:mt-32">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">Who Our Talent Are</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] sm:text-6xl">
              Influence, converted to <span className="italic text-tulip-dark">impact.</span>
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink/85">
              <p>
                Tulips Talent represents a collective of high-performing creators, storytellers, and
                entrepreneurs who convert influence into impact.
              </p>
              <p>
                Our talent are known for more than their following — they&apos;re trusted by their
                audiences and respected by brands for their consistency, professionalism, and
                authenticity.
              </p>
              <p>
                From viral TikTok creators to powerhouse LTK sellers and seasoned affiliate experts,
                Tulips Talent creators represent excellence across every vertical. They&apos;re
                ambitious, brand-safe, and backed by a team committed to helping them blossom.
              </p>
            </div>
            <Link
              href="/contact"
              className="mt-8 inline-block rounded-full border border-ink/20 px-6 py-3 text-sm transition-colors hover:border-ink"
            >
              Contact Us
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ===== 6.5 Talent Preview ===== */}
      <section className="container-x mt-20 sm:mt-28">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl sm:text-4xl">Some of our talent</h2>
            <Link href="/roster" className="link-underline text-sm text-stone">
              View full roster →
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-3">
          {previewTalent.map((t, i) => (
            <Reveal key={t.id} delay={(i % 3) * 0.07}>
              <Link
                href={t.slug ? `/talent/${t.slug}` : '/roster'}
                className="group block"
              >
                <ImageSlot
                  label={`${t.name} — headshot`}
                  ratio="aspect-[4/5]"
                  src={t.headshot_url}
                  alt={t.name}
                  className="transition-transform duration-500 group-hover:-translate-y-1"
                />
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg">{t.name}</h3>
                  {t.category && (
                    <span className="text-sm text-tulip group-hover:underline">
                      {t.category}
                    </span>
                  )}
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mt-12 text-center">
            <Link
              href="/roster"
              className="inline-block rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-ivory transition-colors hover:bg-tulip"
            >
              View Full Roster →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ===== 6.6 Our Strategy ===== */}
      <section id="strategy" className="mt-28 scroll-mt-24 sm:mt-36">
        <div className="container-x">
          <Reveal>
            <div className="max-w-3xl">
              <p className="eyebrow">Our Strategy</p>
              <h2 className="mt-3 font-display text-4xl leading-[1.08] sm:text-6xl">
                Strategy is <span className="italic text-tulip-dark">everything.</span>
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-ink/85">
                At Tulips Talent, strategy is everything. We blend data-backed insights,
                relationship-first management, and negotiation mastery to ensure that every
                partnership serves a purpose. Our success model is built on three pillars:
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.08} className="h-full">
                <div className="flex h-full flex-col bg-ivory p-8 sm:p-10">
                  <span className="font-display text-4xl text-tulip">{p.n}</span>
                  <h3 className="mt-5 font-display text-2xl">{p.title}</h3>
                  <p className="mt-3 leading-relaxed text-ink/80">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <p className="max-w-3xl text-lg italic leading-relaxed text-stone">
                Behind every partnership is a detailed process of research, relationship-building,
                and negotiation — ensuring creators are paid what they&apos;re worth and brands see
                the impact they invest in.
              </p>
              <Link
                href="/contact"
                className="inline-block w-max rounded-full border border-ink/20 px-6 py-3 text-sm transition-colors hover:border-ink"
              >
                Contact Us
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 6.7 Our Results ===== */}
      <section className="container-x mt-28 sm:mt-36">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-7 py-20 text-ivory sm:px-16 sm:py-24">
            <span className="pointer-events-none absolute -right-8 -top-16 font-display text-[16rem] leading-none text-ivory/[0.05] sm:text-[22rem]">
              🌷
            </span>
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-tulip">Our Results</p>
              <h2 className="mt-3 max-w-2xl font-display text-4xl leading-[1.08] sm:text-5xl">
                The results speak for <span className="italic text-tulip">themselves.</span>
              </h2>

              <div className="mt-14 grid gap-10 sm:grid-cols-3">
                {RESULTS.map((r) => (
                  <div key={r.stat}>
                    <p className="font-display text-5xl text-ivory sm:text-6xl">{r.stat}</p>
                    <p className="mt-3 text-sm leading-relaxed text-ivory/70">{r.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-10 max-w-3xl text-ivory/70">
                Plus proven success in driving retail and DTC traffic through integrated influencer
                strategies.
              </p>

              <div className="mt-12 max-w-3xl space-y-4 border-t border-ivory/15 pt-8 leading-relaxed text-ivory/80">
                <p>
                  But beyond numbers, our greatest result is the trust we&apos;ve built — with
                  creators who feel empowered, brands who return year after year, and a team that
                  continues to raise the bar for what partnership should look like.
                </p>
                <p className="font-display text-xl text-ivory">
                  Tulips Talent isn&apos;t just an agency. It&apos;s a movement built on purpose,
                  partnership, and the belief that with the right support, every creator can blossom.
                  🌷
                </p>
              </div>
              <Link
                href="/contact"
                className="mt-10 inline-block rounded-full bg-ivory px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-tulip hover:text-ivory"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== 6.8 Why We're Different ===== */}
      <section className="container-x mt-28 sm:mt-36">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <ImageSlot
              label="Why We're Different — on-brand lifestyle or team image"
              ratio="aspect-[4/5]"
              src={whyUrl}
              alt="Why Tulips Talent is different"
              sizes="(max-width: 1024px) 100vw, 600px"
              quality={90}
            />
          </Reveal>
          <Reveal delay={0.08}>
            <div>
              <p className="eyebrow">Why We&apos;re Different</p>
              <h2 className="mt-3 font-display text-4xl leading-[1.08] sm:text-5xl">
                Transparency builds <span className="italic text-tulip-dark">trust.</span>
              </h2>
              <div className="mt-6 space-y-4 leading-relaxed text-ink/85">
                <p>
                  What sets Tulips Talent apart is our integrity, negotiation strength, and human
                  approach. We believe that transparency builds trust — and trust builds longevity.
                  Our creators know where every dollar comes from, how every opportunity is
                  structured, and what it means for their growth.
                </p>
                <p>
                  Unlike traditional agencies, we&apos;re deeply embedded in both the brand and
                  creator sides of the industry. That dual expertise gives us an unmatched ability to
                  negotiate premium rates, secure long-term retainers, and turn influencer
                  relationships into scalable revenue streams.
                </p>
                <p>
                  We are not just management — we are partners in our creators&apos; evolution.
                  Through personalized guidance, brand strategy, and unwavering advocacy, we ensure
                  every client feels seen, supported, and celebrated.
                </p>
              </div>
              <Link
                href="/contact"
                className="mt-8 inline-block rounded-full border border-ink/20 px-6 py-3 text-sm transition-colors hover:border-ink"
              >
                Get in Touch
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 6.9 Testimonials ===== */}
      <section className="container-x mt-28 sm:mt-36">
        <Reveal>
          <p className="eyebrow">Testimonials</p>
          <h2 className="mt-3 font-display text-4xl sm:text-6xl">In their words</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 0.08}>
              <figure className="flex h-full flex-col rounded-3xl bg-blush/60 p-8">
                <p className="font-display text-2xl leading-snug text-ink">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <blockquote className="mt-5 flex-1 leading-relaxed text-ink/80">{t.body}</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <ImageSlot
                    label={`${t.name}`}
                    ratio="aspect-square"
                    rounded="rounded-full"
                    className="h-11 w-11 shrink-0"
                  />
                  <span className="text-sm font-medium">— {t.name}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== Brands ===== */}
      {brands.length > 0 && (
        <section className="container-x mt-28 sm:mt-36">
          <Reveal>
            <p className="eyebrow">Trusted by</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">The brands they build with</h2>
            <div className="mt-12">
              <BrandWall brands={brands.slice(0, 10)} />
            </div>
          </Reveal>
        </section>
      )}

      {/* ===== 6.10 Closing CTA ===== */}
      <section className="mt-28 sm:mt-36">
        <div className="relative w-full">
          <ImageSlot
            label="Full-width closing banner — strong, warm, editorial. The final impression before the footer."
            ratio="min-h-[60vh]"
            rounded="rounded-none"
            className="w-full"
            src={closingUrl}
            alt="Ready to blossom with Tulips Talent"
            sizes="100vw"
            quality={92}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/25 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="container-x pb-14 sm:pb-20">
              <Reveal>
                <h2 className="max-w-2xl font-display text-4xl leading-[1.05] text-ivory sm:text-7xl">
                  Ready to blossom with us? 🌷
                </h2>
                <Link
                  href="/contact"
                  className="mt-8 inline-block rounded-full bg-ivory px-8 py-4 text-sm font-medium text-ink transition-colors hover:bg-tulip hover:text-ivory"
                >
                  Get in Touch
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
