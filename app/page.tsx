import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const services = [
  {
    title: 'Condition Reports',
    blurb:
      'Fast, photo-documented vehicle inspections with itemized damage findings — ready for remarketing, returns, and claims.',
    points: ['VIN-level documentation', 'Damage severity + cost estimates', 'Photo evidence on every unit'],
  },
  {
    title: 'Detailing',
    blurb:
      'Professional reconditioning that turns inventory around quickly — interior, exterior, and full recon packages.',
    points: ['Lot-ready turnaround', 'Interior & exterior recon', 'Volume pricing for fleets'],
  },
  {
    title: 'Biohazard',
    blurb:
      'Certified decontamination and remediation for vehicles requiring specialized cleanup, handled safely and discreetly.',
    points: ['Certified technicians', 'Safe disposal & documentation', 'Discreet, rapid response'],
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-line bg-white">
          <div className="container-x grid gap-10 py-20 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <p className="eyebrow">Vehicle services, documented</p>
              <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
                Condition reports, detailing &amp; biohazard —{' '}
                <span className="text-pds-dark">done right, documented every time.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-stone">
                PDS Logix keeps dealerships, fleets, rental companies, and insurers moving with
                fast turnaround and a clean paper trail on every vehicle.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="rounded-full bg-ink px-6 py-3 text-white transition-colors hover:bg-steel"
                >
                  Request a quote
                </Link>
                <Link
                  href="/#services"
                  className="rounded-full border border-line px-6 py-3 transition-colors hover:border-ink"
                >
                  See services
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-line bg-base p-8">
              <div className="grid grid-cols-2 gap-4 text-center">
                {[
                  ['24–48h', 'Typical turnaround'],
                  ['100%', 'Photo documented'],
                  ['3', 'Service lines'],
                  ['Certified', 'Biohazard techs'],
                ].map(([big, small]) => (
                  <div key={small} className="rounded-2xl bg-white p-5">
                    <div className="font-display text-2xl text-ink">{big}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-stone">{small}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="container-x py-20">
          <p className="eyebrow text-center">What we do</p>
          <h2 className="mt-3 text-center font-display text-3xl">Three service lines, one partner</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {services.map((s) => (
              <div key={s.title} className="rounded-3xl border border-line bg-white p-7">
                <h3 className="font-display text-xl">{s.title}</h3>
                <p className="mt-3 text-sm text-stone">{s.blurb}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pds" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-line bg-steel">
          <div className="container-x flex flex-col items-center gap-5 py-16 text-center text-white">
            <h2 className="font-display text-3xl">Ready to move more vehicles?</h2>
            <p className="max-w-xl text-mist">
              Tell us your volume and locations and we&apos;ll put together a quote.
            </p>
            <Link
              href="/contact"
              className="rounded-full bg-pds px-6 py-3 font-medium text-ink transition-colors hover:bg-pds-dark"
            >
              Request a quote
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
